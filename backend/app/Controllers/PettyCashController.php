<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Core\SchemaHelper;

class PettyCashController
{
    public function listEntries(Request $req): void
    {
        $pdo = Database::getConnection();
        SchemaHelper::ensurePettyCashAndWalletSchema($pdo);

        $vendorId = (int)$req->user['vendor_id'];
        $sourceType = $req->query('source_type') === 'main_store' ? 'main_store' : ($req->query('source_type') === 'van' ? 'van' : null);
        $vanId = (int)($req->query('van_id') ?? ($req->user['role'] === 'van' ? $req->user['van_id'] : 0));
        $fromDate = trim((string)($req->query('from_date') ?? ''));
        $toDate = trim((string)($req->query('to_date') ?? ''));

        $sql = "
            SELECT p.*, u.full_name AS created_by_name, v.van_name
            FROM petty_cash_entries p
            LEFT JOIN users u ON u.id = p.user_id
            LEFT JOIN vans v ON v.id = p.van_id
            WHERE p.vendor_id = ?
        ";
        $params = [$vendorId];

        if ($sourceType !== null) {
            $sql .= " AND p.source_type = ?";
            $params[] = $sourceType;
        }
        if ($vanId > 0) {
            $sql .= " AND p.van_id = ?";
            $params[] = $vanId;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $fromDate) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $toDate)) {
            $sql .= " AND p.entry_date BETWEEN ? AND ?";
            $params[] = $fromDate;
            $params[] = $toDate;
        }
        $sql .= " ORDER BY p.id DESC LIMIT 250";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $entries = $stmt->fetchAll();

        $totalIncome = 0.0;
        $totalExpense = 0.0;
        foreach ($entries as $e) {
            if ($e['entry_type'] === 'income') {
                $totalIncome += (float)$e['amount'];
            } else {
                $totalExpense += (float)$e['amount'];
            }
        }

        $walletBalance = 0.0;
        $pendingSettlement = 0.0;
        $walletEntries = [];
        if ($vanId > 0) {
            $wStmt = $pdo->prepare("
                SELECT w.*, u.full_name AS driver_name
                FROM driver_wallet_entries w
                LEFT JOIN users u ON u.id = w.driver_user_id
                WHERE w.vendor_id = ? AND w.van_id = ?
                ORDER BY w.id DESC LIMIT 100
            ");
            $wStmt->execute([$vendorId, $vanId]);
            $walletEntries = $wStmt->fetchAll();
            foreach ($walletEntries as $we) {
                $st = $we['status'] ?? 'approved';
                if ($we['entry_type'] === 'shortage' && $st === 'approved') {
                    $walletBalance += (float)$we['amount'];
                } elseif (in_array($we['entry_type'], ['excess', 'settlement'], true)) {
                    if ($st === 'approved') {
                        $walletBalance -= (float)$we['amount'];
                    } elseif ($st === 'pending' && $we['entry_type'] === 'settlement') {
                        $pendingSettlement += (float)$we['amount'];
                    }
                }
            }
        }

        Response::ok([
            'entries'                   => $entries,
            'summary'                   => [
                'total_income'  => round($totalIncome, 3),
                'total_expense' => round($totalExpense, 3),
                'net_petty'     => round($totalIncome - $totalExpense, 3),
            ],
            'wallet_balance'            => round($walletBalance, 3),
            'pending_wallet_settlement' => round($pendingSettlement, 3),
            'wallet_entries'            => $walletEntries,
        ]);
    }

    public function createEntry(Request $req): void
    {
        $pdo = Database::getConnection();
        SchemaHelper::ensurePettyCashAndWalletSchema($pdo);

        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $sourceType = ($b['source_type'] ?? ($req->user['role'] === 'van' ? 'van' : 'main_store')) === 'main_store'
            ? 'main_store'
            : 'van';
        $vanId = $sourceType === 'van'
            ? (int)($b['van_id'] ?? $req->user['van_id'] ?? 0)
            : null;
        $entryType = ($b['entry_type'] ?? 'expense') === 'income' ? 'income' : 'expense';
        $category = trim((string)($b['category'] ?? ($entryType === 'income' ? 'Other Income' : 'Misc Expense')));
        $amount = round((float)($b['amount'] ?? 0), 3);
        $notes = trim((string)($b['notes'] ?? ''));
        $entryDate = trim((string)($b['entry_date'] ?? date('Y-m-d')));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $entryDate)) {
            $entryDate = date('Y-m-d');
        }

        if ($amount <= 0) {
            Response::error('Amount must be greater than 0', 422);
        }
        if ($sourceType === 'van' && !$vanId) {
            Response::error('Van ID is required for Van petty cash', 422);
        }

        $shiftId = null;
        if ($sourceType === 'van' && $vanId) {
            $shStmt = $pdo->prepare("SELECT id FROM van_shifts WHERE vendor_id = ? AND van_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1");
            $shStmt->execute([$vendorId, $vanId]);
            $shiftId = $shStmt->fetchColumn() ?: null;
        }

        $savedAttachments = [];
        $rawAttachments = is_array($b['attachments'] ?? null) ? $b['attachments'] : [];
        if (!empty($rawAttachments)) {
            $uploadDir = __DIR__ . '/../../public/uploads/petty_cash';
            if (!is_dir($uploadDir)) {
                @mkdir($uploadDir, 0775, true);
            }
            foreach ($rawAttachments as $att) {
                $b64 = (string)($att['data_base64'] ?? '');
                if ($b64 === '') {
                    continue;
                }
                if (preg_match('/^data:([^;]+);base64,(.+)$/', $b64, $m)) {
                    $mime = $m[1];
                    $raw = base64_decode($m[2], true);
                } else {
                    $mime = (string)($att['mime_type'] ?? 'image/jpeg');
                    $raw = base64_decode($b64, true);
                }
                if ($raw === false || strlen($raw) === 0) {
                    continue;
                }
                $ext = str_contains($mime, 'pdf') ? 'pdf' : (str_contains($mime, 'png') ? 'png' : 'jpg');
                $fname = 'pc_' . $vendorId . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
                if (file_put_contents($uploadDir . '/' . $fname, $raw) !== false) {
                    $savedAttachments[] = [
                        'file_name' => $att['file_name'] ?? $fname,
                        'mime_type' => $mime,
                        'file_path' => '/uploads/petty_cash/' . $fname,
                    ];
                }
            }
        }
        $primaryBillPath = $savedAttachments[0]['file_path'] ?? null;
        $attachmentsJson = !empty($savedAttachments) ? json_encode($savedAttachments) : null;

        $stmt = $pdo->prepare("
            INSERT INTO petty_cash_entries (vendor_id, source_type, van_id, shift_id, user_id, entry_type, category, amount, notes, entry_date, bill_attachment_path, attachments_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $vendorId,
            $sourceType,
            $vanId,
            $shiftId ? (int)$shiftId : null,
            (int)$req->user['id'],
            $entryType,
            $category ?: 'Misc',
            $amount,
            $notes ?: null,
            $entryDate,
            $primaryBillPath,
            $attachmentsJson,
        ]);

        Response::ok([
            'id'                   => (int)$pdo->lastInsertId(),
            'bill_attachment_path' => $primaryBillPath,
        ], ucfirst($entryType) . ' recorded in Petty Cash', 201);
    }

    public function settleWallet(Request $req): void
    {
        $pdo = Database::getConnection();
        SchemaHelper::ensurePettyCashAndWalletSchema($pdo);

        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $vanId = (int)($b['van_id'] ?? $req->user['van_id'] ?? 0);
        $amount = round((float)($b['amount'] ?? 0), 3);
        $notes = trim((string)($b['notes'] ?? 'Wallet shortage settlement'));

        if (!$vanId || $amount <= 0) {
            Response::error('Valid Van ID and positive settlement amount are required', 422);
        }

        $isVan = ($req->user['role'] ?? '') === 'van';
        $status = $isVan ? 'pending' : 'approved';

        $stmt = $pdo->prepare("
            INSERT INTO driver_wallet_entries (vendor_id, van_id, driver_user_id, entry_type, amount, status, reviewed_by, reviewed_at, notes)
            VALUES (?, ?, ?, 'settlement', ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $vendorId,
            $vanId,
            (int)$req->user['id'],
            $amount,
            $status,
            $isVan ? null : (int)$req->user['id'],
            $isVan ? null : date('Y-m-d H:i:s'),
            $notes,
        ]);

        Response::ok([
            'id'     => (int)$pdo->lastInsertId(),
            'status' => $status,
        ], $isVan ? 'Wallet payment submitted for Admin approval' : 'Driver wallet settlement approved', 201);
    }

    public function listWalletSettlements(Request $req): void
    {
        $pdo = Database::getConnection();
        SchemaHelper::ensurePettyCashAndWalletSchema($pdo);
        $vendorId = (int)$req->user['vendor_id'];

        $stmt = $pdo->prepare("
            SELECT w.*, v.van_code, v.van_name, u.full_name AS driver_name,
                   COALESCE((
                       SELECT SUM(CASE WHEN w2.entry_type='shortage' AND w2.status='approved' THEN w2.amount
                                       WHEN w2.entry_type IN ('excess','settlement') AND w2.status='approved' THEN -w2.amount
                                       ELSE 0 END)
                       FROM driver_wallet_entries w2
                       WHERE w2.vendor_id = w.vendor_id AND w2.van_id = w.van_id
                   ), 0) AS current_wallet_balance
            FROM driver_wallet_entries w
            INNER JOIN vans v ON v.id = w.van_id
            LEFT JOIN users u ON u.id = w.driver_user_id
            WHERE w.vendor_id = ? AND w.entry_type = 'settlement'
            ORDER BY FIELD(w.status,'pending','rejected','approved'), w.id DESC
        ");
        $stmt->execute([$vendorId]);
        Response::ok($stmt->fetchAll());
    }

    public function reviewWalletSettlement(Request $req): void
    {
        $pdo = Database::getConnection();
        SchemaHelper::ensurePettyCashAndWalletSchema($pdo);
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $decision = (string)($req->body()['decision'] ?? '');
        if (!in_array($decision, ['approved', 'rejected'], true)) {
            Response::error('Decision must be approved or rejected', 422);
        }

        $stmt = $pdo->prepare("SELECT * FROM driver_wallet_entries WHERE id = ? AND vendor_id = ? AND entry_type = 'settlement' LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $row = $stmt->fetch();
        if (!$row || $row['status'] !== 'pending') {
            Response::error('Wallet settlement request not found or already reviewed', 404);
        }

        $upd = $pdo->prepare("UPDATE driver_wallet_entries SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?");
        $upd->execute([$decision, (int)$req->user['id'], $id]);

        Response::ok(null, "Wallet payment {$decision}");
    }
}
