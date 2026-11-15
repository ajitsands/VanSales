<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Models\AttachmentModel;

class AttachmentController
{
    public function upload(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $invoiceId = !empty($b['invoice_id']) ? (int)$b['invoice_id'] : null;
        $paymentId = !empty($b['payment_id']) ? (int)$b['payment_id'] : null;
        $attachments = $b['attachments'] ?? [];
        if (empty($attachments) && !empty($b['data_base64'])) {
            $attachments = [$b];
        }
        if (empty($attachments)) {
            Response::error('No valid attachments provided', 422);
        }

        $pdo = Database::getConnection();
        $saved = AttachmentModel::saveAttachments($pdo, $vendorId, $invoiceId, $paymentId, $attachments, (int)$req->user['id']);
        Response::ok($saved, 'Attachments uploaded', 201);
    }

    public function listByInvoice(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $invoiceId = (int)($req->params['id'] ?? 0);
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT id, attachment_type, file_name, mime_type, file_path, created_at FROM invoice_attachments WHERE vendor_id = ? AND invoice_id = ? ORDER BY id ASC");
        $stmt->execute([$vendorId, $invoiceId]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['url'] = '/api/attachments/' . $r['id'] . '/file';
        }
        Response::ok($rows);
    }

    public function serveFile(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM invoice_attachments WHERE id = ? AND vendor_id = ? LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Attachment not found', 404);
        }

        $fullPath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public' . str_replace('/', DIRECTORY_SEPARATOR, $row['file_path']);
        if (!is_file($fullPath)) {
            Response::error('Attachment file missing on disk', 404);
        }

        header('Content-Type: ' . $row['mime_type']);
        header('Content-Disposition: inline; filename="' . basename($row['file_name']) . '"');
        header('Content-Length: ' . filesize($fullPath));
        readfile($fullPath);
        exit;
    }
}

