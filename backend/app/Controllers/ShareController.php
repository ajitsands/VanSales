<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;

class ShareController
{
    public function createLink(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $type = ($b['share_type'] ?? 'ledger') === 'invoice' ? 'invoice' : 'ledger';
        $shopId = !empty($b['shop_id']) ? (int)$b['shop_id'] : null;
        $invoiceId = !empty($b['invoice_id']) ? (int)$b['invoice_id'] : null;
        $fromDate = !empty($b['from_date']) ? trim($b['from_date']) : null;
        $toDate = !empty($b['to_date']) ? trim($b['to_date']) : null;

        if ($type === 'ledger' && !$shopId) {
            Response::error('shop_id is required to share a ledger', 422);
        }
        if ($type === 'invoice' && !$invoiceId) {
            Response::error('invoice_id is required to share a bill', 422);
        }

        $token = bin2hex(random_bytes(16));
        $pdo = Database::getConnection();
        $pdo->prepare("
            INSERT INTO share_links (vendor_id, token, share_type, shop_id, invoice_id, from_date, to_date, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ")->execute([$vendorId, $token, $type, $shopId, $invoiceId, $fromDate, $toDate, $req->user['id']]);

        Response::ok([
            'token'      => $token,
            'share_path' => '/?share=' . $token,
        ], 'Share link generated', 201);
    }

    public function viewPublic(Request $req): void
    {
        $token = trim($req->params['token'] ?? '');
        if ($token === '') {
            Response::error('Invalid share link', 404);
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM share_links WHERE token = ? LIMIT 1");
        $stmt->execute([$token]);
        $link = $stmt->fetch();
        if (!$link) {
            Response::error('Shared link not found or expired', 404);
        }

        $vendorId = (int)$link['vendor_id'];
        $vStmt = $pdo->prepare("SELECT id, company_name, logo_url, currency_code AS currency, header_bg_color AS header_color, vat_percent FROM vendors WHERE id = ? LIMIT 1");
        $vStmt->execute([$vendorId]);
        $vendor = $vStmt->fetch();

        if ($link['share_type'] === 'ledger') {
            $statement = LedgerChequeController::buildShopStatementData(
                $pdo,
                $vendorId,
                (int)$link['shop_id'],
                $link['from_date'],
                $link['to_date']
            );
            if (!$statement) {
                Response::error('Shop not found', 404);
            }
            Response::ok([
                'share_type' => 'ledger',
                'vendor'     => $vendor,
                'statement'  => $statement,
            ]);
        }

        // Invoice share
        $invStmt = $pdo->prepare("
            SELECT inv.*, s.shop_name, s.shop_code, s.phone AS shop_phone, s.address AS shop_address, v.van_name
            FROM invoices inv
            LEFT JOIN shops s ON s.id = inv.shop_id
            LEFT JOIN vans v ON v.id = inv.van_id
            WHERE inv.id = ? AND inv.vendor_id = ? LIMIT 1
        ");
        $invStmt->execute([(int)$link['invoice_id'], $vendorId]);
        $inv = $invStmt->fetch();
        if (!$inv) {
            Response::error('Invoice not found', 404);
        }

        $lStmt = $pdo->prepare("SELECT l.*, i.name AS item_name, i.sku FROM invoice_lines l INNER JOIN items i ON i.id = l.item_id WHERE l.invoice_id = ?");
        $lStmt->execute([$inv['id']]);
        $pStmt = $pdo->prepare("SELECT payment_method, amount, reference_no, bank_name, cheque_no, cheque_date, cheque_status FROM invoice_payments WHERE invoice_id = ?");
        $pStmt->execute([$inv['id']]);

        Response::ok([
            'share_type' => 'invoice',
            'vendor'     => $vendor,
            'invoice'    => $inv,
            'lines'      => $lStmt->fetchAll(),
            'payments'   => $pStmt->fetchAll(),
        ]);
    }
}
