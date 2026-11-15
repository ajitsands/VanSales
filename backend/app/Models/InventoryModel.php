<?php
namespace App\Models;

use App\Core\Database;
use PDO;
use RuntimeException;

class InventoryModel
{
    public static function ensureSellingPriceColumn(PDO $pdo): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }
        $col = $pdo->query("SHOW COLUMNS FROM stock_batches LIKE 'selling_price'")->fetch();
        if (!$col) {
            $pdo->exec("ALTER TABLE stock_batches ADD COLUMN selling_price DECIMAL(12,3) NULL AFTER unit_cost");
        }
        $checked = true;
    }

    /**
     * Consume stock strictly using FEFO (First-Expired, First-Out) for expiry-tracked items
     * and FIFO (First-In, First-Out) for non-expiry items.
     *
     * @return array List of ['batch_id', 'batch_no', 'expiry_date', 'unit_cost', 'selling_price', 'qty']
     */
    public static function consumeFifoFefo(
        PDO $pdo,
        int $vendorId,
        string $locationType,
        ?int $vanId,
        int $itemId,
        float $qtyNeeded
    ): array {
        self::ensureSellingPriceColumn($pdo);
        if ($qtyNeeded <= 0) {
            throw new RuntimeException('Quantity must be greater than zero');
        }

        if ($locationType === 'main_store') {
            $stmt = $pdo->prepare("
                SELECT id, batch_no, expiry_date, unit_cost, selling_price, qty_available
                FROM stock_batches
                WHERE vendor_id = ? AND location_type = 'main_store' AND item_id = ? AND qty_available > 0
                ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC, received_at ASC, id ASC
                FOR UPDATE
            ");
            $stmt->execute([$vendorId, $itemId]);
        } else {
            $stmt = $pdo->prepare("
                SELECT id, batch_no, expiry_date, unit_cost, selling_price, qty_available
                FROM stock_batches
                WHERE vendor_id = ? AND location_type = 'van' AND van_id = ? AND item_id = ? AND qty_available > 0
                ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC, received_at ASC, id ASC
                FOR UPDATE
            ");
            $stmt->execute([$vendorId, $vanId, $itemId]);
        }

        $batches = $stmt->fetchAll();
        $totalAvail = array_reduce($batches, fn($c, $b) => $c + (float)$b['qty_available'], 0.0);

        if ($totalAvail + 1e-6 < $qtyNeeded) {
            throw new RuntimeException("Insufficient stock for item ID {$itemId}. Available: {$totalAvail}, Requested: {$qtyNeeded}");
        }

        $remaining = $qtyNeeded;
        $slices = [];
        $upd = $pdo->prepare("UPDATE stock_batches SET qty_available = qty_available - ? WHERE id = ?");

        foreach ($batches as $b) {
            if ($remaining <= 1e-6) {
                break;
            }
            $avail = (float)$b['qty_available'];
            $take = min($avail, $remaining);
            $upd->execute([$take, $b['id']]);
            $slices[] = [
                'batch_id'      => (int)$b['id'],
                'batch_no'      => $b['batch_no'],
                'expiry_date'   => $b['expiry_date'],
                'unit_cost'     => (float)$b['unit_cost'],
                'selling_price' => $b['selling_price'] !== null ? (float)$b['selling_price'] : null,
                'qty'           => $take,
            ];
            $remaining -= $take;
        }

        return $slices;
    }

    /**
     * Add stock batch to Main Store or Van preserving batch/expiry metadata and batch selling price.
     */
    public static function addBatch(
        PDO $pdo,
        int $vendorId,
        string $locationType,
        ?int $vanId,
        int $itemId,
        ?int $grnId,
        string $batchNo,
        ?string $expiryDate,
        float $unitCost,
        float $qty,
        ?float $sellingPrice = null
    ): int {
        self::ensureSellingPriceColumn($pdo);
        $stmt = $pdo->prepare("
            INSERT INTO stock_batches
            (vendor_id, location_type, van_id, item_id, grn_id, batch_no, expiry_date, received_at, unit_cost, selling_price, qty_initial, qty_available)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)
        ");
        $stmt->execute([
            $vendorId,
            $locationType,
            $vanId,
            $itemId,
            $grnId,
            $batchNo,
            $expiryDate ?: null,
            $unitCost,
            $sellingPrice,
            $qty,
            $qty,
        ]);
        return (int)$pdo->lastInsertId();
    }
}

