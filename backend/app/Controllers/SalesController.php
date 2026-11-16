<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Models\InventoryModel;
use App\Models\AttachmentModel;
use App\Models\CustomerLedgerModel;
use Throwable;

class SalesController
{
    public function listInvoices(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $sql = "
            SELECT inv.*, v.van_name, s.shop_name, u.full_name AS driver_name
            FROM invoices inv
            LEFT JOIN vans v ON v.id = inv.van_id
            LEFT JOIN shops s ON s.id = inv.shop_id
            LEFT JOIN users u ON u.id = inv.driver_user_id
            WHERE inv.vendor_id = ?
        ";
        $params = [$vendorId];
        if ($req->user['role'] === 'van') {
            $sql .= " AND inv.van_id = ?";
            $params[] = (int)$req->user['van_id'];
        }
        $sql .= " ORDER BY inv.id DESC LIMIT 100";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $lStmt = $pdo->prepare("SELECT l.*, i.sku, i.name AS item_name, i.uom FROM invoice_lines l INNER JOIN items i ON i.id = l.item_id WHERE l.invoice_id = ?");
        $pStmt = $pdo->prepare("SELECT * FROM invoice_payments WHERE invoice_id = ?");
        $aStmt = $pdo->prepare("SELECT id, attachment_type, file_name, mime_type, file_path, created_at FROM invoice_attachments WHERE invoice_id = ? ORDER BY id ASC");
        foreach ($rows as &$r) {
            $lStmt->execute([$r['id']]);
            $r['lines'] = $lStmt->fetchAll();
            $pStmt->execute([$r['id']]);
            $r['payments'] = $pStmt->fetchAll();
            $aStmt->execute([$r['id']]);
            $r['attachments'] = $aStmt->fetchAll();
        }
        Response::ok($rows);
    }

    public function createInvoice(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $sourceType = ($req->user['role'] === 'van') ? 'van' : (($b['source_type'] ?? 'main_store') === 'van' ? 'van' : 'main_store');
        $invoiceType = ($b['invoice_type'] ?? 'sale') === 'return' ? 'return' : 'sale';
        $vatMode = in_array($b['vat_mode'] ?? '', ['inclusive', 'exclusive'], true) ? $b['vat_mode'] : ($req->vendor['default_vat_mode'] ?? 'exclusive');
        $vatRate = (float)($req->vendor['vat_percent'] ?? 10.0) / 100.0;
        $lines = $b['lines'] ?? [];
        $payments = $b['payments'] ?? [];

        if (empty($lines)) {
            Response::error('At least one line item is required', 422);
        }

        $pdo = Database::getConnection();
        $vanId = null;
        $shopId = !empty($b['shop_id']) ? (int)$b['shop_id'] : null;
        $shiftId = null;
        $customerName = trim($b['customer_name'] ?? 'Walk-in Customer');
        $customerMobile = trim($b['customer_mobile'] ?? '');
        $mainStoreCustomerId = null;
        if ($sourceType === 'main_store' && $customerMobile !== '') {
            $mainStoreCustomerId = CustomerLedgerModel::upsertCustomer($pdo, $vendorId, $customerMobile, $customerName);
        }

        if ($sourceType === 'van') {
            $vanId = $req->user['role'] === 'van' ? (int)$req->user['van_id'] : (int)($b['van_id'] ?? 0);
            if (!$vanId || !$shopId) {
                Response::error('Van and Shop are required for Van billing', 422);
            }

            // 1. Check active open shift
            $shStmt = $pdo->prepare("SELECT * FROM van_shifts WHERE vendor_id = ? AND van_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1");
            $shStmt->execute([$vendorId, $vanId]);
            $shift = $shStmt->fetch();
            if (!$shift) {
                Response::error('No open shift found. Please open a Shift (or wait for previous EOD approval) before billing.', 403);
            }
            $shiftId = (int)$shift['id'];

            // 2. Check exclusive route assignment
            $shopStmt = $pdo->prepare("SELECT s.*, r.assigned_van_id FROM shops s INNER JOIN routes r ON r.id = s.route_id WHERE s.id = ? AND s.vendor_id = ? LIMIT 1");
            $shopStmt->execute([$shopId, $vendorId]);
            $shop = $shopStmt->fetch();
            if (!$shop || (int)$shop['assigned_van_id'] !== $vanId) {
                Response::error('Forbidden: Only the assigned van can bill this shop', 403);
            }
            $customerName = $shop['shop_name'];

            // 3. Check arrival check-in gate
            $visStmt = $pdo->prepare("SELECT id FROM shop_visits WHERE vendor_id = ? AND van_id = ? AND shop_id = ? AND DATE(checked_in_at) = CURDATE() LIMIT 1");
            $visStmt->execute([$vendorId, $vanId, $shopId]);
            if (!$visStmt->fetch()) {
                Response::error('Arrival Gate Locked: Van must check in at the shop location before generating a bill.', 403);
            }
        }

        try {
            $pdo->beginTransaction();

            $subtotal = 0.0;
            $vatAmount = 0.0;
            $totalAmount = 0.0;
            $totalCogs = 0.0;
            $discount = (float)($b['discount_amount'] ?? 0);
            $preparedLines = [];

            $itemStmt = $pdo->prepare("SELECT * FROM items WHERE id = ? AND vendor_id = ? LIMIT 1");

            foreach ($lines as $ln) {
                $itemId = (int)$ln['item_id'];
                $qty = (float)$ln['qty'];
                $itemStmt->execute([$itemId, $vendorId]);
                $item = $itemStmt->fetch();
                if (!$item || $qty <= 0) {
                    throw new \RuntimeException("Invalid item or quantity");
                }

                $catalogPrice = (float)$item['selling_price'];
                $reqUnitPrice = isset($ln['unit_price']) ? (float)$ln['unit_price'] : null;

                if ($invoiceType === 'sale') {
                    $slices = InventoryModel::consumeFifoFefo($pdo, $vendorId, $sourceType, $vanId, $itemId, $qty);
                    $firstSlicePrice = isset($slices[0]['selling_price']) && $slices[0]['selling_price'] !== null
                        ? (float)$slices[0]['selling_price']
                        : $catalogPrice;
                    if ($reqUnitPrice !== null && $reqUnitPrice < ($firstSlicePrice - 0.0005)) {
                        throw new \RuntimeException("Selling price for {$item['name']} cannot be less than " . number_format($firstSlicePrice, 3));
                    }
                    $isCustomPrice = $reqUnitPrice !== null
                        && abs($reqUnitPrice - $firstSlicePrice) > 0.0005
                        && abs($reqUnitPrice - $catalogPrice) > 0.0005;

                    foreach ($slices as $sl) {
                        $slicePrice = $isCustomPrice
                            ? $reqUnitPrice
                            : ($sl['selling_price'] !== null ? (float)$sl['selling_price'] : $catalogPrice);
                        $grossSlice = $sl['qty'] * $slicePrice;
                        if ($vatMode === 'inclusive') {
                            $sliceNet = $grossSlice / (1 + $vatRate);
                            $sliceVat = $grossSlice - $sliceNet;
                            $sliceTotal = $grossSlice;
                        } else {
                            $sliceNet = $grossSlice;
                            $sliceVat = $grossSlice * $vatRate;
                            $sliceTotal = $sliceNet + $sliceVat;
                        }
                        $subtotal += $sliceNet;
                        $vatAmount += $sliceVat;
                        $totalAmount += $sliceTotal;
                        $totalCogs += ($sl['qty'] * $sl['unit_cost']);
                        $preparedLines[] = [
                            'item_id'          => $itemId,
                            'batch_id'         => $sl['batch_id'],
                            'batch_no'         => $sl['batch_no'],
                            'expiry_date'      => $sl['expiry_date'],
                            'qty'              => $sl['qty'],
                            'unit_price'       => $slicePrice,
                            'unit_cost'        => $sl['unit_cost'],
                            'line_vat'         => round($sliceVat, 3),
                            'line_total'       => round($sliceTotal, 3),
                            'return_condition' => null,
                        ];
                    }
                } else {
                    // Shop Return
                    $unitPrice = $reqUnitPrice !== null ? $reqUnitPrice : $catalogPrice;
                    $grossLine = $qty * $unitPrice;
                    if ($vatMode === 'inclusive') {
                        $lineNet = $grossLine / (1 + $vatRate);
                        $lineVat = $grossLine - $lineNet;
                        $lineTotal = $grossLine;
                    } else {
                        $lineNet = $grossLine;
                        $lineVat = $grossLine * $vatRate;
                        $lineTotal = $lineNet + $lineVat;
                    }
                    $subtotal += $lineNet;
                    $vatAmount += $lineVat;
                    $totalAmount += $lineTotal;
                    $cond = ($ln['return_condition'] ?? 'good') === 'damaged' ? 'damaged' : 'good';
                    $unitCost = (float)$item['purchase_price'];
                    $totalCogs += ($qty * $unitCost);
                    if ($cond === 'good') {
                        InventoryModel::addBatch($pdo, $vendorId, $sourceType, $vanId, $itemId, null, 'RET-' . date('ymd'), null, $unitCost, $qty, $unitPrice);
                    }
                    $preparedLines[] = [
                        'item_id'          => $itemId,
                        'batch_id'         => null,
                        'batch_no'         => 'RET-' . date('ymd'),
                        'expiry_date'      => null,
                        'qty'              => $qty,
                        'unit_price'       => $unitPrice,
                        'unit_cost'        => $unitCost,
                        'line_vat'         => round($lineVat, 3),
                        'line_total'       => round($lineTotal, 3),
                        'return_condition' => $cond,
                    ];
                }
            }

            $totalAmount = max(0, round($totalAmount - $discount, 3));
            $subtotal = round($subtotal, 3);
            $vatAmount = round($vatAmount, 3);
            $totalCogs = round($totalCogs, 3);
            $netProfit = $invoiceType === 'sale'
                ? round(($subtotal - $discount) - $totalCogs, 3)
                : round(-(($subtotal - $discount) - $totalCogs), 3);

            $prefix = $invoiceType === 'return' ? 'CRN-' : ($sourceType === 'van' ? 'INV-V' . $vanId . '-' : 'INV-MS-');
            $invNo = $prefix . date('ymd') . '-' . rand(1000, 9999);

            $invStmt = $pdo->prepare("
                INSERT INTO invoices (vendor_id, invoice_no, source_type, van_id, shop_id, customer_name, shift_id, driver_user_id, vat_mode, subtotal, vat_amount, discount_amount, total_amount, total_cogs, net_profit, invoice_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $invStmt->execute([
                $vendorId, $invNo, $sourceType, $vanId, $shopId, $customerName, $shiftId, $req->user['id'],
                $vatMode, $subtotal, $vatAmount, round($discount, 3), $totalAmount, $totalCogs, $netProfit, $invoiceType
            ]);
            $invoiceId = (int)$pdo->lastInsertId();

            $lStmt = $pdo->prepare("
                INSERT INTO invoice_lines (invoice_id, item_id, batch_id, batch_no, expiry_date, qty, unit_price, unit_cost, line_vat, line_total, return_condition)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            foreach ($preparedLines as $pl) {
                $lStmt->execute([
                    $invoiceId, $pl['item_id'], $pl['batch_id'], $pl['batch_no'], $pl['expiry_date'],
                    $pl['qty'], $pl['unit_price'], $pl['unit_cost'], $pl['line_vat'], $pl['line_total'], $pl['return_condition']
                ]);
            }

            // Record Shop Ledger Debit (for Sale) or Credit (for Return)
            if ($shopId) {
                $ledStmt = $pdo->prepare("
                    INSERT INTO shop_ledger_entries (vendor_id, van_id, shop_id, entry_type, ref_no, invoice_id, payment_id, debit, credit, notes, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                if ($invoiceType === 'sale') {
                    $ledStmt->execute([$vendorId, $vanId, $shopId, 'invoice', $invNo, $invoiceId, null, $totalAmount, 0, 'Shop Sale Invoice', $req->user['id']]);
                } else {
                    $ledStmt->execute([$vendorId, $vanId, $shopId, 'return', $invNo, $invoiceId, null, 0, $totalAmount, 'Shop Return Credit', $req->user['id']]);
                }
            }

            // Record Main Store Customer Ledger Debit (for Sale) or Credit (for Return)
            if ($mainStoreCustomerId) {
                CustomerLedgerModel::addEntry(
                    $pdo,
                    $vendorId,
                    $mainStoreCustomerId,
                    $invoiceType === 'sale' ? 'invoice' : 'return',
                    $invNo,
                    $invoiceId,
                    null,
                    $invoiceType === 'sale' ? $totalAmount : 0.0,
                    $invoiceType === 'sale' ? 0.0 : $totalAmount,
                    $invoiceType === 'sale' ? 'Main Store POS Invoice' : 'Main Store Return',
                    (int)$req->user['id']
                );
            }

            // Record Multi-Tender Split Payments (Cash, Card, QR Pay, Bank Transfer, Cheque, Credit)
            if ($invoiceType === 'sale') {
                if (empty($payments)) {
                    $payments = [['payment_method' => 'cash', 'amount' => $totalAmount, 'reference_no' => null]];
                }
                $pStmt = $pdo->prepare("
                    INSERT INTO invoice_payments (invoice_id, vendor_id, van_id, shop_id, shift_id, payment_method, amount, reference_no, bank_name, cheque_no, cheque_date, cheque_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $allowedMethods = ['cash', 'card', 'qr_pay', 'bank_transfer', 'cheque', 'credit'];
                foreach ($payments as $pay) {
                    $amt = (float)($pay['amount'] ?? 0);
                    if ($amt <= 0) {
                        continue;
                    }
                    $method = in_array($pay['payment_method'] ?? '', $allowedMethods, true) ? $pay['payment_method'] : 'cash';
                    $chqStatus = $method === 'cheque' ? 'pending_clearance' : 'na';
                    $refNo = trim($pay['reference_no'] ?? '') ?: ($method === 'cheque' ? trim($pay['cheque_no'] ?? '') : null);
                    $pStmt->execute([
                        $invoiceId, $vendorId, $vanId, $shopId, $shiftId, $method, round($amt, 3),
                        $refNo,
                        trim($pay['bank_name'] ?? '') ?: null,
                        trim($pay['cheque_no'] ?? '') ?: null,
                        !empty($pay['cheque_date']) ? $pay['cheque_date'] : null,
                        $chqStatus,
                    ]);
                    $payId = (int)$pdo->lastInsertId();

                    // Immediate ledger credit ONLY for settled methods (NOT credit, NOT pending cheque!)
                    if ($shopId && in_array($method, ['cash', 'card', 'qr_pay', 'bank_transfer'], true)) {
                        $ledStmt->execute([
                            $vendorId, $vanId, $shopId, 'payment', $refNo ?: strtoupper($method),
                            $invoiceId, $payId, 0, round($amt, 3),
                            'Paid via ' . strtoupper(str_replace('_', ' ', $method)),
                            $req->user['id'],
                        ]);
                    }
                    if ($mainStoreCustomerId && in_array($method, ['cash', 'card', 'qr_pay', 'bank_transfer'], true)) {
                        CustomerLedgerModel::addEntry(
                            $pdo,
                            $vendorId,
                            $mainStoreCustomerId,
                            'payment',
                            $refNo ?: $invNo,
                            $invoiceId,
                            $method,
                            0.0,
                            round($amt, 3),
                            'Paid via ' . strtoupper(str_replace('_', ' ', $method)),
                            (int)$req->user['id']
                        );
                    }
                }
            }

            $savedAttachments = AttachmentModel::saveAttachments(
                $pdo,
                $vendorId,
                $invoiceId,
                null,
                $b['attachments'] ?? [],
                (int)$req->user['id']
            );

            $pdo->commit();
            Response::ok([
                'invoice_id'   => $invoiceId,
                'invoice_no'   => $invNo,
                'total_amount' => $totalAmount,
                'vat_amount'   => $vatAmount,
                'subtotal'     => $subtotal,
                'net_profit'   => $netProfit,
                'attachments'  => $savedAttachments,
            ], ucfirst($invoiceType) . ' generated successfully', 201);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Billing failed: ' . $e->getMessage(), 400);
        }
    }

    public function correctInvoice(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $invoiceId = (int)($req->params['id'] ?? 0);
        $b = $req->body();
        $lines = $b['lines'] ?? [];
        $payments = $b['payments'] ?? [];
        $reason = trim($b['correction_reason'] ?? 'Bill corrected by Van Driver');

        if (empty($lines)) {
            Response::error('At least one line item is required for correction', 422);
        }

        $pdo = Database::getConnection();
        $invStmt = $pdo->prepare("SELECT * FROM invoices WHERE id = ? AND vendor_id = ? LIMIT 1");
        $invStmt->execute([$invoiceId, $vendorId]);
        $oldInv = $invStmt->fetch();
        if (!$oldInv) {
            Response::error('Invoice not found', 404);
        }
        if ($req->user['role'] === 'van' && (int)$oldInv['van_id'] !== (int)$req->user['van_id']) {
            Response::error('Forbidden: You can only correct your own van bills', 403);
        }

        $sourceType = $oldInv['source_type'];
        $vanId = $oldInv['van_id'] ? (int)$oldInv['van_id'] : null;
        $shopId = $oldInv['shop_id'] ? (int)$oldInv['shop_id'] : null;
        $shiftId = $oldInv['shift_id'] ? (int)$oldInv['shift_id'] : null;
        $invoiceType = $oldInv['invoice_type'];
        $vatMode = in_array($b['vat_mode'] ?? '', ['inclusive', 'exclusive'], true) ? $b['vat_mode'] : $oldInv['vat_mode'];
        $vatRate = (float)($req->vendor['vat_percent'] ?? 10.0) / 100.0;
        $discount = (float)($b['discount_amount'] ?? $oldInv['discount_amount'] ?? 0);

        try {
            $pdo->beginTransaction();

            // 1. Fetch & archive the old bill snapshot
            $oldLinesStmt = $pdo->prepare("SELECT l.*, i.name AS item_name, i.sku FROM invoice_lines l INNER JOIN items i ON i.id = l.item_id WHERE l.invoice_id = ?");
            $oldLinesStmt->execute([$invoiceId]);
            $oldLines = $oldLinesStmt->fetchAll();

            $oldPaysStmt = $pdo->prepare("SELECT * FROM invoice_payments WHERE invoice_id = ?");
            $oldPaysStmt->execute([$invoiceId]);
            $oldPays = $oldPaysStmt->fetchAll();

            $origNo = $oldInv['original_invoice_no'] ?: $oldInv['invoice_no'];
            $newCount = (int)$oldInv['correction_count'] + 1;
            $newInvNo = $origNo . '-C' . $newCount;

            $pdo->prepare("
                INSERT INTO invoice_archives (
                    vendor_id, invoice_id, original_invoice_no, archived_invoice_no, new_invoice_no,
                    van_id, shop_id, customer_name, vat_mode, subtotal, vat_amount, total_amount, total_cogs, net_profit,
                    lines_json, payments_json, correction_reason, corrected_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                $vendorId, $invoiceId, $origNo, $oldInv['invoice_no'], $newInvNo,
                $vanId, $shopId, $oldInv['customer_name'], $oldInv['vat_mode'],
                $oldInv['subtotal'], $oldInv['vat_amount'], $oldInv['total_amount'], $oldInv['total_cogs'], $oldInv['net_profit'],
                json_encode($oldLines), json_encode($oldPays), $reason, $req->user['id'],
            ]);

            // 2. Restore old stock batches (only for sales)
            if ($invoiceType === 'sale') {
                $restoreStmt = $pdo->prepare("UPDATE stock_batches SET qty_available = qty_available + ? WHERE id = ?");
                foreach ($oldLines as $ol) {
                    if (!empty($ol['batch_id'])) {
                        $restoreStmt->execute([(float)$ol['qty'], (int)$ol['batch_id']]);
                    }
                }
            }

            // 3. Remove old lines, payments & ledger entries for this invoice
            $pdo->prepare("DELETE FROM invoice_lines WHERE invoice_id = ?")->execute([$invoiceId]);
            $pdo->prepare("DELETE FROM invoice_payments WHERE invoice_id = ?")->execute([$invoiceId]);
            $pdo->prepare("DELETE FROM shop_ledger_entries WHERE invoice_id = ?")->execute([$invoiceId]);

            // 4. Recalculate new lines & deduct stock via FIFO/FEFO
            $subtotal = 0.0;
            $vatAmount = 0.0;
            $totalAmount = 0.0;
            $totalCogs = 0.0;
            $preparedLines = [];
            $itemStmt = $pdo->prepare("SELECT * FROM items WHERE id = ? AND vendor_id = ? LIMIT 1");

            foreach ($lines as $ln) {
                $itemId = (int)($ln['item_id'] ?? 0);
                $qty = (float)($ln['qty'] ?? 0);
                if ($qty <= 0) {
                    continue;
                }
                $itemStmt->execute([$itemId, $vendorId]);
                $item = $itemStmt->fetch();
                if (!$item) {
                    throw new \RuntimeException("Item ID $itemId not found");
                }
                $unitPrice = isset($ln['unit_price']) ? (float)$ln['unit_price'] : (float)$item['selling_price'];
                $grossLine = $qty * $unitPrice;
                if ($vatMode === 'inclusive') {
                    $lineNet = $grossLine / (1 + $vatRate);
                    $lineVat = $grossLine - $lineNet;
                    $lineTotal = $grossLine;
                } else {
                    $lineNet = $grossLine;
                    $lineVat = $grossLine * $vatRate;
                    $lineTotal = $lineNet + $lineVat;
                }

                $subtotal += $lineNet;
                $vatAmount += $lineVat;
                $totalAmount += $lineTotal;

                if ($invoiceType === 'sale') {
                    $slices = InventoryModel::consumeFifoFefo($pdo, $vendorId, $sourceType, $vanId, $itemId, $qty);
                    foreach ($slices as $sl) {
                        $sliceRatio = $sl['qty'] / $qty;
                        $totalCogs += ($sl['qty'] * $sl['unit_cost']);
                        $preparedLines[] = [
                            'item_id'          => $itemId,
                            'batch_id'         => $sl['batch_id'],
                            'batch_no'         => $sl['batch_no'],
                            'expiry_date'      => $sl['expiry_date'],
                            'qty'              => $sl['qty'],
                            'unit_price'       => $unitPrice,
                            'unit_cost'        => $sl['unit_cost'],
                            'line_vat'         => round($lineVat * $sliceRatio, 3),
                            'line_total'       => round($lineTotal * $sliceRatio, 3),
                            'return_condition' => null,
                        ];
                    }
                } else {
                    $cond = ($ln['return_condition'] ?? 'good') === 'damaged' ? 'damaged' : 'good';
                    $unitCost = (float)$item['purchase_price'];
                    $totalCogs += ($qty * $unitCost);
                    $preparedLines[] = [
                        'item_id'          => $itemId,
                        'batch_id'         => null,
                        'batch_no'         => 'RET-' . date('ymd'),
                        'expiry_date'      => null,
                        'qty'              => $qty,
                        'unit_price'       => $unitPrice,
                        'unit_cost'        => $unitCost,
                        'line_vat'         => round($lineVat, 3),
                        'line_total'       => round($lineTotal, 3),
                        'return_condition' => $cond,
                    ];
                }
            }

            $totalAmount = max(0, round($totalAmount - $discount, 3));
            $subtotal = round($subtotal, 3);
            $vatAmount = round($vatAmount, 3);
            $totalCogs = round($totalCogs, 3);
            $netProfit = $invoiceType === 'sale'
                ? round(($subtotal - $discount) - $totalCogs, 3)
                : round(-(($subtotal - $discount) - $totalCogs), 3);

            // 5. Update invoice header with Updated Bill Number
            $pdo->prepare("
                UPDATE invoices
                SET invoice_no = ?, original_invoice_no = ?, vat_mode = ?, subtotal = ?, vat_amount = ?,
                    discount_amount = ?, total_amount = ?, total_cogs = ?, net_profit = ?,
                    is_corrected = 1, correction_count = ?, last_corrected_at = NOW(), last_corrected_by = ?
                WHERE id = ?
            ")->execute([
                $newInvNo, $origNo, $vatMode, $subtotal, $vatAmount,
                round($discount, 3), $totalAmount, $totalCogs, $netProfit,
                $newCount, $req->user['id'], $invoiceId,
            ]);

            $lStmt = $pdo->prepare("
                INSERT INTO invoice_lines (invoice_id, item_id, batch_id, batch_no, expiry_date, qty, unit_price, unit_cost, line_vat, line_total, return_condition)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            foreach ($preparedLines as $pl) {
                $lStmt->execute([
                    $invoiceId, $pl['item_id'], $pl['batch_id'], $pl['batch_no'], $pl['expiry_date'],
                    $pl['qty'], $pl['unit_price'], $pl['unit_cost'], $pl['line_vat'], $pl['line_total'], $pl['return_condition']
                ]);
            }

            // 6. Post updated Shop Ledger & Split Payments
            $ledStmt = $pdo->prepare("
                INSERT INTO shop_ledger_entries (vendor_id, van_id, shop_id, entry_type, ref_no, invoice_id, payment_id, debit, credit, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            if ($shopId) {
                if ($invoiceType === 'sale') {
                    $ledStmt->execute([$vendorId, $vanId, $shopId, 'invoice', $newInvNo, $invoiceId, null, $totalAmount, 0, 'Corrected Shop Sale Invoice (was ' . $oldInv['invoice_no'] . ')', $req->user['id']]);
                } else {
                    $ledStmt->execute([$vendorId, $vanId, $shopId, 'return', $newInvNo, $invoiceId, null, 0, $totalAmount, 'Corrected Shop Return Credit', $req->user['id']]);
                }
            }

            if ($invoiceType === 'sale') {
                if (empty($payments)) {
                    $payments = [['payment_method' => 'credit', 'amount' => $totalAmount, 'reference_no' => null]];
                }
                $pStmt = $pdo->prepare("
                    INSERT INTO invoice_payments (invoice_id, vendor_id, van_id, shop_id, shift_id, payment_method, amount, reference_no, bank_name, cheque_no, cheque_date, cheque_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $allowedMethods = ['cash', 'card', 'qr_pay', 'bank_transfer', 'cheque', 'credit'];
                foreach ($payments as $pay) {
                    $amt = (float)($pay['amount'] ?? 0);
                    if ($amt <= 0) continue;
                    $method = in_array($pay['payment_method'] ?? '', $allowedMethods, true) ? $pay['payment_method'] : 'cash';
                    $chqStatus = $method === 'cheque' ? 'pending_clearance' : 'na';
                    $refNo = trim($pay['reference_no'] ?? '') ?: ($method === 'cheque' ? trim($pay['cheque_no'] ?? '') : null);
                    $pStmt->execute([
                        $invoiceId, $vendorId, $vanId, $shopId, $shiftId, $method, round($amt, 3),
                        $refNo,
                        trim($pay['bank_name'] ?? '') ?: null,
                        trim($pay['cheque_no'] ?? '') ?: null,
                        !empty($pay['cheque_date']) ? $pay['cheque_date'] : null,
                        $chqStatus,
                    ]);
                    $payId = (int)$pdo->lastInsertId();

                    if ($shopId && in_array($method, ['cash', 'card', 'qr_pay', 'bank_transfer'], true)) {
                        $ledStmt->execute([
                            $vendorId, $vanId, $shopId, 'payment', $refNo ?: strtoupper($method),
                            $invoiceId, $payId, 0, round($amt, 3),
                            'Paid via ' . strtoupper(str_replace('_', ' ', $method)) . ' (Corrected Bill)',
                            $req->user['id'],
                        ]);
                    }
                }
            }

            $savedAttachments = AttachmentModel::saveAttachments(
                $pdo, $vendorId, $invoiceId, null, $b['attachments'] ?? [], (int)$req->user['id']
            );

            $pdo->commit();
            Response::ok([
                'invoice_id'          => $invoiceId,
                'invoice_no'          => $newInvNo,
                'original_invoice_no' => $origNo,
                'total_amount'        => $totalAmount,
                'vat_amount'          => $vatAmount,
                'subtotal'            => $subtotal,
                'net_profit'          => $netProfit,
                'attachments'         => $savedAttachments,
            ], 'Bill corrected & old version archived as ' . $oldInv['invoice_no'], 200);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Bill correction failed: ' . $e->getMessage(), 400);
        }
    }

    public function listArchives(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            SELECT a.*, s.shop_name, s.shop_code, v.van_name, u.full_name AS corrected_by_name,
                   cur.invoice_no AS current_invoice_no, cur.total_amount AS current_total_amount,
                   cur.vat_amount AS current_vat_amount, cur.correction_count
            FROM invoice_archives a
            LEFT JOIN shops s ON s.id = a.shop_id
            LEFT JOIN vans v ON v.id = a.van_id
            LEFT JOIN users u ON u.id = a.corrected_by
            LEFT JOIN invoices cur ON cur.id = a.invoice_id
            WHERE a.vendor_id = ?
            ORDER BY a.id DESC
            LIMIT 150
        ");
        $stmt->execute([$vendorId]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['lines'] = json_decode($r['lines_json'] ?: '[]', true);
            $r['payments'] = json_decode($r['payments_json'] ?: '[]', true);
            unset($r['lines_json'], $r['payments_json']);
        }
        Response::ok($rows);
    }
}

