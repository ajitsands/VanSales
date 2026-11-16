<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use Throwable;

class ShiftController
{
    public function currentShift(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanId = (int)($req->user['van_id'] ?: ($req->query('van_id') ?? 0));
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("SELECT * FROM van_shifts WHERE vendor_id = ? AND van_id = ? ORDER BY id DESC LIMIT 1");
        $stmt->execute([$vendorId, $vanId]);
        $shift = $stmt->fetch() ?: null;

        $collections = ['cash' => 0, 'card' => 0, 'qr_pay' => 0, 'bank_transfer' => 0, 'cheque' => 0, 'credit' => 0, 'total_sales' => 0, 'net_profit' => 0];
        if ($shift) {
            $pStmt = $pdo->prepare("
                SELECT payment_method, COALESCE(SUM(amount), 0) AS total
                FROM invoice_payments
                WHERE shift_id = ? AND vendor_id = ?
                GROUP BY payment_method
            ");
            $pStmt->execute([$shift['id'], $vendorId]);
            foreach ($pStmt->fetchAll() as $p) {
                $collections[$p['payment_method']] = (float)$p['total'];
            }

            $iStmt = $pdo->prepare("
                SELECT COALESCE(SUM(CASE WHEN invoice_type='sale' THEN total_amount ELSE 0 END), 0) AS total_sales,
                       COALESCE(SUM(CASE WHEN invoice_type='return' THEN total_amount ELSE 0 END), 0) AS total_returns,
                       COALESCE(SUM(net_profit), 0) AS net_profit,
                       COALESCE(SUM(total_cogs), 0) AS total_cogs
                FROM invoices WHERE shift_id = ? AND vendor_id = ?
            ");
            $iStmt->execute([$shift['id'], $vendorId]);
            $invStats = $iStmt->fetch();
            $collections = array_merge($collections, [
                'total_sales'   => (float)$invStats['total_sales'],
                'total_returns' => (float)$invStats['total_returns'],
                'total_cogs'    => (float)$invStats['total_cogs'],
                'net_profit'    => (float)$invStats['net_profit'],
            ]);
        }

        Response::ok(['shift' => $shift, 'collections' => $collections]);
    }

    public function openShift(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanId = (int)($req->user['van_id'] ?: ($req->body()['van_id'] ?? 0));
        $b = $req->body();
        $shiftName = trim($b['shift_name'] ?? 'Morning Shift');
        $shiftType = ($b['shift_type'] ?? 'same_day') === 'multi_day' ? 'multi_day' : 'same_day';
        $businessDate = $b['business_date'] ?? date('Y-m-d');

        if (!$vanId) {
            Response::error('Van ID is required', 422);
        }

        $pdo = Database::getConnection();
        $lastStmt = $pdo->prepare("SELECT * FROM van_shifts WHERE vendor_id = ? AND van_id = ? ORDER BY id DESC LIMIT 1");
        $lastStmt->execute([$vendorId, $vanId]);
        $last = $lastStmt->fetch();

        if ($last) {
            if ($last['status'] === 'open') {
                Response::error('An active shift is already open. Close the current shift first.', 409);
            }
            if ((int)$req->vendor['require_eod_closing'] && in_array($last['status'], ['closing_pending', 'rejected'], true)) {
                Response::error('Compulsory Closing Lock: Previous shift closing must be approved by Admin before opening a new shift.', 403);
            }
        }

        $stmt = $pdo->prepare("INSERT INTO van_shifts (vendor_id, van_id, driver_user_id, shift_name, shift_type, business_date, status) VALUES (?, ?, ?, ?, ?, ?, 'open')");
        $stmt->execute([$vendorId, $vanId, $req->user['id'], $shiftName, $shiftType, $businessDate]);

        Response::ok(['shift_id' => (int)$pdo->lastInsertId()], "{$shiftName} ({$shiftType}) opened", 201);
    }

    public function changeShift(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanId = (int)($req->user['van_id'] ?: ($req->body()['van_id'] ?? 0));
        $b = $req->body();
        $shiftName = trim((string)($b['shift_name'] ?? ''));
        $shiftType = ($b['shift_type'] ?? 'same_day') === 'multi_day' ? 'multi_day' : 'same_day';

        if (!$vanId) {
            Response::error('Van ID is required', 422);
        }
        if ($shiftName === '') {
            Response::error('Shift name is required', 422);
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM van_shifts WHERE vendor_id = ? AND van_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1");
        $stmt->execute([$vendorId, $vanId]);
        $active = $stmt->fetch();

        if (!$active) {
            Response::error('No active open shift found to change.', 404);
        }

        $upd = $pdo->prepare("UPDATE van_shifts SET shift_name = ?, shift_type = ? WHERE id = ?");
        $upd->execute([$shiftName, $shiftType, (int)$active['id']]);

        Response::ok([
            'shift_id'   => (int)$active['id'],
            'shift_name' => $shiftName,
            'shift_type' => $shiftType,
        ], "Shift updated to {$shiftName} ({$shiftType})");
    }

    public function submitClosing(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanId = (int)($req->user['van_id'] ?: ($req->body()['van_id'] ?? 0));
        $b = $req->body();

        $pdo = Database::getConnection();
        $shStmt = $pdo->prepare("SELECT * FROM van_shifts WHERE vendor_id = ? AND van_id = ? AND status IN ('open','rejected') ORDER BY id DESC LIMIT 1");
        $shStmt->execute([$vendorId, $vanId]);
        $shift = $shStmt->fetch();

        if (!$shift) {
            Response::error('No open shift found to close', 404);
        }

        $shiftId = (int)$shift['id'];

        $iStmt = $pdo->prepare("
            SELECT COALESCE(SUM(CASE WHEN invoice_type='sale' THEN total_amount ELSE 0 END), 0) AS total_sales,
                   COALESCE(SUM(CASE WHEN invoice_type='return' THEN total_amount ELSE 0 END), 0) AS total_returns,
                   COALESCE(SUM(total_cogs), 0) AS total_cogs,
                   COALESCE(SUM(net_profit), 0) AS net_profit
            FROM invoices WHERE shift_id = ? AND vendor_id = ?
        ");
        $iStmt->execute([$shiftId, $vendorId]);
        $inv = $iStmt->fetch();

        $pStmt = $pdo->prepare("SELECT payment_method, COALESCE(SUM(amount), 0) AS total FROM invoice_payments WHERE shift_id = ? AND vendor_id = ? GROUP BY payment_method");
        $pStmt->execute([$shiftId, $vendorId]);
        $payMap = ['cash' => 0.0, 'card' => 0.0, 'qr_pay' => 0.0, 'bank_transfer' => 0.0, 'cheque' => 0.0, 'credit' => 0.0];
        foreach ($pStmt->fetchAll() as $p) {
            $payMap[$p['payment_method']] = (float)$p['total'];
        }

        try {
            $pdo->beginTransaction();

            $clsStmt = $pdo->prepare("
                INSERT INTO closing_requests (
                    vendor_id, shift_id, van_id, driver_user_id,
                    total_sales, total_returns, total_cogs, net_profit,
                    expected_cash, declared_cash, expected_card, declared_card,
                    expected_qr, declared_qr, expected_bank_transfer, declared_bank_transfer,
                    expected_cheque, declared_cheque, expected_credit, driver_notes, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            ");
            $clsStmt->execute([
                $vendorId, $shiftId, $vanId, $req->user['id'],
                (float)$inv['total_sales'], (float)$inv['total_returns'], (float)$inv['total_cogs'], (float)$inv['net_profit'],
                $payMap['cash'], (float)($b['declared_cash'] ?? $payMap['cash']),
                $payMap['card'], (float)($b['declared_card'] ?? $payMap['card']),
                $payMap['qr_pay'], (float)($b['declared_qr'] ?? $payMap['qr_pay']),
                $payMap['bank_transfer'], (float)($b['declared_bank_transfer'] ?? $payMap['bank_transfer']),
                $payMap['cheque'], (float)($b['declared_cheque'] ?? $payMap['cheque']),
                $payMap['credit'],
                trim($b['driver_notes'] ?? ''),
            ]);

            $pdo->prepare("UPDATE van_shifts SET status = 'closing_pending' WHERE id = ?")->execute([$shiftId]);
            $pdo->commit();

            Response::ok(['closing_id' => (int)$pdo->lastInsertId()], 'Closing request submitted to Admin App for approval', 201);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Closing submission failed: ' . $e->getMessage(), 400);
        }
    }

    public function listClosings(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            SELECT c.*, v.van_code, v.van_name, s.shift_name, s.shift_type, s.business_date, u.full_name AS driver_name
            FROM closing_requests c
            INNER JOIN vans v ON v.id = c.van_id
            INNER JOIN van_shifts s ON s.id = c.shift_id
            INNER JOIN users u ON u.id = c.driver_user_id
            WHERE c.vendor_id = ?
            ORDER BY FIELD(c.status,'pending','rejected','approved'), c.id DESC
        ");
        $stmt->execute([$vendorId]);
        Response::ok($stmt->fetchAll());
    }

    public function reviewClosing(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $decision = $req->body()['decision'] ?? ''; // 'approved' or 'rejected'
        if (!in_array($decision, ['approved', 'rejected'], true)) {
            Response::error('Decision must be approved or rejected', 422);
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM closing_requests WHERE id = ? AND vendor_id = ? LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $cls = $stmt->fetch();
        if (!$cls || $cls['status'] !== 'pending') {
            Response::error('Closing request not found or already reviewed', 404);
        }

        try {
            $pdo->beginTransaction();
            $pdo->prepare("UPDATE closing_requests SET status = ?, reviewed_by = ?, review_notes = ?, reviewed_at = NOW() WHERE id = ?")
                ->execute([$decision, $req->user['id'], trim($req->body()['review_notes'] ?? ''), $id]);

            $shiftStatus = $decision === 'approved' ? 'closed' : 'rejected';
            $pdo->prepare("UPDATE van_shifts SET status = ?, closed_at = IF(?='closed', NOW(), NULL) WHERE id = ?")
                ->execute([$shiftStatus, $shiftStatus, $cls['shift_id']]);

            $pdo->commit();
            Response::ok(null, "Closing request {$decision}");
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Review failed: ' . $e->getMessage(), 400);
        }
    }
}

