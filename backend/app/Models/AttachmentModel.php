<?php
namespace App\Models;

use PDO;

class AttachmentModel
{
    private const ALLOWED_MIMES = [
        'image/jpeg'      => 'jpg',
        'image/jpg'       => 'jpg',
        'image/png'       => 'png',
        'image/webp'      => 'webp',
        'image/gif'       => 'gif',
        'application/pdf' => 'pdf',
    ];

    private const ALLOWED_TYPES = ['payment_screenshot', 'cheque_photo', 'bank_slip', 'other'];

    /**
     * Save multiple base64-encoded attachments to disk and record them in invoice_attachments.
     */
    public static function saveAttachments(
        PDO $pdo,
        int $vendorId,
        ?int $invoiceId,
        ?int $paymentId,
        array $attachments,
        ?int $uploadedBy
    ): array {
        if (empty($attachments)) {
            return [];
        }

        $uploadDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'attachments';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0775, true);
        }

        $stmt = $pdo->prepare("
            INSERT INTO invoice_attachments (vendor_id, invoice_id, payment_id, attachment_type, file_name, mime_type, file_path, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $saved = [];
        foreach ($attachments as $att) {
            $raw = $att['data_base64'] ?? '';
            if ($raw === '') {
                continue;
            }

            $mime = strtolower(trim($att['mime_type'] ?? 'image/png'));
            if (str_starts_with($raw, 'data:')) {
                if (preg_match('/^data:([^;]+);base64,(.*)$/s', $raw, $m)) {
                    $mime = strtolower(trim($m[1]));
                    $raw = $m[2];
                }
            }

            $ext = self::ALLOWED_MIMES[$mime] ?? null;
            if (!$ext) {
                continue;
            }

            $binary = base64_decode($raw, true);
            if ($binary === false || strlen($binary) === 0) {
                continue;
            }

            $attType = in_array($att['attachment_type'] ?? '', self::ALLOWED_TYPES, true)
                ? $att['attachment_type']
                : 'payment_screenshot';

            $origName = basename(trim($att['file_name'] ?? ('attachment.' . $ext)));
            $origName = preg_replace('/[^A-Za-z0-9._-]/', '_', $origName);
            if ($origName === '') {
                $origName = 'attachment.' . $ext;
            }

            $storedName = 'att_' . $vendorId . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
            $fullPath = $uploadDir . DIRECTORY_SEPARATOR . $storedName;
            file_put_contents($fullPath, $binary);

            $relPath = '/uploads/attachments/' . $storedName;
            $stmt->execute([
                $vendorId,
                $invoiceId,
                $paymentId,
                $attType,
                $origName,
                $mime,
                $relPath,
                $uploadedBy,
            ]);
            $attId = (int)$pdo->lastInsertId();
            $saved[] = [
                'id'              => $attId,
                'attachment_type' => $attType,
                'file_name'       => $origName,
                'mime_type'       => $mime,
                'file_path'       => $relPath,
                'url'             => '/api/attachments/' . $attId . '/file',
            ];
        }

        return $saved;
    }
}

