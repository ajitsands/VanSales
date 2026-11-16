<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\SchemaHelper;
use Throwable;

class ShiftController
{
    public function currentShift(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanId = (int)($req->user['van_id'] ?: ($req->query('van_id') ?? 0));
        $pdo = Database::getConnection();
        SchemaHelper::ensurePettyCashAndWalletSchema($pdo);

        $stmt = $pdo->prepare("SELECT * FROM van_shifts WHERE vendor_id = ? AND van_id = ? ORDER BY id DESC LIMIT 1");
        $stmt->execute([$vendorId, $vanId]);
        $shift = $stmt->fetch() ?: null;

        // Collect all unclosed shifts (open, rejected, or closing_pending for current preview)
        $unclosedStmt = $pdo->prepare("
            SELECT id, shift_name, business_date, status
            FROM van_shifts
            WHERE vendor_id = ? AND van_id = ? AND status IN ('open','rejected','closing_pending')
            ORDER BY id ASC
        ");
        $unclosedStmt->execute([$vendorId, $vanId]);
        $unclosedShifts = $unclosedStmt->fetchAll();
        $unclosedIds = array_map(fn($s) => (int)$s['id'], $unclosedShifts);
        $unclosedDates = array_values(array_unique(array_map(fn($s) => $s['business_date'], $unclosedShifts)));

        $collections = [
            'cash'                  => 0.0,
            'card'                  => 0.0,
            'qr_pay'                => 0.0,
            'bank_transfer'         => 0.0,
            'cheque'                => 0.0,
            'credit'                => 0.0,
            'total_sales'           => 0.0,
            'total_returns'         => 0.0,
            'total_cogs'            => 0.0,
            'net_profit'            => 0.0,
            'petty_cash_income'     => 0.0,
            'petty_cash_expense'    => 0.0,
            'expected_cash_net'     => 0.0,
            'unclosed_shifts_count' => count($unclosedIds),
            'unclosed_dates'        => $unclosedDates,
        ];

        if (!empty($unclosedIds)) {
            $ph = implode(',', array_fill(0, count($unclosedIds), '?'));
            $pStmt = $pdo->prepare("
                SELECT payment_method, COALESCE(SUM(amount), 0) AS total
                FROM invoice_payments
                WHERE vendor_id = ? AND shift_id IN ({$ph})
                GROUP BY payment_method
            ");
            $pStmt->execute(array_merge([$vendorId], $unclosedIds));
            foreach ($pStmt->fetchAll() as $p) {
                $collections[$p['payment_method']] = (float)$p['total'];
            }

            $iStmt = $pdo->prepare("
                SELECT COALESCE(SUM(CASE WHEN invoice_type='sale' THEN total_amount ELSE 0 END), 0) AS total_sales,
                       COALESCE(SUM(CASE WHEN invoice_type='return' THEN total_amount ELSE 0 END), 0) AS total_returns,
                       COALESCE(SUM(net_profit), 0) AS net_profit,
                       COALESCE(SUM(total_cogs), 0) AS total_cogs
                FROM invoices WHERE vendor_id = ? AND shift_id IN ({$ph})
            ");
            $iStmt->execute(array_merge([$vendorId], $unclosedIds));
            $invStats = $iStmt->fetch();
            $collections['total_sales'] = (float)$invStats['total_sales'];
            $collections['total_returns'] = (float)$invStats['total_returns'];
            $collections['total_cogs'] = (float)$invStats['total_cogs'];
            $collections['net_profit'] = (float)$invStats['net_profit'];
        }

        // Unsettled Van Petty Cash (Expenses & Other Income)
        $pcStmt = $pdo->prepare("
            SELECT COALESCE(SUM(CASE WHEN entry_type='income' THEN amount ELSE 0 END), 0) AS petty_income,
                   COALESCE(SUM(CASE WHEN entry_type='expense' THEN amount ELSE 0 END), 0) AS petty_expense
            FROM petty_cash_entries
            WHERE vendor_id = ? AND source_type = 'van' AND van_id = ? AND closing_id IS NULL
        ");
        $pcStmt->execute([$vendorId, $vanId]);
        $pcRow = $pcStmt->fetch();
        $pettyIncome = (float)($pcRow['petty_income'] ?? 0);
        $pettyExpense = (float)($pcRow['petty_expense'] ?? 0);
        $collections['petty_cash_income'] = round($pettyIncome, 3);
        $collections['petty_cash_expense'] = round($pettyExpense, 3);
        $collections['expected_cash_net'] = max(0.0, round($collections['cash'] + $pettyIncome - $pettyExpense, 3));

        // Driver Wallet Balance (Shortage kept in wallet)
        $wStmt = $pdo->prepare("
            SELECT COALESCE(SUM(CASE WHEN entry_type='shortage' THEN amount WHEN entry_type IN ('excess','settlement') THEN -amount ELSE 0 END), 0) AS bal
            FROM driver_wallet_entries
            WHERE vendor_id = ? AND van_id = ?
        ");
        $wStmt->execute([$vendorId, $vanId]);
        $walletBalance = round((float)$wStmt->fetchColumn(), 3);

        Response::ok([
            'shift'                 => $shift,
            'collections'           => $collections,
            'driver_wallet_balance' => $walletBalance,
        ]);
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
        SchemaHelper::ensurePettyCashAndWalletSchema($pdo);

        $shStmt = $pdo->prepare("SELECT * FROM van_shifts WHERE vendor_id = ? AND van_id = ? AND status IN ('open','rejected') ORDER BY id ASC");
        $shStmt->execute([$vendorId, $vanId]);
        $openShifts = $shStmt->fetchAll();

        if (empty($openShifts)) {
            Response::error('No open shift found to close', 404);
        }

        $openIds = array_map(fn($s) => (int)$s['id'], $openShifts);
        $shiftId = end($openIds);
        $ph = implode(',', array_fill(0, count($openIds), '?'));

        $iStmt = $pdo->prepare("
            SELECT COALESCE(SUM(CASE WHEN invoice_type='sale' THEN total_amount ELSE 0 END), 0) AS total_sales,
                   COALESCE(SUM(CASE WHEN invoice_type='return' THEN total_amount ELSE 0 END), 0) AS total_returns,
                   COALESCE(SUM(total_cogs), 0) AS total_cogs,
                   COALESCE(SUM(net_profit), 0) AS net_profit
            FROM invoices WHERE vendor_id = ? AND shift_id IN ({$ph})
        ");
        $iStmt->execute(array_merge([$vendorId], $openIds));
        $inv = $iStmt->fetch();

        $pStmt = $pdo->prepare("SELECT payment_method, COALESCE(SUM(amount), 0) AS total FROM invoice_payments WHERE vendor_id = ? AND shift_id IN ({$ph}) GROUP BY payment_method");
        $pStmt->execute(array_merge([$vendorId], $openIds));
        $payMap = ['cash' => 0.0, 'card' => 0.0, 'qr_pay' => 0.0, 'bank_transfer' => 0.0, 'cheque' => 0.0, 'credit' => 0.0];
        foreach ($pStmt->fetchAll() as $p) {
            $payMap[$p['payment_method']] = (float)$p['total'];
        }

        $pcStmt = $pdo->prepare("
            SELECT COALESCE(SUM(CASE WHEN entry_type='income' THEN amount ELSE 0 END), 0) AS petty_income,
                   COALESCE(SUM(CASE WHEN entry_type='expense' THEN amount ELSE 0 END), 0) AS petty_expense
            FROM petty_cash_entries
            WHERE vendor_id = ? AND source_type = 'van' AND van_id = ? AND closing_id IS NULL
        ");
        $pcStmt->execute([$vendorId, $vanId]);
        $pcRow = $pcStmt->fetch();
        $pettyIncome = round((float)($pcRow['petty_income'] ?? 0), 3);
        $pettyExpense = round((float)($pcRow['petty_expense'] ?? 0), 3);
        $expectedCashNet = max(0.0, round($payMap['cash'] + $pettyIncome - $pettyExpense, 3));

        $declCash = (float)($b['declared_cash'] ?? $expectedCashNet);
        $declCard = (float)($b['declared_card'] ?? $payMap['card']);
        $declQr = (float)($b['declared_qr'] ?? $payMap['qr_pay']);
        $declBank = (float)($b['declared_bank_transfer'] ?? $payMap['bank_transfer']);
        $declCheque = (float)($b['declared_cheque'] ?? $payMap['cheque']);

        $totalExpected = $expectedCashNet + $payMap['card'] + $payMap['qr_pay'] + $payMap['bank_transfer'] + $payMap['cheque'];
        $totalDeclared = $declCash + $declCard + $declQr + $declBank + $declCheque;
        $shortage = max(0.0, round($totalExpected - $totalDeclared, 3));
        $keepInWallet = !empty($b['keep_shortage_in_wallet']) ? 1 : 0;

        if ($shortage > 0.0005 && !$keepInWallet) {
            Response::error('Declared amount is short by ' . number_format($shortage, 3) . '. Enable "Keep Shortage in Driver Wallet & Close" to proceed.', 422);
        }

        try {
            $pdo->beginTransaction();

            $clsStmt = $pdo->prepare("
                INSERT INTO closing_requests (
                    vendor_id, shift_id, van_id, driver_user_id,
                    total_sales, total_returns, total_cogs, net_profit,
                    expected_cash, declared_cash, expected_card, declared_card,
                    expected_qr, declared_qr, expected_bank_transfer, declared_bank_transfer,
                    expected_cheque, declared_cheque, expected_credit,
                    petty_cash_income, petty_cash_expense, shortage_amount, keep_shortage_in_wallet, included_shift_ids,
                    driver_notes, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            ");
            $clsStmt->execute([
                $vendorId, $shiftId, $vanId, $req->user['id'],
                (float)$inv['total_sales'], (float)$inv['total_returns'], (float)$inv['total_cogs'], (float)$inv['net_profit'],
                $expectedCashNet, $declCash,
                $payMap['card'], $declCard,
                $payMap['qr_pay'], $declQr,
                $payMap['bank_transfer'], $declBank,
                $payMap['cheque'], $declCheque,
                $payMap['credit'],
                $pettyIncome, $pettyExpense, $shortage, $keepInWallet, implode(',', $openIds),
                trim($b['driver_notes'] ?? ''),
            ]);
            $closingId = (int)$pdo->lastInsertId();

            if ($shortage > 0.0005 && $keepInWallet) {
                $pdo->prepare("
                    INSERT INTO driver_wallet_entries (vendor_id, van_id, driver_user_id, shift_id, closing_id, entry_type, amount, notes)
                    VALUES (?, ?, ?, ?, ?, 'shortage', ?, ?)
                ")->execute([
                    $vendorId, $vanId, $req->user['id'], $shiftId, $closingId, $shortage,
                    'Closing shortage kept in wallet (Closing #' . $closingId . ')'
                ]);
            }

            $pdo->prepare("
                UPDATE petty_cash_entries
                SET closing_id = ?
                WHERE vendor_id = ? AND source_type = 'van' AND van_id = ? AND closing_id IS NULL
            ")->execute([$closingId, $vendorId, $vanId]);

            $pdo->prepare("UPDATE van_shifts SET status = 'closing_pending' WHERE id IN ({$ph})")->execute($openIds);
            $pdo->commit();

            Response::ok([
                'closing_id'       => $closingId,
                'shortage_amount'  => $shortage,
                'shifts_included'  => count($openIds),
            ], 'Closing request submitted to Admin App for approval', 201);
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
            $shiftIds = array_filter(array_map('intval', explode(',', (string)($cls['included_shift_ids'] ?? ''))));
            if (empty($shiftIds)) {
                $shiftIds = [(int)$cls['shift_id']];
            }
            $ph = implode(',', array_fill(0, count($shiftIds), '?'));
            $pdo->prepare("UPDATE van_shifts SET status = ?, closed_at = IF(?='closed', NOW(), NULL) WHERE id IN ({$ph})")
                ->execute(array_merge([$shiftStatus, $shiftStatus], $shiftIds));

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

