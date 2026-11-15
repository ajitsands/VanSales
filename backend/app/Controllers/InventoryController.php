<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;

class InventoryController
{
    public function listBatches(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $locationType = $req->query('location_type');
        $vanId = $req->query('van_id');

        // Van users can only see their own van batches (or all vans' summary for Van-to-Van discovery)
        if ($req->user['role'] === 'van' && !$locationType) {
            $locationType = 'van';
            $vanId = $req->user['van_id'];
        }

        $pdo = Database::getConnection();
        \App\Models\InventoryModel::ensureSellingPriceColumn($pdo);

        $sql = "
            SELECT b.*, i.sku, i.name AS item_name, i.uom, COALESCE(b.selling_price, i.selling_price) AS selling_price, i.track_expiry, v.van_code, v.van_name
            FROM stock_batches b
            INNER JOIN items i ON i.id = b.item_id
            LEFT JOIN vans v ON v.id = b.van_id
            WHERE b.vendor_id = ? AND b.qty_available > 0
        ";
        $params = [$vendorId];

        if ($locationType) {
            $sql .= " AND b.location_type = ?";
            $params[] = $locationType;
        }
        if ($vanId) {
            $sql .= " AND b.van_id = ?";
            $params[] = (int)$vanId;
        }

        $sql .= " ORDER BY CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END, b.expiry_date ASC, b.received_at ASC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::ok($stmt->fetchAll());
    }

    public function vanStockSummary(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanId = (int)($req->query('van_id') ?: ($req->user['van_id'] ?? 0));

        $pdo = Database::getConnection();
        \App\Models\InventoryModel::ensureSellingPriceColumn($pdo);
        $sql = "
            SELECT i.id AS item_id, i.sku, i.barcode, i.name, i.category, i.uom, i.purchase_price,
                   COALESCE(
                     (SELECT b2.selling_price FROM stock_batches b2
                      WHERE b2.item_id = i.id AND b2.vendor_id = i.vendor_id AND b2.location_type = 'van' AND b2.van_id = ? AND b2.qty_available > 0 AND b2.selling_price IS NOT NULL
                      ORDER BY CASE WHEN b2.expiry_date IS NULL THEN 1 ELSE 0 END, b2.expiry_date ASC, b2.received_at ASC, b2.id ASC
                      LIMIT 1),
                     i.selling_price
                   ) AS selling_price,
                   i.track_expiry,
                   COALESCE(SUM(b.qty_available), 0) AS qty_available,
                   MIN(b.expiry_date) AS nearest_expiry
            FROM items i
            LEFT JOIN stock_batches b ON b.item_id = i.id AND b.vendor_id = i.vendor_id AND b.location_type = 'van' AND b.van_id = ? AND b.qty_available > 0
            WHERE i.vendor_id = ? AND i.is_active = 1
            GROUP BY i.id
            HAVING qty_available > 0
            ORDER BY i.name ASC
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$vanId, $vanId, $vendorId]);
        $rows = $stmt->fetchAll();

        $bStmt = $pdo->prepare("
            SELECT item_id, batch_no, qty_available, selling_price, expiry_date
            FROM stock_batches
            WHERE vendor_id = ? AND location_type = 'van' AND van_id = ? AND qty_available > 0
            ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC, received_at ASC, id ASC
        ");
        $bStmt->execute([$vendorId, $vanId]);
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
            $r['van_batches'] = $batchesByItem[(int)$r['item_id']] ?? [];
        }
        Response::ok($rows);
    }
}

