<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Models\AttachmentModel;
use App\Models\CustomerLedgerModel;
use Throwable;

class LedgerChequeController
{
    public function listShopLedgers(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanFilter = $req->user['role'] === 'van' ? (int)$req->user['van_id'] : (int)($req->query('van_id') ?: 0);

        $sql = "
            SELECT s.id AS shop_id, s.shop_code, s.shop_name, s.phone, s.address,
                   r.route_code, r.route_name, r.assigned_van_id AS van_id, v.van_name,
                   COALESCE((SELECT SUM(debit) FROM shop_ledger_entries l WHERE l.shop_id = s.id), 0) AS total_debit,
                   COALESCE((SELECT SUM(credit) FROM shop_ledger_entries l WHERE l.shop_id = s.id), 0) AS total_credit,
                   COALESCE((SELECT SUM(debit - credit) FROM shop_ledger_entries l WHERE l.shop_id = s.id), 0) AS balance,
                   COALESCE((SELECT SUM(amount) FROM invoice_payments p WHERE p.shop_id = s.id AND p.payment_method = 'cheque' AND p.cheque_status = 'pending_clearance'), 0) AS pending_cheques
            FROM shops s
            INNER JOIN routes r ON r.id = s.route_id
            LEFT JOIN vans v ON v.id = r.assigned_van_id
            WHERE s.vendor_id = ?
        ";
        $params = [$vendorId];
        if ($vanFilter > 0) {
            $sql .= " AND r.assigned_van_id = ?";
            $params[] = $vanFilter;
        }
        $sql .= " ORDER BY r.id ASC, s.shop_name ASC";

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::ok($stmt->fetchAll());
    }

    public static function buildShopStatementData(\PDO $pdo, int $vendorId, int $shopId, ?string $fromDate = null, ?string $toDate = null): ?array
    {
        $sStmt = $pdo->prepare("
            SELECT s.*, r.route_name, r.assigned_van_id AS van_id, v.van_name
            FROM shops s
            INNER JOIN routes r ON r.id = s.route_id
            LEFT JOIN vans v ON v.id = r.assigned_van_id
            WHERE s.id = ? AND s.vendor_id = ? LIMIT 1
        ");
        $sStmt->execute([$shopId, $vendorId]);
        $shop = $sStmt->fetch();
        if (!$shop) {
            return null;
        }

        $lStmt = $pdo->prepare("SELECT * FROM shop_ledger_entries WHERE vendor_id = ? AND shop_id = ? ORDER BY id ASC");
        $lStmt->execute([$vendorId, $shopId]);
        $allEntries = $lStmt->fetchAll();

        $openingBalance = 0.0;
        $running = 0.0;
        $filtered = [];
        $periodDebit = 0.0;
        $periodCredit = 0.0;

        foreach ($allEntries as $e) {
            $d = (float)$e['debit'];
            $c = (float)$e['credit'];
            $entryDate = substr((string)$e['created_at'], 0, 10);

            if ($fromDate && $entryDate < $fromDate) {
                $openingBalance += ($d - $c);
                $running += ($d - $c);
                continue;
            }
            if ($toDate && $entryDate > $toDate) {
                continue;
            }
            $running += ($d - $c);
            $periodDebit += $d;
            $periodCredit += $c;
            $e['running_balance'] = round($running, 3);
            $filtered[] = $e;
        }

        $cStmt = $pdo->prepare("SELECT * FROM invoice_payments WHERE vendor_id = ? AND shop_id = ? AND payment_method = 'cheque' ORDER BY id DESC");
        $cStmt->execute([$vendorId, $shopId]);
        $cheques = $cStmt->fetchAll();

        $pendingCheques = 0.0;
        foreach ($cheques as $ch) {
            if ($ch['cheque_status'] === 'pending_clearance') {
                $pendingCheques += (float)$ch['amount'];
            }
        }

        $invSql = "SELECT * FROM invoices WHERE vendor_id = ? AND shop_id = ?";
        $invParams = [$vendorId, $shopId];
        if ($fromDate) {
            $invSql .= " AND DATE(created_at) >= ?";
            $invParams[] = $fromDate;
        }
        if ($toDate) {
            $invSql .= " AND DATE(created_at) <= ?";
            $invParams[] = $toDate;
        }
        $invSql .= " ORDER BY id DESC LIMIT 100";
        $invStmt = $pdo->prepare($invSql);
        $invStmt->execute($invParams);
        $invoices = $invStmt->fetchAll();

        $pInvStmt = $pdo->prepare("SELECT payment_method, amount, reference_no, cheque_no, cheque_status FROM invoice_payments WHERE invoice_id = ?");
        $lInvStmt = $pdo->prepare("SELECT l.qty, l.unit_price, l.line_total, i.name AS item_name FROM invoice_lines l INNER JOIN items i ON i.id = l.item_id WHERE l.invoice_id = ?");
        foreach ($invoices as &$inv) {
            $pInvStmt->execute([$inv['id']]);
            $inv['payments'] = $pInvStmt->fetchAll();
            $lInvStmt->execute([$inv['id']]);
            $inv['lines'] = $lInvStmt->fetchAll();
        }

        return [
            'shop'            => $shop,
            'from_date'       => $fromDate,
            'to_date'         => $toDate,
            'opening_balance' => round($openingBalance, 3),
            'period_debit'    => round($periodDebit, 3),
            'period_credit'   => round($periodCredit, 3),
            'balance'         => round($running, 3),
            'pending_cheques' => round($pendingCheques, 3),
            'entries'         => $filtered,
            'cheques'         => $cheques,
            'invoices'        => $invoices,
        ];
    }

    public function getShopStatement(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $shopId = (int)($req->params['id'] ?? 0);
        $fromDate = trim($req->query('from_date') ?? '') ?: null;
        $toDate = trim($req->query('to_date') ?? '') ?: null;
        $pdo = Database::getConnection();

        $data = self::buildShopStatementData($pdo, $vendorId, $shopId, $fromDate, $toDate);
        if (!$data) {
            Response::error('Shop not found', 404);
        }
        if ($req->user['role'] === 'van' && (int)$data['shop']['van_id'] !== (int)$req->user['van_id']) {
            Response::error('Forbidden: Shop does not belong to your van route', 403);
        }

        Response::ok($data);
    }

    public function collectPayment(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $shopId = (int)($req->params['id'] ?? 0);
        $b = $req->body();
        $allowedMethods = ['cash', 'card', 'qr_pay', 'bank_transfer', 'cheque'];

        $rawPayments = is_array($b['payments'] ?? null) ? $b['payments'] : null;
        $paymentLines = [];
        if ($rawPayments !== null) {
            foreach ($rawPayments as $p) {
                $m = $p['payment_method'] ?? 'cash';
                $amt = (float)($p['amount'] ?? 0);
                if ($amt > 0) {
                    if (!in_array($m, $allowedMethods, true)) {
                        Response::error('Invalid payment method in split collection', 422);
                    }
                    $paymentLines[] = [
                        'payment_method' => $m,
                        'amount' => $amt,
                        'reference_no' => trim($p['reference_no'] ?? ''),
                        'bank_name' => trim($p['bank_name'] ?? ($b['bank_name'] ?? '')),
                        'cheque_no' => trim($p['cheque_no'] ?? ($b['cheque_no'] ?? '')),
                        'cheque_date' => !empty($p['cheque_date']) ? $p['cheque_date'] : (!empty($b['cheque_date']) ? $b['cheque_date'] : null),
                    ];
                }
            }
        } else {
            $amount = (float)($b['amount'] ?? 0);
            $method = $b['payment_method'] ?? 'cash';
            if (in_array($method, $allowedMethods, true) && $amount > 0) {
                $paymentLines[] = [
                    'payment_method' => $method,
                    'amount' => $amount,
                    'reference_no' => trim($b['reference_no'] ?? ''),
                    'bank_name' => trim($b['bank_name'] ?? ''),
                    'cheque_no' => trim($b['cheque_no'] ?? ''),
                    'cheque_date' => !empty($b['cheque_date']) ? $b['cheque_date'] : null,
                ];
            }
        }

        if (empty($paymentLines)) {
            Response::error('Valid payment method and positive amount are required', 422);
        }

        $pdo = Database::getConnection();
        $sStmt = $pdo->prepare("SELECT s.*, r.assigned_van_id FROM shops s INNER JOIN routes r ON r.id = s.route_id WHERE s.id = ? AND s.vendor_id = ? LIMIT 1");
        $sStmt->execute([$shopId, $vendorId]);
        $shop = $sStmt->fetch();
        if (!$shop) {
            Response::error('Shop not found', 404);
        }

        $vanId = $req->user['role'] === 'van' ? (int)$req->user['van_id'] : (int)($shop['assigned_van_id'] ?: 0);
        $shiftId = null;
        if ($vanId) {
            $shStmt = $pdo->prepare("SELECT id FROM van_shifts WHERE vendor_id = ? AND van_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1");
            $shStmt->execute([$vendorId, $vanId]);
            $shiftId = $shStmt->fetchColumn() ?: null;
        }

        try {
            $pdo->beginTransaction();
            $pStmt = $pdo->prepare("
                INSERT INTO invoice_payments (invoice_id, vendor_id, van_id, shop_id, shift_id, payment_method, amount, reference_no, bank_name, cheque_no, cheque_date, cheque_status)
                VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $lStmt = $pdo->prepare("
                INSERT INTO shop_ledger_entries (vendor_id, van_id, shop_id, entry_type, ref_no, invoice_id, payment_id, debit, credit, notes, created_by)
                VALUES (?, ?, ?, 'payment', ?, NULL, ?, 0, ?, ?, ?)
            ");

            $paymentIds = [];
            $attachmentPayId = null;
            $hasCheque = false;
            $hasSettled = false;
            $totalCollected = 0.0;

            foreach ($paymentLines as $ln) {
                $method = $ln['payment_method'];
                $amount = round((float)$ln['amount'], 3);
                $totalCollected += $amount;
                $chqStatus = $method === 'cheque' ? 'pending_clearance' : 'na';
                $refNo = $ln['reference_no'] ?: ($method === 'cheque' ? $ln['cheque_no'] : strtoupper($method) . '-' . rand(1000, 9999));

                $pStmt->execute([
                    $vendorId, $vanId ?: null, $shopId, $shiftId ?: null, $method, $amount,
                    $refNo,
                    $ln['bank_name'] ?: null,
                    $ln['cheque_no'] ?: null,
                    $ln['cheque_date'],
                    $chqStatus,
                ]);
                $payId = (int)$pdo->lastInsertId();
                $paymentIds[] = $payId;
                if ($method === 'cheque') {
                    $hasCheque = true;
                    $attachmentPayId = $payId;
                } else {
                    $hasSettled = true;
                    if ($attachmentPayId === null) {
                        $attachmentPayId = $payId;
                    }
                    // ONLY settled payments immediately reduce the Shop Ledger. Cheques wait for Reconciliation!
                    $lStmt->execute([
                        $vendorId, $vanId ?: null, $shopId, $refNo, $payId, $amount,
                        'On-account collection via ' . strtoupper(str_replace('_', ' ', $method)),
                        $req->user['id'],
                    ]);
                }
            }

            $savedAttachments = AttachmentModel::saveAttachments(
                $pdo,
                $vendorId,
                null,
                $attachmentPayId,
                $b['attachments'] ?? [],
                (int)$req->user['id']
            );

            $pdo->commit();
            if ($hasCheque && $hasSettled) {
                $msg = 'Split collection recorded! Settled amounts credited to Shop Ledger; Cheque is pending clearance.';
            } elseif ($hasCheque) {
                $msg = 'Cheque collected (Pending Clearance). Shop Ledger will be credited once reconciled.';
            } else {
                $msg = count($paymentIds) > 1
                    ? 'Split collection recorded & credited to Shop Ledger.'
                    : 'Collection recorded & credited to Shop Ledger.';
            }
            Response::ok(['payment_id' => $paymentIds[0], 'payment_ids' => $paymentIds, 'total_collected' => round($totalCollected, 3), 'attachments' => $savedAttachments], $msg, 201);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Collection failed: ' . $e->getMessage(), 400);
        }
    }

    public function listCheques(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $sql = "
            SELECT p.*, s.shop_code, s.shop_name, v.van_name, inv.invoice_no, u.full_name AS cleared_by_name
            FROM invoice_payments p
            LEFT JOIN shops s ON s.id = p.shop_id
            LEFT JOIN vans v ON v.id = p.van_id
            LEFT JOIN invoices inv ON inv.id = p.invoice_id
            LEFT JOIN users u ON u.id = p.cleared_by
            WHERE p.vendor_id = ? AND p.payment_method = 'cheque'
            ORDER BY FIELD(p.cheque_status,'pending_clearance','bounced','cleared'), p.id DESC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$vendorId]);
        $rows = $stmt->fetchAll();

        $aStmt = $pdo->prepare("
            SELECT id, attachment_type, file_name, mime_type, file_path, created_at
            FROM invoice_attachments
            WHERE vendor_id = ? AND ((? > 0 AND invoice_id = ?) OR payment_id = ?)
            ORDER BY id ASC
        ");
        foreach ($rows as &$r) {
            $invId = (int)($r['invoice_id'] ?? 0);
            $aStmt->execute([$vendorId, $invId, $invId, (int)$r['id']]);
            $r['attachments'] = $aStmt->fetchAll();
        }
        Response::ok($rows);
    }

    public function reconcileCheque(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $b = $req->body();
        $action = $b['action'] ?? ''; // 'cleared' or 'bounced'
        if (!in_array($action, ['cleared', 'bounced'], true)) {
            Response::error('Action must be cleared or bounced', 422);
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM invoice_payments WHERE id = ? AND vendor_id = ? AND payment_method = 'cheque' LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $chq = $stmt->fetch();

        if (!$chq || $chq['cheque_status'] !== 'pending_clearance') {
            Response::error('Cheque not found or already reconciled', 404);
        }

        try {
            $pdo->beginTransaction();

            $pdo->prepare("UPDATE invoice_payments SET cheque_status = ?, cleared_by = ?, cleared_at = NOW(), cheque_notes = ? WHERE id = ?")
                ->execute([$action, $req->user['id'], trim($b['notes'] ?? ''), $id]);

            // CRITICAL BUSINESS RULE: Only when Cheque is CONFIRMED/CLEARED does the Van Customer/Shop Ledger get credited!
            if ($action === 'cleared' && $chq['shop_id']) {
                $pdo->prepare("
                    INSERT INTO shop_ledger_entries (vendor_id, van_id, shop_id, entry_type, ref_no, invoice_id, payment_id, debit, credit, notes, created_by)
                    VALUES (?, ?, ?, 'cheque_cleared', ?, ?, ?, 0, ?, ?, ?)
                ")->execute([
                    $vendorId,
                    $chq['van_id'],
                    $chq['shop_id'],
                    $chq['cheque_no'] ?: ($chq['reference_no'] ?: 'CHQ-' . $id),
                    $chq['invoice_id'],
                    $id,
                    (float)$chq['amount'],
                    'Cheque Cleared & Reconciled (' . ($chq['bank_name'] ?: 'Bank') . ' #' . ($chq['cheque_no'] ?: $id) . ')',
                    $req->user['id'],
                ]);
            }

            $pdo->commit();
            $msg = $action === 'cleared'
                ? 'Cheque confirmed & cleared! Shop Customer Ledger has been credited.'
                : 'Cheque marked as Bounced. Shop Ledger remains unpaid.';
            Response::ok(null, $msg);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Reconciliation failed: ' . $e->getMessage(), 400);
        }
    }

    public function vanTodayShopReport(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanId = $req->user['role'] === 'van' ? (int)$req->user['van_id'] : (int)($req->query('van_id') ?: 0);

        $sql = "
            SELECT s.id AS shop_id, s.shop_code, s.shop_name, r.route_name,
                   COALESCE((SELECT COUNT(*) FROM invoices inv WHERE inv.shop_id = s.id AND inv.invoice_type = 'sale' AND DATE(inv.created_at) = CURDATE()), 0) AS bill_count,
                   COALESCE((SELECT SUM(inv.total_amount) FROM invoices inv WHERE inv.shop_id = s.id AND inv.invoice_type = 'sale' AND DATE(inv.created_at) = CURDATE()), 0) AS sales_total,
                   COALESCE((SELECT SUM(inv.total_amount) FROM invoices inv WHERE inv.shop_id = s.id AND inv.invoice_type = 'return' AND DATE(inv.created_at) = CURDATE()), 0) AS returns_total,
                   COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.shop_id = s.id AND p.payment_method = 'cash' AND DATE(p.paid_at) = CURDATE()), 0) AS cash_collected,
                   COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.shop_id = s.id AND p.payment_method = 'card' AND DATE(p.paid_at) = CURDATE()), 0) AS card_collected,
                   COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.shop_id = s.id AND p.payment_method = 'qr_pay' AND DATE(p.paid_at) = CURDATE()), 0) AS qr_collected,
                   COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.shop_id = s.id AND p.payment_method = 'bank_transfer' AND DATE(p.paid_at) = CURDATE()), 0) AS bank_transfer_collected,
                   COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.shop_id = s.id AND p.payment_method = 'cheque' AND DATE(p.paid_at) = CURDATE()), 0) AS cheque_collected,
                   COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.shop_id = s.id AND p.payment_method = 'credit' AND DATE(p.paid_at) = CURDATE()), 0) AS credit_billed,
                   COALESCE((SELECT SUM(debit - credit) FROM shop_ledger_entries l WHERE l.shop_id = s.id), 0) AS pending_balance
            FROM shops s
            INNER JOIN routes r ON r.id = s.route_id
            WHERE s.vendor_id = ?
        ";
        $params = [$vendorId];
        if ($vanId > 0) {
            $sql .= " AND r.assigned_van_id = ?";
            $params[] = $vanId;
        }
        $sql .= " ORDER BY sales_total DESC, s.shop_name ASC";

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $totals = [
            'bill_count' => 0,
            'sales_total' => 0.0,
            'returns_total' => 0.0,
            'cash_collected' => 0.0,
            'card_collected' => 0.0,
            'qr_collected' => 0.0,
            'bank_transfer_collected' => 0.0,
            'cheque_collected' => 0.0,
            'credit_billed' => 0.0,
            'total_collected' => 0.0,
        ];
        foreach ($rows as &$r) {
            $collected = (float)$r['cash_collected'] + (float)$r['card_collected'] + (float)$r['qr_collected'] + (float)$r['bank_transfer_collected'] + (float)$r['cheque_collected'];
            $r['total_collected'] = round($collected, 3);
            $totals['bill_count'] += (int)$r['bill_count'];
            $totals['sales_total'] += (float)$r['sales_total'];
            $totals['returns_total'] += (float)$r['returns_total'];
            $totals['cash_collected'] += (float)$r['cash_collected'];
            $totals['card_collected'] += (float)$r['card_collected'];
            $totals['qr_collected'] += (float)$r['qr_collected'];
            $totals['bank_transfer_collected'] += (float)$r['bank_transfer_collected'];
            $totals['cheque_collected'] += (float)$r['cheque_collected'];
            $totals['credit_billed'] += (float)$r['credit_billed'];
            $totals['total_collected'] += $collected;
        }

        // Attach today's bills (with items & split payments) per shop for quick inspection & correction
        $invStmt = $pdo->prepare("
            SELECT id, invoice_no, original_invoice_no, invoice_type, vat_mode, subtotal, vat_amount, total_amount, is_corrected, correction_count, created_at
            FROM invoices
            WHERE vendor_id = ? AND shop_id = ? AND DATE(created_at) = CURDATE()
            ORDER BY id DESC
        ");
        $lineStmt = $pdo->prepare("
            SELECT l.item_id, l.qty, l.unit_price, l.line_total, i.name AS item_name, i.sku
            FROM invoice_lines l INNER JOIN items i ON i.id = l.item_id
            WHERE l.invoice_id = ?
        ");
        $payStmt = $pdo->prepare("
            SELECT payment_method, amount, reference_no, bank_name, cheque_no, cheque_date, cheque_status
            FROM invoice_payments
            WHERE invoice_id = ?
        ");
        foreach ($rows as &$r) {
            $invStmt->execute([$vendorId, $r['shop_id']]);
            $shopInvs = $invStmt->fetchAll();
            foreach ($shopInvs as &$si) {
                $lineStmt->execute([$si['id']]);
                $si['lines'] = $lineStmt->fetchAll();
                $payStmt->execute([$si['id']]);
                $si['payments'] = $payStmt->fetchAll();
            }
            $r['invoices'] = $shopInvs;
        }

        Response::ok(['shops' => $rows, 'totals' => $totals]);
    }

    public function listCustomerLedgers(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        CustomerLedgerModel::ensureTables($pdo);

        $stmt = $pdo->prepare("
            SELECT c.*,
                   COALESCE((SELECT SUM(debit) FROM main_store_customer_ledger l WHERE l.customer_id = c.id), 0) AS total_debit,
                   COALESCE((SELECT SUM(credit) FROM main_store_customer_ledger l WHERE l.customer_id = c.id), 0) AS total_credit,
                   COALESCE((SELECT SUM(debit - credit) FROM main_store_customer_ledger l WHERE l.customer_id = c.id), 0) AS balance,
                   (SELECT MAX(created_at) FROM main_store_customer_ledger l WHERE l.customer_id = c.id) AS last_activity
            FROM main_store_customers c
            WHERE c.vendor_id = ?
            ORDER BY c.id DESC
        ");
        $stmt->execute([$vendorId]);
        Response::ok($stmt->fetchAll());
    }

    public function lookupCustomerByMobile(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $mobile = trim((string)($req->query('mobile') ?? ''));
        $pdo = Database::getConnection();
        Response::ok(CustomerLedgerModel::getSummaryByMobile($pdo, $vendorId, $mobile));
    }

    public function createOrUpdateCustomerLedger(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $mobile = trim((string)($b['mobile_no'] ?? ''));
        $name = trim((string)($b['customer_name'] ?? ''));
        $openingAdvance = (float)($b['opening_advance'] ?? 0);
        $openingDue = (float)($b['opening_due'] ?? 0);

        if ($mobile === '' || $name === '') {
            Response::error('Customer Name and Mobile Number are required', 422);
        }

        $pdo = Database::getConnection();
        $cid = CustomerLedgerModel::upsertCustomer($pdo, $vendorId, $mobile, $name);
        if ($openingAdvance > 0) {
            CustomerLedgerModel::addEntry(
                $pdo, $vendorId, $cid, 'advance', 'ADV-' . date('ymdHis'),
                null, trim((string)($b['payment_method'] ?? 'cash')),
                0.0, $openingAdvance, trim((string)($b['notes'] ?? 'Customer Advance Received')), (int)$req->user['id']
            );
        }
        if ($openingDue > 0) {
            CustomerLedgerModel::addEntry(
                $pdo, $vendorId, $cid, 'opening_due', 'OB-' . date('ymdHis'),
                null, 'credit',
                $openingDue, 0.0, trim((string)($b['notes'] ?? 'Opening Credit Balance')), (int)$req->user['id']
            );
        }

        Response::ok(CustomerLedgerModel::getSummaryByMobile($pdo, $vendorId, $mobile), 'Customer ledger saved', 201);
    }

    public function mergeCustomerLedgers(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $targetId = (int)($b['target_id'] ?? 0);
        $sourceIds = array_values(array_unique(array_filter(
            array_map('intval', is_array($b['source_ids'] ?? null) ? $b['source_ids'] : []),
            fn($id) => $id > 0 && $id !== $targetId
        )));

        if (!$targetId || empty($sourceIds)) {
            Response::error('Please select a target customer ledger and at least one duplicate ledger to merge.', 422);
        }

        $pdo = Database::getConnection();
        CustomerLedgerModel::ensureTables($pdo);

        $tStmt = $pdo->prepare("SELECT * FROM main_store_customers WHERE id = ? AND vendor_id = ? LIMIT 1");
        $tStmt->execute([$targetId, $vendorId]);
        $target = $tStmt->fetch();
        if (!$target) {
            Response::error('Target customer ledger not found', 404);
        }

        $mergedName = trim((string)($b['merged_name'] ?? '')) ?: $target['customer_name'];
        $mergedMobile = trim((string)($b['merged_mobile'] ?? '')) ?: $target['mobile_no'];

        $sCheck = $pdo->prepare("SELECT * FROM main_store_customers WHERE id = ? AND vendor_id = ? LIMIT 1");
        foreach ($sourceIds as $sid) {
            $sCheck->execute([$sid, $vendorId]);
            if (!$sCheck->fetch()) {
                Response::error("Duplicate customer ledger ID {$sid} not found", 404);
            }
        }

        try {
            $pdo->beginTransaction();

            $moveEntries = $pdo->prepare("
                UPDATE main_store_customer_ledger
                SET customer_id = ?
                WHERE vendor_id = ? AND customer_id = ?
            ");
            $delCust = $pdo->prepare("DELETE FROM main_store_customers WHERE id = ? AND vendor_id = ?");

            $mergedCount = 0;
            foreach ($sourceIds as $sid) {
                $moveEntries->execute([$targetId, $vendorId, $sid]);
                $delCust->execute([$sid, $vendorId]);
                $mergedCount++;
            }

            // Ensure no unique collision on (vendor_id, mobile_no) with any other unmerged customer
            $dupMobile = $pdo->prepare("SELECT id FROM main_store_customers WHERE vendor_id = ? AND mobile_no = ? AND id <> ? LIMIT 1");
            $dupMobile->execute([$vendorId, $mergedMobile, $targetId]);
            if ($dupMobile->fetch()) {
                throw new \RuntimeException("Mobile number {$mergedMobile} is already used by another unmerged customer.");
            }

            $pdo->prepare("UPDATE main_store_customers SET customer_name = ?, mobile_no = ? WHERE id = ? AND vendor_id = ?")
                ->execute([$mergedName, $mergedMobile, $targetId, $vendorId]);

            $pdo->commit();
            Response::ok(
                CustomerLedgerModel::getSummaryByMobile($pdo, $vendorId, $mergedMobile),
                "Merged {$mergedCount} duplicate ledger(s) into {$mergedName} ({$mergedMobile})."
            );
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Merge failed: ' . $e->getMessage(), 400);
        }
    }

    public function getCustomerStatement(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $cid = (int)($req->params['id'] ?? 0);
        $pdo = Database::getConnection();
        CustomerLedgerModel::ensureTables($pdo);

        $cStmt = $pdo->prepare("SELECT * FROM main_store_customers WHERE id = ? AND vendor_id = ? LIMIT 1");
        $cStmt->execute([$cid, $vendorId]);
        $cust = $cStmt->fetch();
        if (!$cust) {
            Response::error('Customer ledger not found', 404);
        }

        $lStmt = $pdo->prepare("SELECT * FROM main_store_customer_ledger WHERE vendor_id = ? AND customer_id = ? ORDER BY id ASC");
        $lStmt->execute([$vendorId, $cid]);
        $rows = $lStmt->fetchAll();

        $running = 0.0;
        $totalDebit = 0.0;
        $totalCredit = 0.0;
        foreach ($rows as &$r) {
            $d = (float)$r['debit'];
            $c = (float)$r['credit'];
            $totalDebit += $d;
            $totalCredit += $c;
            $running += ($d - $c);
            $r['running_balance'] = round($running, 3);
        }

        Response::ok([
            'customer'     => $cust,
            'total_debit'  => round($totalDebit, 3),
            'total_credit' => round($totalCredit, 3),
            'balance'      => round($running, 3),
            'entries'      => $rows,
        ]);
    }

    public function collectCustomerPayment(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $cid = (int)($req->params['id'] ?? 0);
        $b = $req->body();
        $amount = (float)($b['amount'] ?? 0);
        $method = trim((string)($b['payment_method'] ?? 'cash'));
        $entryType = ($b['entry_type'] ?? 'payment') === 'advance' ? 'advance' : 'payment';
        $notes = trim((string)($b['notes'] ?? ($entryType === 'advance' ? 'Customer Advance Paid' : 'Credit Collection')));

        if ($amount <= 0) {
            Response::error('Amount must be greater than 0', 422);
        }

        $pdo = Database::getConnection();
        CustomerLedgerModel::ensureTables($pdo);
        $cStmt = $pdo->prepare("SELECT * FROM main_store_customers WHERE id = ? AND vendor_id = ? LIMIT 1");
        $cStmt->execute([$cid, $vendorId]);
        $cust = $cStmt->fetch();
        if (!$cust) {
            Response::error('Customer ledger not found', 404);
        }

        $refNo = ($entryType === 'advance' ? 'ADV-' : 'RCP-') . date('ymd') . '-' . rand(100, 999);
        CustomerLedgerModel::addEntry($pdo, $vendorId, $cid, $entryType, $refNo, null, $method, 0.0, $amount, $notes, (int)$req->user['id']);

        Response::ok(CustomerLedgerModel::getSummaryByMobile($pdo, $vendorId, $cust['mobile_no']), 'Ledger payment recorded');
    }
}

