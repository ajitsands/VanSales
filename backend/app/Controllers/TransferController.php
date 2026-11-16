<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Models\InventoryModel;
use Throwable;

class TransferController
{
    private static function ensureTransferSellingPriceColumn(\PDO $pdo): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }
        $col = $pdo->query("SHOW COLUMNS FROM stock_transfer_lines LIKE 'selling_price'")->fetch();
        if (!$col) {
            $pdo->exec("ALTER TABLE stock_transfer_lines ADD COLUMN selling_price DECIMAL(12,3) NULL AFTER unit_cost");
        }
        $checked = true;
    }

    private static function ensureRequestStatusColumn(\PDO $pdo): void
    {
        try {
            $col = $pdo->query("SHOW COLUMNS FROM van_item_requests LIKE 'status'")->fetch();
            if ($col && stripos((string)($col['Type'] ?? ''), 'enum(') === 0) {
                $pdo->exec("ALTER TABLE van_item_requests MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending'");
            }
        } catch (Throwable $e) {
            // ignore if already compatible
        }
    }

    private static function syncRequestStatus(\PDO $pdo, int $vendorId, int $requestId, ?int $reviewerId = null): string
    {
        self::ensureRequestStatusColumn($pdo);
        $stmt = $pdo->prepare("SELECT * FROM van_item_requests WHERE id = ? AND vendor_id = ? LIMIT 1");
        $stmt->execute([$requestId, $vendorId]);
        $row = $stmt->fetch();
        if (!$row) {
            return 'pending';
        }
        if ($row['status'] === 'cancelled') {
            return 'cancelled';
        }

        $items = json_decode($row['items_json'], true) ?: [];
        $tStmt = $pdo->prepare("
            SELECT t.status AS transfer_status, l.item_id, SUM(l.qty) AS total_qty
            FROM stock_transfers t
            INNER JOIN stock_transfer_lines l ON l.transfer_id = t.id
            WHERE t.vendor_id = ? AND t.request_id = ?
            GROUP BY t.status, l.item_id
        ");
        $tStmt->execute([$vendorId, $requestId]);
        $itemMap = [];
        foreach ($tStmt->fetchAll() as $tr) {
            $iid = (int)$tr['item_id'];
            if (!isset($itemMap[$iid])) {
                $itemMap[$iid] = ['received' => 0.0, 'ready' => 0.0];
            }
            if ($tr['transfer_status'] === 'completed') {
                $itemMap[$iid]['received'] += (float)$tr['total_qty'];
            } elseif ($tr['transfer_status'] === 'pending_confirm') {
                $itemMap[$iid]['ready'] += (float)$tr['total_qty'];
            }
        }

        $hasBalance = false;
        $totalDispatched = 0.0;
        $totalReady = 0.0;
        $totalReceived = 0.0;

        foreach ($items as $it) {
            $iid = (int)($it['item_id'] ?? 0);
            $reqQty = (float)($it['qty'] ?? 0);
            $cancelledQty = (float)($it['cancelled_qty'] ?? 0);
            $effectiveReq = max(0.0, $reqQty - $cancelledQty);
            $rec = $itemMap[$iid]['received'] ?? 0.0;
            $rdy = $itemMap[$iid]['ready'] ?? 0.0;
            $disp = $rec + $rdy;
            $bal = max(0.0, $effectiveReq - $disp);

            $totalDispatched += $disp;
            $totalReady += $rdy;
            $totalReceived += $rec;
            if ($bal > 0.0001) {
                $hasBalance = true;
            }
        }

        if ($hasBalance) {
            $newStatus = $totalDispatched > 0.0001 ? 'partial' : 'pending';
        } else {
            if ($totalReady > 0.0001) {
                $newStatus = 'dispatched';
            } elseif ($totalReceived > 0.0001) {
                $newStatus = 'completed';
            } else {
                $newStatus = 'cancelled';
            }
        }

        if ($reviewerId) {
            $pdo->prepare("UPDATE van_item_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ? AND vendor_id = ?")
                ->execute([$newStatus, $reviewerId, $requestId, $vendorId]);
        } else {
            $pdo->prepare("UPDATE van_item_requests SET status = ? WHERE id = ? AND vendor_id = ?")
                ->execute([$newStatus, $requestId, $vendorId]);
        }

        return $newStatus;
    }

    public function listRequests(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $sql = "
            SELECT r.*, v.van_code, v.van_name, u.full_name AS requested_by_name
            FROM van_item_requests r
            LEFT JOIN vans v ON v.id = r.van_id
            LEFT JOIN users u ON u.id = r.requested_by
            WHERE r.vendor_id = ?
        ";
        $params = [$vendorId];
        if ($req->user['role'] === 'van') {
            $sql .= " AND r.van_id = ?";
            $params[] = (int)$req->user['van_id'];
        }
        $sql .= " ORDER BY r.id DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        // Lookup item metadata & linked store-to-van transfer quantities per request
        $itemMeta = [];
        $iStmt = $pdo->prepare("SELECT id, sku, name, uom FROM items WHERE vendor_id = ?");
        $iStmt->execute([$vendorId]);
        foreach ($iStmt->fetchAll() as $it) {
            $itemMeta[(int)$it['id']] = $it;
        }

        $trfMap = [];
        $tStmt = $pdo->prepare("
            SELECT t.request_id, t.status AS transfer_status, l.item_id, SUM(l.qty) AS total_qty
            FROM stock_transfers t
            INNER JOIN stock_transfer_lines l ON l.transfer_id = t.id
            WHERE t.vendor_id = ? AND t.request_id IS NOT NULL
            GROUP BY t.request_id, t.status, l.item_id
        ");
        $tStmt->execute([$vendorId]);
        foreach ($tStmt->fetchAll() as $tr) {
            $reqId = (int)$tr['request_id'];
            $itemId = (int)$tr['item_id'];
            if (!isset($trfMap[$reqId][$itemId])) {
                $trfMap[$reqId][$itemId] = ['received' => 0.0, 'ready' => 0.0];
            }
            if ($tr['transfer_status'] === 'completed') {
                $trfMap[$reqId][$itemId]['received'] += (float)$tr['total_qty'];
            } elseif ($tr['transfer_status'] === 'pending_confirm') {
                $trfMap[$reqId][$itemId]['ready'] += (float)$tr['total_qty'];
            }
        }

        foreach ($rows as &$r) {
            $rawItems = json_decode($r['items_json'], true) ?: [];
            unset($r['items_json']);
            $reqId = (int)$r['id'];
            $enriched = [];
            foreach ($rawItems as $it) {
                $itemId = (int)($it['item_id'] ?? 0);
                $reqQty = (float)($it['qty'] ?? 0);
                $cancelledQty = (float)($it['cancelled_qty'] ?? 0);
                $effectiveReq = max(0.0, $reqQty - $cancelledQty);
                $receivedQty = $trfMap[$reqId][$itemId]['received'] ?? 0.0;
                $readyQty = $trfMap[$reqId][$itemId]['ready'] ?? 0.0;
                $dispatchedQty = $receivedQty + $readyQty;
                $balanceQty = max(0.0, $effectiveReq - $dispatchedQty);
                $pendingQty = max(0.0, $effectiveReq - $receivedQty);

                if ($r['status'] === 'cancelled' || ($cancelledQty > 0 && $dispatchedQty <= 0 && $balanceQty <= 0)) {
                    $itemStatus = 'cancelled';
                } elseif ($receivedQty >= $effectiveReq && $effectiveReq > 0) {
                    $itemStatus = 'received';
                } elseif ($balanceQty <= 0 && $readyQty > 0) {
                    $itemStatus = 'ready_pickup';
                } elseif ($dispatchedQty > 0 && ($balanceQty > 0 || ($receivedQty > 0 && $readyQty > 0))) {
                    $itemStatus = 'partial';
                } elseif ($r['status'] === 'dispatched') {
                    $itemStatus = 'dispatched';
                } else {
                    $itemStatus = 'pending';
                }

                $meta = $itemMeta[$itemId] ?? null;
                $enriched[] = array_merge($it, [
                    'sku'              => $meta['sku'] ?? ($it['sku'] ?? "#{$itemId}"),
                    'item_name'        => $meta['name'] ?? ($it['item_name'] ?? "Item #{$itemId}"),
                    'uom'              => $meta['uom'] ?? ($it['uom'] ?? 'PCS'),
                    'requested_qty'    => $reqQty,
                    'delivered_qty'    => $dispatchedQty,
                    'accepted_qty'     => $receivedQty,
                    'received_qty'     => $receivedQty,
                    'ready_pickup_qty' => $readyQty,
                    'dispatched_qty'   => $dispatchedQty,
                    'cancelled_qty'    => $cancelledQty,
                    'balance_qty'      => $balanceQty,
                    'pending_qty'      => $pendingQty,
                    'item_status'      => $itemStatus,
                ]);
            }
            $r['items'] = $enriched;
        }
        Response::ok($rows);
    }

    public function createRequest(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanId = (int)($req->user['van_id'] ?: ($req->body()['van_id'] ?? 0));
        $items = $req->body()['items'] ?? [];
        if (!$vanId || empty($items)) {
            Response::error('Van ID and requested items are required', 422);
        }

        $pdo = Database::getConnection();
        $reqNo = 'REQ-' . date('Ymd') . '-' . rand(100, 999);
        $stmt = $pdo->prepare("INSERT INTO van_item_requests (vendor_id, request_no, van_id, requested_by, status, items_json, notes) VALUES (?, ?, ?, ?, 'pending', ?, ?)");
        $stmt->execute([$vendorId, $reqNo, $vanId, $req->user['id'], json_encode($items), trim($req->body()['notes'] ?? '')]);
        Response::ok(['id' => (int)$pdo->lastInsertId(), 'request_no' => $reqNo], 'Item request sent to Main Store', 201);
    }

    public function cancelRequest(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("SELECT * FROM van_item_requests WHERE id = ? AND vendor_id = ? LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Request not found', 404);
        }
        if ($req->user['role'] === 'van' && (int)$req->user['van_id'] !== (int)$row['van_id']) {
            Response::error('You can only cancel requests for your own van', 403);
        }
        if ($row['status'] !== 'pending') {
            Response::error('Only pending requests can be cancelled', 422);
        }

        // Ensure 'cancelled' is accepted even if status was created as a narrower ENUM
        try {
            $col = $pdo->query("SHOW COLUMNS FROM van_item_requests LIKE 'status'")->fetch();
            if ($col && stripos((string)($col['Type'] ?? ''), 'enum(') === 0 && stripos((string)$col['Type'], "'cancelled'") === false) {
                $pdo->exec("ALTER TABLE van_item_requests MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending'");
            }
        } catch (Throwable $e) {
            // ignore if already compatible
        }

        $pdo->prepare("UPDATE van_item_requests SET status = 'cancelled', reviewed_by = ?, reviewed_at = NOW() WHERE id = ? AND vendor_id = ?")
            ->execute([$req->user['id'], $id, $vendorId]);

        Response::ok(['id' => $id, 'status' => 'cancelled'], 'Request cancelled and moved to Cancel List');
    }

    public function cancelRequestBalance(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $targetItemId = !empty($req->body()['item_id']) ? (int)$req->body()['item_id'] : null;
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("SELECT * FROM van_item_requests WHERE id = ? AND vendor_id = ? LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Request not found', 404);
        }
        if ($req->user['role'] === 'van' && (int)$req->user['van_id'] !== (int)$row['van_id']) {
            Response::error('You can only update requests for your own van', 403);
        }
        if (!in_array($row['status'], ['pending', 'partial'], true)) {
            Response::error('Only pending or partial requests have an open balance to cancel', 422);
        }

        $tStmt = $pdo->prepare("
            SELECT l.item_id, SUM(l.qty) AS total_qty
            FROM stock_transfers t
            INNER JOIN stock_transfer_lines l ON l.transfer_id = t.id
            WHERE t.vendor_id = ? AND t.request_id = ? AND t.status IN ('pending_confirm', 'completed')
            GROUP BY l.item_id
        ");
        $tStmt->execute([$vendorId, $id]);
        $dispatchedMap = [];
        foreach ($tStmt->fetchAll() as $tr) {
            $dispatchedMap[(int)$tr['item_id']] = (float)$tr['total_qty'];
        }

        $items = json_decode($row['items_json'], true) ?: [];
        $updated = false;
        foreach ($items as &$it) {
            $iid = (int)($it['item_id'] ?? 0);
            if ($targetItemId !== null && $iid !== $targetItemId) {
                continue;
            }
            $reqQty = (float)($it['qty'] ?? 0);
            $dispQty = $dispatchedMap[$iid] ?? 0.0;
            $remBal = max(0.0, $reqQty - $dispQty);
            $it['cancelled_qty'] = $remBal;
            $updated = true;
        }
        unset($it);

        if (!$updated) {
            Response::error('Target item not found in this request', 404);
        }

        $pdo->prepare("UPDATE van_item_requests SET items_json = ? WHERE id = ? AND vendor_id = ?")
            ->execute([json_encode($items), $id, $vendorId]);

        $newStatus = self::syncRequestStatus($pdo, $vendorId, $id, (int)$req->user['id']);
        Response::ok(['id' => $id, 'status' => $newStatus], 'Remaining balance cancelled & request updated');
    }

    public function deleteRequest(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("SELECT * FROM van_item_requests WHERE id = ? AND vendor_id = ? LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Request not found', 404);
        }
        if ($req->user['role'] === 'van' && (int)$req->user['van_id'] !== (int)$row['van_id']) {
            Response::error('You can only delete requests for your own van', 403);
        }
        if ($row['status'] !== 'cancelled') {
            Response::error('Only cancelled requests can be deleted', 422);
        }

        $pdo->prepare("DELETE FROM van_item_requests WHERE id = ? AND vendor_id = ?")
            ->execute([$id, $vendorId]);

        Response::ok(['id' => $id, 'deleted' => true], 'Cancelled request permanently deleted');
    }

    public function dispatchStoreToVan(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $vanId = (int)($b['to_van_id'] ?? 0);
        $lines = $b['lines'] ?? [];
        $requestId = !empty($b['request_id']) ? (int)$b['request_id'] : null;

        if (!$vanId || empty($lines)) {
            Response::error('Destination van and items are required', 422);
        }

        $pdo = Database::getConnection();
        try {
            $pdo->beginTransaction();

            $trfNo = 'TRF-S2V-' . date('Ymd') . '-' . rand(100, 999);
            $otp = (string)rand(1000, 9999);
            $tStmt = $pdo->prepare("
                INSERT INTO stock_transfers (vendor_id, transfer_no, transfer_type, from_location_type, from_van_id, to_van_id, request_id, otp_code, status, notes, created_by)
                VALUES (?, ?, 'store_to_van', 'main_store', NULL, ?, ?, ?, 'pending_confirm', ?, ?)
            ");
            $tStmt->execute([$vendorId, $trfNo, $vanId, $requestId, $otp, trim($b['notes'] ?? ''), $req->user['id']]);
            $trfId = (int)$pdo->lastInsertId();

            self::ensureTransferSellingPriceColumn($pdo);
            $lStmt = $pdo->prepare("INSERT INTO stock_transfer_lines (transfer_id, item_id, source_batch_id, batch_no, expiry_date, unit_cost, selling_price, qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

            foreach ($lines as $ln) {
                $slices = InventoryModel::consumeFifoFefo($pdo, $vendorId, 'main_store', null, (int)$ln['item_id'], (float)$ln['qty']);
                foreach ($slices as $sl) {
                    $lStmt->execute([$trfId, (int)$ln['item_id'], $sl['batch_id'], $sl['batch_no'], $sl['expiry_date'], $sl['unit_cost'], $sl['selling_price'], $sl['qty']]);
                }
            }

            if ($requestId) {
                self::syncRequestStatus($pdo, $vendorId, $requestId, (int)$req->user['id']);
            }

            $pdo->commit();
            Response::ok(['transfer_id' => $trfId, 'transfer_no' => $trfNo, 'otp_code' => $otp], 'Store-to-Van dispatch created via FIFO/FEFO', 201);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Dispatch failed: ' . $e->getMessage(), 400);
        }
    }

    public function createVanToVan(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $fromVanId = $req->user['role'] === 'van' ? (int)$req->user['van_id'] : (int)($b['from_van_id'] ?? 0);
        $toVanId = (int)($b['to_van_id'] ?? 0);
        $lines = $b['lines'] ?? [];

        if (!$fromVanId || !$toVanId || $fromVanId === $toVanId || empty($lines)) {
            Response::error('Valid source van, different destination van, and items are required', 422);
        }

        $pdo = Database::getConnection();
        try {
            $pdo->beginTransaction();

            $trfNo = 'TRF-V2V-' . date('Ymd') . '-' . rand(100, 999);
            $otp = (string)rand(1000, 9999);
            $tStmt = $pdo->prepare("
                INSERT INTO stock_transfers (vendor_id, transfer_no, transfer_type, from_location_type, from_van_id, to_van_id, otp_code, status, notes, created_by)
                VALUES (?, ?, 'van_to_van', 'van', ?, ?, ?, 'pending_confirm', ?, ?)
            ");
            $tStmt->execute([$vendorId, $trfNo, $fromVanId, $toVanId, $otp, trim($b['notes'] ?? 'Field Van-to-Van Transfer'), $req->user['id']]);
            $trfId = (int)$pdo->lastInsertId();

            self::ensureTransferSellingPriceColumn($pdo);
            $lStmt = $pdo->prepare("INSERT INTO stock_transfer_lines (transfer_id, item_id, source_batch_id, batch_no, expiry_date, unit_cost, selling_price, qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

            foreach ($lines as $ln) {
                $slices = InventoryModel::consumeFifoFefo($pdo, $vendorId, 'van', $fromVanId, (int)$ln['item_id'], (float)$ln['qty']);
                foreach ($slices as $sl) {
                    $lStmt->execute([$trfId, (int)$ln['item_id'], $sl['batch_id'], $sl['batch_no'], $sl['expiry_date'], $sl['unit_cost'], $sl['selling_price'], $sl['qty']]);
                }
            }

            $pdo->commit();
            Response::ok(['transfer_id' => $trfId, 'transfer_no' => $trfNo, 'otp_code' => $otp], 'Van-to-Van transfer initiated. Share OTP with receiving driver.', 201);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Van-to-Van transfer failed: ' . $e->getMessage(), 400);
        }
    }

    public function confirmTransfer(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $otp = trim($req->body()['otp_code'] ?? '');
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("SELECT * FROM stock_transfers WHERE id = ? AND vendor_id = ? LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $trf = $stmt->fetch();

        if (!$trf || $trf['status'] !== 'pending_confirm') {
            Response::error('Transfer not found or already processed', 404);
        }

        if ($req->user['role'] === 'van' && (int)$req->user['van_id'] !== (int)$trf['to_van_id']) {
            Response::error('Only the destination van driver can confirm receipt', 403);
        }

        if ($otp !== '' && $trf['otp_code'] && $otp !== $trf['otp_code']) {
            Response::error('Invalid OTP verification code', 422);
        }

        try {
            $pdo->beginTransaction();

            $lines = $pdo->prepare("SELECT * FROM stock_transfer_lines WHERE transfer_id = ?");
            $lines->execute([$id]);
            foreach ($lines->fetchAll() as $ln) {
                InventoryModel::addBatch(
                    $pdo,
                    $vendorId,
                    'van',
                    (int)$trf['to_van_id'],
                    (int)$ln['item_id'],
                    null,
                    $ln['batch_no'],
                    $ln['expiry_date'],
                    (float)$ln['unit_cost'],
                    (float)$ln['qty'],
                    isset($ln['selling_price']) && $ln['selling_price'] !== null ? (float)$ln['selling_price'] : null
                );
            }

            $pdo->prepare("UPDATE stock_transfers SET status = 'completed', confirmed_by = ?, confirmed_at = NOW() WHERE id = ?")
                ->execute([$req->user['id'], $id]);

            if (!empty($trf['request_id'])) {
                self::syncRequestStatus($pdo, $vendorId, (int)$trf['request_id']);
            }

            $pdo->commit();
            Response::ok(null, 'Transfer received and added to destination Van Store');
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Confirm failed: ' . $e->getMessage(), 400);
        }
    }

    public function listTransfers(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $sql = "
            SELECT t.*, fv.van_name AS from_van_name, tv.van_name AS to_van_name, u.full_name AS created_by_name
            FROM stock_transfers t
            LEFT JOIN vans fv ON fv.id = t.from_van_id
            INNER JOIN vans tv ON tv.id = t.to_van_id
            LEFT JOIN users u ON u.id = t.created_by
            WHERE t.vendor_id = ?
        ";
        $params = [$vendorId];
        if ($req->user['role'] === 'van') {
            $sql .= " AND (t.from_van_id = ? OR t.to_van_id = ?)";
            $params[] = (int)$req->user['van_id'];
            $params[] = (int)$req->user['van_id'];
        }
        $sql .= " ORDER BY t.id DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $lStmt = $pdo->prepare("SELECT l.*, i.sku, i.name AS item_name, i.uom FROM stock_transfer_lines l INNER JOIN items i ON i.id = l.item_id WHERE l.transfer_id = ?");
        foreach ($rows as &$r) {
            $lStmt->execute([$r['id']]);
            $r['lines'] = $lStmt->fetchAll();
        }
        Response::ok($rows);
    }

    private static function ensureReturnDamageLocationColumns(\PDO $pdo): void
    {
        try {
            $col = $pdo->query("SHOW COLUMNS FROM van_returns_damages LIKE 'van_id'")->fetch();
            if ($col && strtoupper((string)($col['Null'] ?? 'NO')) === 'NO') {
                $pdo->exec("ALTER TABLE van_returns_damages MODIFY COLUMN van_id INT NULL");
            }
            $locCol = $pdo->query("SHOW COLUMNS FROM van_returns_damages LIKE 'location_type'")->fetch();
            if (!$locCol) {
                $pdo->exec("ALTER TABLE van_returns_damages ADD COLUMN location_type VARCHAR(20) NOT NULL DEFAULT 'van' AFTER vendor_id");
            }
        } catch (Throwable $e) {
            // ignore if already compatible
        }
    }

    public function listReturnsDamages(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        self::ensureReturnDamageLocationColumns($pdo);
        $sql = "
            SELECT d.*, COALESCE(v.van_name, 'Main Store') AS van_name, i.sku, i.name AS item_name, u.full_name AS reported_by_name
            FROM van_returns_damages d
            LEFT JOIN vans v ON v.id = d.van_id
            INNER JOIN items i ON i.id = d.item_id
            LEFT JOIN users u ON u.id = d.reported_by
            WHERE d.vendor_id = ?
        ";
        $params = [$vendorId];
        if ($req->user['role'] === 'van') {
            $sql .= " AND d.van_id = ?";
            $params[] = (int)$req->user['van_id'];
        }
        $sql .= " ORDER BY d.id DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::ok($stmt->fetchAll());
    }

    public function reportReturnDamage(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $locationType = ($b['location_type'] ?? 'van') === 'main_store' && $req->user['role'] !== 'van' ? 'main_store' : 'van';
        $vanId = $locationType === 'main_store'
            ? null
            : ($req->user['role'] === 'van' ? (int)$req->user['van_id'] : (int)($b['van_id'] ?? 0));
        $itemId = (int)($b['item_id'] ?? 0);
        $qty = (float)($b['qty'] ?? 0);
        $returnType = in_array($b['return_type'] ?? '', ['good_return', 'damaged', 'expired'], true) ? $b['return_type'] : 'damaged';

        if (($locationType === 'van' && !$vanId) || !$itemId || $qty <= 0) {
            Response::error('Source location/Van, item, and positive quantity are required', 422);
        }

        $pdo = Database::getConnection();
        self::ensureReturnDamageLocationColumns($pdo);
        try {
            $pdo->beginTransaction();
            $slices = InventoryModel::consumeFifoFefo($pdo, $vendorId, $locationType, $vanId, $itemId, $qty);
            $ins = $pdo->prepare("
                INSERT INTO van_returns_damages (vendor_id, location_type, van_id, item_id, batch_id, batch_no, expiry_date, qty, unit_cost, return_type, reason_code, notes, reported_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $defaultReason = $locationType === 'main_store' ? 'Store Damage' : ($returnType === 'good_return' ? 'Van Return' : 'Transit Damage');
            foreach ($slices as $sl) {
                $ins->execute([
                    $vendorId, $locationType, $vanId, $itemId, $sl['batch_id'], $sl['batch_no'], $sl['expiry_date'],
                    $sl['qty'], $sl['unit_cost'], $returnType, trim($b['reason_code'] ?? $defaultReason),
                    trim($b['notes'] ?? ''), $req->user['id'],
                ]);
            }
            $pdo->commit();
            $locLabel = $locationType === 'main_store' ? 'Main Store' : 'Van';
            Response::ok(null, "Return / Damage logged and deducted from {$locLabel} stock", 201);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Failed to log return/damage: ' . $e->getMessage(), 400);
        }
    }

    public function qcReturnDamage(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $action = $req->body()['action'] ?? ''; // 'restocked' or 'written_off'
        if (!in_array($action, ['restocked', 'written_off'], true)) {
            Response::error('Action must be restocked or written_off', 422);
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM van_returns_damages WHERE id = ? AND vendor_id = ? LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $row = $stmt->fetch();
        if (!$row || $row['qc_status'] !== 'pending_qc') {
            Response::error('Record not found or already inspected', 404);
        }

        try {
            $pdo->beginTransaction();
            if ($action === 'restocked') {
                InventoryModel::addBatch(
                    $pdo,
                    $vendorId,
                    'main_store',
                    null,
                    (int)$row['item_id'],
                    null,
                    $row['batch_no'] ?: ('RET-' . date('ymd')),
                    $row['expiry_date'],
                    (float)$row['unit_cost'],
                    (float)$row['qty']
                );
            }
            $pdo->prepare("UPDATE van_returns_damages SET qc_status = ?, qc_by = ?, qc_at = NOW() WHERE id = ?")
                ->execute([$action, $req->user['id'], $id]);
            $pdo->commit();
            Response::ok(null, "QC completed: {$action}");
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('QC failed: ' . $e->getMessage(), 400);
        }
    }
}

