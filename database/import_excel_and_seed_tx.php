<?php
require_once __DIR__ . '/../backend/app/Core/Database.php';
require_once __DIR__ . '/../backend/app/Models/InventoryModel.php';

use App\Core\Database;
use App\Models\InventoryModel;

$jsonPath = 'C:\\Users\\Dell\\.gemini\\antigravity\\brain\\068da8c3-c2fb-4c3b-b82c-db3097601176\\scratch\\excel_items.json';
$excelItems = json_decode(file_get_contents($jsonPath), true);
if (!$excelItems || count($excelItems) === 0) {
    fwrite(STDERR, "Failed to read excel_items.json\n");
    exit(1);
}

$pdo = Database::getConnection();
$vendorId = 1;

$adminId = (int)$pdo->query("SELECT id FROM users WHERE vendor_id = 1 AND role = 'admin' LIMIT 1")->fetchColumn();
$van1Row = $pdo->query("SELECT id, van_id FROM users WHERE vendor_id = 1 AND role = 'van' ORDER BY id ASC LIMIT 1")->fetch();
$van1UserId = (int)$van1Row['id'];
$van1Id = (int)$van1Row['van_id'];
$van2Id = (int)$pdo->query("SELECT id FROM vans WHERE vendor_id = 1 AND id != $van1Id ORDER BY id ASC LIMIT 1")->fetchColumn();
$supplierId = (int)$pdo->query("SELECT id FROM suppliers WHERE vendor_id = 1 ORDER BY id ASC LIMIT 1")->fetchColumn();
if (!$supplierId) {
    $pdo->prepare("INSERT INTO suppliers (vendor_id, name, phone) VALUES (1, 'Excel Opening Stock Supplier', '+973 17000000')")->execute();
    $supplierId = (int)$pdo->lastInsertId();
}

$shops = $pdo->query("
    SELECT s.id, s.shop_name, r.assigned_van_id
    FROM shops s
    INNER JOIN routes r ON r.id = s.route_id
    WHERE s.vendor_id = 1
    ORDER BY s.id ASC
")->fetchAll();
$van1Shops = array_values(array_filter($shops, fn($s) => (int)$s['assigned_van_id'] === $van1Id));

try {
    $pdo->beginTransaction();

    // 1. Remove Existing Transactions & Items for Vendor 1
    $pdo->exec("DELETE il FROM invoice_lines il INNER JOIN invoices i ON i.id = il.invoice_id WHERE i.vendor_id = 1");
    $pdo->exec("DELETE stl FROM stock_transfer_lines stl INNER JOIN stock_transfers st ON st.id = stl.transfer_id WHERE st.vendor_id = 1");

    $vendorTables = [
        'invoice_attachments',
        'invoice_payments',
        'invoices',
        'shop_ledger_entries',
        'closing_requests',
        'van_shifts',
        'van_returns_damages',
        'stock_transfers',
        'van_item_requests',
        'stock_batches',
        'grn_headers',
        'items',
        'shop_visits',
    ];
    foreach ($vendorTables as $tbl) {
        $pdo->prepare("DELETE FROM $tbl WHERE vendor_id = ?")->execute([$vendorId]);
    }

    // 2. Import all 881 Excel Items + Opening GRN & Main Store Batches for 146 Positive-Stock Items
    $itemStmt = $pdo->prepare("
        INSERT INTO items (vendor_id, sku, name, category, uom, purchase_price, selling_price, track_expiry, is_active)
        VALUES (?, ?, ?, 'FMCG / Trading', 'PCS', ?, ?, 1, 1)
    ");

    $totalStockVal = 0.0;
    foreach ($excelItems as $it) {
        if ($it['current_qty'] > 0) {
            $totalStockVal += $it['stock_value'];
        }
    }

    $pdo->prepare("
        INSERT INTO grn_headers (vendor_id, grn_no, supplier_id, supplier_invoice_no, total_cost, notes, received_by)
        VALUES (?, 'GRN-OPEN-20261109', ?, 'EXCEL-09-11-2026', ?, 'Opening Stock imported from Inventory_Status.xls', ?)
    ")->execute([$vendorId, $supplierId, round($totalStockVal, 3), $adminId]);
    $grnId = (int)$pdo->lastInsertId();

    $sbStmt = $pdo->prepare("
        INSERT INTO stock_batches (vendor_id, location_type, van_id, item_id, grn_id, batch_no, expiry_date, received_at, unit_cost, qty_initial, qty_available)
        VALUES (?, 'main_store', NULL, ?, ?, ?, ?, '2026-11-09 08:00:00', ?, ?, ?)
    ");

    $insertedItems = [];
    $positiveCount = 0;
    foreach ($excelItems as $idx => $it) {
        $sku = sprintf('ITM-%04d', $idx + 1);
        $itemStmt->execute([
            $vendorId,
            $sku,
            $it['name'],
            $it['cost_price'],
            $it['selling_price'],
        ]);
        $itemId = (int)$pdo->lastInsertId();
        $insertedItems[] = [
            'id'            => $itemId,
            'sku'           => $sku,
            'name'          => $it['name'],
            'current_qty'   => $it['current_qty'],
            'cost_price'    => $it['cost_price'],
            'selling_price' => $it['selling_price'],
        ];

        if ($it['current_qty'] > 0) {
            $positiveCount++;
            $batchNo = sprintf('OPEN-%04d', $positiveCount);
            $expDate = date('Y-m-d', strtotime('+' . (180 + ($positiveCount % 180)) . ' days'));
            $sbStmt->execute([$vendorId, $itemId, $grnId, $batchNo, $expDate, $it['cost_price'], $it['current_qty'], $it['current_qty']]);
        }
    }

    // Top positive-stock items with qty >= 10
    $topItems = array_values(array_filter($insertedItems, fn($x) => $x['current_qty'] >= 10));
    usort($topItems, fn($a, $b) => $b['current_qty'] <=> $a['current_qty']);

    // 3. Open Active Shifts for Van 1 & Van 2
    $shStmt = $pdo->prepare("INSERT INTO van_shifts (vendor_id, van_id, driver_user_id, shift_name, shift_type, status, opened_at) VALUES (?, ?, ?, 'Morning Shift', 'same_day', 'open', NOW())");
    $shStmt->execute([$vendorId, $van1Id, $van1UserId]);
    $van1ShiftId = (int)$pdo->lastInsertId();

    if ($van2Id) {
        $van2UserId = (int)$pdo->query("SELECT id FROM users WHERE vendor_id = 1 AND van_id = $van2Id LIMIT 1")->fetchColumn();
        if ($van2UserId) {
            $shStmt->execute([$vendorId, $van2Id, $van2UserId]);
        }
    }

    // 4. Store-to-Van Transfer to Van 1 (6 top Excel items)
    $tNo = 'TRF-S2V-' . date('ymd') . '-001';
    $pdo->prepare("
        INSERT INTO stock_transfers (vendor_id, transfer_no, transfer_type, from_location_type, from_van_id, to_van_id, otp_code, status, notes, created_by, confirmed_by, confirmed_at)
        VALUES (?, ?, 'store_to_van', 'main_store', NULL, ?, '4421', 'completed', 'Initial Van 1 load from Excel stock', ?, ?, NOW())
    ")->execute([$vendorId, $tNo, $van1Id, $adminId, $van1UserId]);
    $trfId = (int)$pdo->lastInsertId();

    $tlStmt = $pdo->prepare("INSERT INTO stock_transfer_lines (transfer_id, item_id, source_batch_id, batch_no, expiry_date, unit_cost, qty) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $vbStmt = $pdo->prepare("INSERT INTO stock_batches (vendor_id, location_type, van_id, item_id, grn_id, batch_no, expiry_date, received_at, unit_cost, qty_initial, qty_available) VALUES (?, 'van', ?, ?, NULL, ?, ?, NOW(), ?, ?, ?)");

    $van1Loaded = [];
    for ($i = 0; $i < min(6, count($topItems)); $i++) {
        $it = $topItems[$i];
        $loadQty = min(8.0, floor($it['current_qty'] / 2));
        if ($loadQty < 2) continue;
        $deducted = InventoryModel::consumeFifoFefo($pdo, $vendorId, 'main_store', null, $it['id'], $loadQty);
        foreach ($deducted as $d) {
            $tlStmt->execute([$trfId, $it['id'], $d['batch_id'], $d['batch_no'], $d['expiry_date'], $d['unit_cost'], $d['qty']]);
            $vbStmt->execute([$vendorId, $van1Id, $it['id'], $d['batch_no'], $d['expiry_date'], $d['unit_cost'], $d['qty'], $d['qty']]);
        }
        $van1Loaded[] = $it;
    }

    // 5. GPS Check-Ins + 3 Van 1 Sales Invoices (Split Cash/QR, Bank Transfer/Pending Cheque, Card/Credit)
    foreach ($van1Shops as $sIdx => $shop) {
        $pdo->prepare("INSERT INTO shop_visits (vendor_id, van_id, shop_id, driver_user_id, checkin_lat, checkin_lng, distance_m) VALUES (?, ?, ?, ?, 26.2285000, 50.5860000, 18.50)")
            ->execute([$vendorId, $van1Id, $shop['id'], $van1UserId]);

        if (!isset($van1Loaded[$sIdx])) continue;
        $itA = $van1Loaded[$sIdx];
        $itB = $van1Loaded[($sIdx + 1) % count($van1Loaded)];

        $linesToSell = [
            ['item' => $itA, 'qty' => 2.0],
            ['item' => $itB, 'qty' => 1.0],
        ];

        $subtotal = 0.0;
        $totalCost = 0.0;
        $vatAmount = 0.0;
        $preparedLines = [];
        foreach ($linesToSell as $ls) {
            $ded = InventoryModel::consumeFifoFefo($pdo, $vendorId, 'van', $van1Id, $ls['item']['id'], $ls['qty']);
            foreach ($ded as $d) {
                $lineSub = round($d['qty'] * $ls['item']['selling_price'], 3);
                $lineVat = round($lineSub * 0.10, 3);
                $subtotal += $lineSub;
                $vatAmount += $lineVat;
                $totalCost += round($d['qty'] * $d['unit_cost'], 3);
                $preparedLines[] = [
                    'item_id'     => $ls['item']['id'],
                    'batch_id'    => $d['batch_id'],
                    'batch_no'    => $d['batch_no'],
                    'expiry_date' => $d['expiry_date'],
                    'qty'         => $d['qty'],
                    'unit_price'  => $ls['item']['selling_price'],
                    'unit_cost'   => $d['unit_cost'],
                    'line_vat'    => $lineVat,
                    'line_total'  => round($lineSub + $lineVat, 3),
                ];
            }
        }
        $totalAmount = round($subtotal + $vatAmount, 3);
        $netProfit = round($subtotal - $totalCost, 3);
        $invNo = 'INV-VAN-' . date('ymd') . '-00' . ($sIdx + 1);

        $pdo->prepare("
            INSERT INTO invoices (vendor_id, invoice_no, source_type, van_id, shop_id, shift_id, driver_user_id, customer_name, invoice_type, vat_mode, subtotal, vat_amount, total_amount, total_cogs, net_profit)
            VALUES (?, ?, 'van', ?, ?, ?, ?, ?, 'sale', 'exclusive', ?, ?, ?, ?, ?)
        ")->execute([$vendorId, $invNo, $van1Id, $shop['id'], $van1ShiftId, $van1UserId, $shop['shop_name'], $subtotal, $vatAmount, $totalAmount, $totalCost, $netProfit]);
        $invoiceId = (int)$pdo->lastInsertId();

        $ilStmt = $pdo->prepare("INSERT INTO invoice_lines (invoice_id, item_id, batch_id, batch_no, expiry_date, qty, unit_price, unit_cost, line_vat, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($preparedLines as $pl) {
            $ilStmt->execute([$invoiceId, $pl['item_id'], $pl['batch_id'], $pl['batch_no'], $pl['expiry_date'], $pl['qty'], $pl['unit_price'], $pl['unit_cost'], $pl['line_vat'], $pl['line_total']]);
        }

        $ledStmt = $pdo->prepare("INSERT INTO shop_ledger_entries (vendor_id, van_id, shop_id, entry_type, ref_no, invoice_id, payment_id, debit, credit, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $ledStmt->execute([$vendorId, $van1Id, $shop['id'], 'invoice', $invNo, $invoiceId, null, $totalAmount, 0, 'Shop Sale Invoice', $van1UserId]);

        $pStmt = $pdo->prepare("INSERT INTO invoice_payments (invoice_id, vendor_id, van_id, shop_id, shift_id, payment_method, amount, reference_no, bank_name, cheque_no, cheque_date, cheque_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

        if ($sIdx === 0) {
            $cashAmt = round($totalAmount * 0.6, 3);
            $qrAmt = round($totalAmount - $cashAmt, 3);
            $pStmt->execute([$invoiceId, $vendorId, $van1Id, $shop['id'], $van1ShiftId, 'cash', $cashAmt, null, null, null, null, 'na']);
            $p1 = (int)$pdo->lastInsertId();
            $ledStmt->execute([$vendorId, $van1Id, $shop['id'], 'payment', 'CASH', $invoiceId, $p1, 0, $cashAmt, 'Paid via CASH', $van1UserId]);

            $pStmt->execute([$invoiceId, $vendorId, $van1Id, $shop['id'], $van1ShiftId, 'qr_pay', $qrAmt, 'BPAY-8812', null, null, null, 'na']);
            $p2 = (int)$pdo->lastInsertId();
            $ledStmt->execute([$vendorId, $van1Id, $shop['id'], 'payment', 'BPAY-8812', $invoiceId, $p2, 0, $qrAmt, 'Paid via QR PAY', $van1UserId]);
        } elseif ($sIdx === 1) {
            $bankAmt = round($totalAmount * 0.4, 3);
            $chqAmt = round($totalAmount - $bankAmt, 3);
            $pStmt->execute([$invoiceId, $vendorId, $van1Id, $shop['id'], $van1ShiftId, 'bank_transfer', $bankAmt, 'TRF-5520', 'NBB', null, null, 'na']);
            $p1 = (int)$pdo->lastInsertId();
            $ledStmt->execute([$vendorId, $van1Id, $shop['id'], 'payment', 'TRF-5520', $invoiceId, $p1, 0, $bankAmt, 'Paid via BANK TRANSFER', $van1UserId]);

            $pStmt->execute([$invoiceId, $vendorId, $van1Id, $shop['id'], $van1ShiftId, 'cheque', $chqAmt, '77901', 'BBK', '77901', date('Y-m-d', strtotime('+5 days')), 'pending_clearance']);
        } else {
            $cardAmt = round($totalAmount * 0.5, 3);
            $credAmt = round($totalAmount - $cardAmt, 3);
            $pStmt->execute([$invoiceId, $vendorId, $van1Id, $shop['id'], $van1ShiftId, 'card', $cardAmt, 'POS-331', null, null, null, 'na']);
            $p1 = (int)$pdo->lastInsertId();
            $ledStmt->execute([$vendorId, $van1Id, $shop['id'], 'payment', 'POS-331', $invoiceId, $p1, 0, $cardAmt, 'Paid via CARD', $van1UserId]);

            $pStmt->execute([$invoiceId, $vendorId, $van1Id, $shop['id'], $van1ShiftId, 'credit', $credAmt, null, null, null, null, 'na']);
        }
    }

    // 6. 1 Main Store Direct Sale Invoice
    if (count($topItems) > 0) {
        $msItem = $topItems[0];
        $msDed = InventoryModel::consumeFifoFefo($pdo, $vendorId, 'main_store', null, $msItem['id'], 2.0);
        $msSub = round(2.0 * $msItem['selling_price'], 3);
        $msVat = round($msSub * 0.10, 3);
        $msTot = round($msSub + $msVat, 3);
        $msCost = round(2.0 * $msItem['cost_price'], 3);
        $msProfit = round($msSub - $msCost, 3);
        $msInvNo = 'INV-MS-' . date('ymd') . '-001';
        $pdo->prepare("
            INSERT INTO invoices (vendor_id, invoice_no, source_type, van_id, shop_id, shift_id, driver_user_id, customer_name, invoice_type, vat_mode, subtotal, vat_amount, total_amount, total_cogs, net_profit)
            VALUES (?, ?, 'main_store', NULL, NULL, NULL, ?, 'Wholesale Counter Customer', 'sale', 'exclusive', ?, ?, ?, ?, ?)
        ")->execute([$vendorId, $msInvNo, $adminId, $msSub, $msVat, $msTot, $msCost, $msProfit]);
        $msInvId = (int)$pdo->lastInsertId();
        $ilStmt = $pdo->prepare("INSERT INTO invoice_lines (invoice_id, item_id, batch_id, batch_no, expiry_date, qty, unit_price, unit_cost, line_vat, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($msDed as $d) {
            $ilStmt->execute([$msInvId, $msItem['id'], $d['batch_id'], $d['batch_no'], $d['expiry_date'], $d['qty'], $msItem['selling_price'], $d['unit_cost'], $msVat, $msTot]);
        }
        $pdo->prepare("INSERT INTO invoice_payments (invoice_id, vendor_id, van_id, shop_id, shift_id, payment_method, amount, cheque_status) VALUES (?, ?, NULL, NULL, NULL, 'cash', ?, 'na')")
            ->execute([$msInvId, $vendorId, $msTot]);
    }

    $pdo->commit();
    echo "SUCCESS: Imported " . count($insertedItems) . " items (" . $positiveCount . " with opening stock). Dispatched Van 1 load & created 4 live invoices!\n";
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}
