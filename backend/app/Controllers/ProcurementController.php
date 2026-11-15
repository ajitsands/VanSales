<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Models\InventoryModel;
use Throwable;

class ProcurementController
{
    public function listSuppliers(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM suppliers WHERE vendor_id = ? ORDER BY id DESC");
        $stmt->execute([$vendorId]);
        $rows = $stmt->fetchAll();

        $bStmt = $pdo->prepare("
            SELECT item_id, batch_no, qty_available, selling_price, expiry_date
            FROM stock_batches
            WHERE vendor_id = ? AND location_type = 'main_store' AND qty_available > 0
            ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC, received_at ASC, id ASC
        ");
        $bStmt->execute([$vendorId]);
        $batchesByItem = [];
        foreach ($bStmt->fetchAll() as $b) {
            $batchesByItem[(int)$b['item_id']][] = [
                'batch_no'      => $b['batch_no'],
                'qty_available' => (float)$b['qty_available'],
                'selling_price' => $b['selling_price'] !== null ? (float)$b['selling_price'] : null,
                'expiry_date'   => $b['expiry_date'],
            ];
        }
        foreach ($rows as &$r) {
            $r['main_store_batches'] = $batchesByItem[(int)$r['id']] ?? [];
        }
        Response::ok($rows);
    }

    public function createSupplier(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $name = trim($b['name'] ?? '');
        if ($name === '') {
            Response::error('Supplier name is required', 422);
        }
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO suppliers (vendor_id, name, contact_person, phone, email, address, vat_number) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $vendorId,
            $name,
            trim($b['contact_person'] ?? ''),
            trim($b['phone'] ?? ''),
            trim($b['email'] ?? ''),
            trim($b['address'] ?? ''),
            trim($b['vat_number'] ?? ''),
        ]);
        Response::ok(['id' => (int)$pdo->lastInsertId()], 'Supplier added', 201);
    }

    public function listItems(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        InventoryModel::ensureSellingPriceColumn($pdo);
        $stmt = $pdo->prepare("
            SELECT i.*,
              i.selling_price AS catalog_selling_price,
              COALESCE(
                (SELECT b.selling_price FROM stock_batches b
                 WHERE b.item_id = i.id AND b.location_type = 'main_store' AND b.qty_available > 0 AND b.selling_price IS NOT NULL
                 ORDER BY CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END, b.expiry_date ASC, b.received_at ASC, b.id ASC
                 LIMIT 1),
                i.selling_price
              ) AS selling_price,
              COALESCE((SELECT SUM(qty_available) FROM stock_batches b WHERE b.item_id = i.id AND b.location_type = 'main_store'), 0) AS main_store_qty,
              COALESCE((SELECT SUM(qty_available) FROM stock_batches b WHERE b.item_id = i.id AND b.location_type = 'van'), 0) AS vans_qty
            FROM items i
            WHERE i.vendor_id = ?
            ORDER BY i.id ASC
        ");
        $stmt->execute([$vendorId]);
        $rows = $stmt->fetchAll();

        $bStmt = $pdo->prepare("
            SELECT item_id, batch_no, qty_available, selling_price, expiry_date
            FROM stock_batches
            WHERE vendor_id = ? AND location_type = 'main_store' AND qty_available > 0
            ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC, received_at ASC, id ASC
        ");
        $bStmt->execute([$vendorId]);
        $batchesByItem = [];
        foreach ($bStmt->fetchAll() as $b) {
            $batchesByItem[(int)$b['item_id']][] = [
                'batch_no'      => $b['batch_no'],
                'qty_available' => (float)$b['qty_available'],
                'selling_price' => $b['selling_price'] !== null ? (float)$b['selling_price'] : null,
                'expiry_date'   => $b['expiry_date'],
            ];
        }
        foreach ($rows as &$r) {
            $r['main_store_batches'] = $batchesByItem[(int)$r['id']] ?? [];
        }
        Response::ok($rows);
    }

    public function createItem(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $sku = trim($b['sku'] ?? '');
        $name = trim($b['name'] ?? '');
        if ($sku === '' || $name === '') {
            Response::error('SKU and Item Name are required', 422);
        }
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO items (vendor_id, sku, barcode, name, category, uom, purchase_price, selling_price, track_expiry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $vendorId,
            $sku,
            trim($b['barcode'] ?? ''),
            $name,
            trim($b['category'] ?? 'General'),
            trim($b['uom'] ?? 'PCS'),
            (float)($b['purchase_price'] ?? 0),
            (float)($b['selling_price'] ?? 0),
            isset($b['track_expiry']) ? ((int)$b['track_expiry'] ? 1 : 0) : 1,
        ]);
        Response::ok(['id' => (int)$pdo->lastInsertId()], 'Item created', 201);
    }

    public function updateItem(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $b = $req->body();
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("SELECT * FROM items WHERE id = ? AND vendor_id = ? LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $item = $stmt->fetch();
        if (!$item) {
            Response::error('Item not found', 404);
        }

        $pdo->prepare("UPDATE items SET name = ?, category = ?, uom = ?, purchase_price = ?, selling_price = ?, track_expiry = ?, is_active = ? WHERE id = ?")
            ->execute([
                trim($b['name'] ?? $item['name']),
                trim($b['category'] ?? $item['category']),
                trim($b['uom'] ?? $item['uom']),
                (float)($b['purchase_price'] ?? $item['purchase_price']),
                (float)($b['selling_price'] ?? $item['selling_price']),
                isset($b['track_expiry']) ? ((int)$b['track_expiry'] ? 1 : 0) : (int)$item['track_expiry'],
                isset($b['is_active']) ? ((int)$b['is_active'] ? 1 : 0) : (int)$item['is_active'],
                $id,
            ]);
        Response::ok(null, 'Item updated');
    }

    public function listGrns(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            SELECT g.*, s.name AS supplier_name, u.full_name AS received_by_name,
                   GROUP_CONCAT(DISTINCT b.batch_no ORDER BY b.id SEPARATOR ', ') AS batch_nos
            FROM grn_headers g
            INNER JOIN suppliers s ON s.id = g.supplier_id
            LEFT JOIN users u ON u.id = g.received_by
            LEFT JOIN stock_batches b ON b.grn_id = g.id AND b.vendor_id = g.vendor_id
            WHERE g.vendor_id = ?
            GROUP BY g.id
            ORDER BY g.id DESC
        ");
        $stmt->execute([$vendorId]);
        $rows = $stmt->fetchAll();

        $bStmt = $pdo->prepare("
            SELECT item_id, batch_no, qty_available, selling_price, expiry_date
            FROM stock_batches
            WHERE vendor_id = ? AND location_type = 'main_store' AND qty_available > 0
            ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC, received_at ASC, id ASC
        ");
        $bStmt->execute([$vendorId]);
        $batchesByItem = [];
        foreach ($bStmt->fetchAll() as $b) {
            $batchesByItem[(int)$b['item_id']][] = [
                'batch_no'      => $b['batch_no'],
                'qty_available' => (float)$b['qty_available'],
                'selling_price' => $b['selling_price'] !== null ? (float)$b['selling_price'] : null,
                'expiry_date'   => $b['expiry_date'],
            ];
        }
        foreach ($rows as &$r) {
            $r['main_store_batches'] = $batchesByItem[(int)$r['id']] ?? [];
        }
        Response::ok($rows);
    }

    private static function getNextBatchSeq(\PDO $pdo, int $vendorId, string $datePart, string $supCode): int
    {
        $pattern = $datePart . 'B%S' . $supCode;
        $stmt = $pdo->prepare("SELECT batch_no FROM stock_batches WHERE vendor_id = ? AND batch_no LIKE ?");
        $stmt->execute([$vendorId, $pattern]);
        $maxSeq = 0;
        $regex = '/^' . preg_quote($datePart, '/') . 'B(\d+)S' . preg_quote($supCode, '/') . '$/';
        foreach ($stmt->fetchAll() as $row) {
            if (preg_match($regex, (string)$row['batch_no'], $m)) {
                $maxSeq = max($maxSeq, (int)$m[1]);
            }
        }
        return $maxSeq + 1;
    }

    public function createGrn(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $supplierId = (int)($b['supplier_id'] ?? 0);
        $lines = $b['lines'] ?? [];

        if (!$supplierId || empty($lines)) {
            Response::error('Supplier and at least one received item line are required', 422);
        }

        $pdo = Database::getConnection();
        try {
            $pdo->beginTransaction();

            $grnNo = 'GRN-' . date('Ymd') . '-' . rand(100, 999);
            $totalCost = 0.0;
            foreach ($lines as $ln) {
                $totalCost += ((float)$ln['qty'] * (float)$ln['unit_cost']);
            }

            $gStmt = $pdo->prepare("INSERT INTO grn_headers (vendor_id, grn_no, supplier_id, supplier_invoice_no, total_cost, notes, received_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $gStmt->execute([
                $vendorId,
                $grnNo,
                $supplierId,
                trim($b['supplier_invoice_no'] ?? ''),
                round($totalCost, 3),
                trim($b['notes'] ?? ''),
                $req->user['id'],
            ]);
            $grnId = (int)$pdo->lastInsertId();

            $datePart = date('dmy');
            $supCode = str_pad((string)$supplierId, 2, '0', STR_PAD_LEFT);
            $nextSeq = self::getNextBatchSeq($pdo, $vendorId, $datePart, $supCode);
            $generatedBatches = [];

            $itemPriceStmt = $pdo->prepare("SELECT selling_price FROM items WHERE id = ? AND vendor_id = ? LIMIT 1");
            foreach ($lines as $ln) {
                $itemId = (int)$ln['item_id'];
                $qty = (float)$ln['qty'];
                $unitCost = (float)$ln['unit_cost'];
                $rawBatchNo = trim((string)($ln['batch_no'] ?? ''));
                if ($rawBatchNo === '') {
                    $batchNo = $datePart . 'B' . $nextSeq . 'S' . $supCode;
                    $nextSeq++;
                } else {
                    $batchNo = $rawBatchNo;
                }
                $generatedBatches[] = $batchNo;
                $expiryDate = !empty($ln['expiry_date']) ? $ln['expiry_date'] : null;

                $batchSellingPrice = (isset($ln['selling_price']) && $ln['selling_price'] !== '' && $ln['selling_price'] !== null)
                    ? (float)$ln['selling_price']
                    : null;
                if ($batchSellingPrice === null) {
                    $itemPriceStmt->execute([$itemId, $vendorId]);
                    $row = $itemPriceStmt->fetch();
                    $batchSellingPrice = $row ? (float)$row['selling_price'] : null;
                }

                InventoryModel::addBatch($pdo, $vendorId, 'main_store', null, $itemId, $grnId, $batchNo, $expiryDate, $unitCost, $qty, $batchSellingPrice);
                // Update item's latest purchase_price
                $pdo->prepare("UPDATE items SET purchase_price = ? WHERE id = ? AND vendor_id = ?")->execute([$unitCost, $itemId, $vendorId]);
            }

            $pdo->commit();
            Response::ok(['grn_id' => $grnId, 'grn_no' => $grnNo, 'batches' => $generatedBatches], 'Goods received into Main Store (FIFO/FEFO batches created)', 201);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('GRN failed: ' . $e->getMessage(), 400);
        }
    }

    public function deleteGrn(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $grnId = (int)($req->params['id'] ?? 0);
        if (!$grnId) {
            Response::error('Invalid GRN ID', 422);
        }

        $pdo = Database::getConnection();
        $gStmt = $pdo->prepare("SELECT * FROM grn_headers WHERE id = ? AND vendor_id = ? LIMIT 1");
        $gStmt->execute([$grnId, $vendorId]);
        $grn = $gStmt->fetch();
        if (!$grn) {
            Response::error('GRN not found', 404);
        }

        $bStmt = $pdo->prepare("SELECT * FROM stock_batches WHERE grn_id = ? AND vendor_id = ?");
        $bStmt->execute([$grnId, $vendorId]);
        $batches = $bStmt->fetchAll();

        $invCheck = $pdo->prepare("SELECT COUNT(*) FROM invoice_lines WHERE batch_id = ?");
        $trfCheck = $pdo->prepare("SELECT COUNT(*) FROM stock_transfer_lines WHERE source_batch_id = ?");

        $affectedItems = [];
        foreach ($batches as $bt) {
            $affectedItems[(int)$bt['item_id']] = true;
            if ((float)$bt['qty_available'] + 1e-6 < (float)$bt['qty_initial']) {
                Response::error("Cannot delete GRN {$grn['grn_no']}: Batch {$bt['batch_no']} already has stock sold or transferred out.", 422);
            }
            $invCheck->execute([$bt['id']]);
            if ((int)$invCheck->fetchColumn() > 0) {
                Response::error("Cannot delete GRN {$grn['grn_no']}: Batch {$bt['batch_no']} is linked to existing sales invoices.", 422);
            }
            $trfCheck->execute([$bt['id']]);
            if ((int)$trfCheck->fetchColumn() > 0) {
                Response::error("Cannot delete GRN {$grn['grn_no']}: Batch {$bt['batch_no']} is linked to stock transfers.", 422);
            }
        }

        try {
            $pdo->beginTransaction();
            $pdo->prepare("DELETE FROM stock_batches WHERE grn_id = ? AND vendor_id = ?")->execute([$grnId, $vendorId]);
            $pdo->prepare("DELETE FROM grn_headers WHERE id = ? AND vendor_id = ?")->execute([$grnId, $vendorId]);

            $prevBatchCostStmt = $pdo->prepare("SELECT unit_cost FROM stock_batches WHERE vendor_id = ? AND item_id = ? ORDER BY id DESC LIMIT 1");
            $updItemCostStmt = $pdo->prepare("UPDATE items SET purchase_price = ? WHERE id = ? AND vendor_id = ?");
            foreach (array_keys($affectedItems) as $itemId) {
                $prevBatchCostStmt->execute([$vendorId, $itemId]);
                $prev = $prevBatchCostStmt->fetch();
                if ($prev) {
                    $updItemCostStmt->execute([(float)$prev['unit_cost'], $itemId, $vendorId]);
                }
            }

            $pdo->commit();
            Response::ok(null, "GRN {$grn['grn_no']} deleted and all batch entries reverted.");
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Failed to delete GRN: ' . $e->getMessage(), 400);
        }
    }
}

