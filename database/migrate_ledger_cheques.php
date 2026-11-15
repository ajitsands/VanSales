<?php
$host = getenv('DB_HOST') ?: '127.0.0.1';
$port = getenv('DB_PORT') ?: '3306';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') !== false ? getenv('DB_PASS') : 'S@nds1@b';

$pdo = new PDO("mysql:host={$host};port={$port};dbname=van_sales_db;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

// 1. Alter invoice_payments for bank_transfer, cheque, cheque_status, shop_id
$cols = $pdo->query("SHOW COLUMNS FROM invoice_payments")->fetchAll(PDO::FETCH_COLUMN);
$pdo->exec("ALTER TABLE invoice_payments MODIFY COLUMN invoice_id BIGINT NULL");
$pdo->exec("ALTER TABLE invoice_payments MODIFY COLUMN payment_method ENUM('cash','card','qr_pay','bank_transfer','cheque','credit') NOT NULL");

$addCols = [
    'shop_id'       => "ALTER TABLE invoice_payments ADD COLUMN shop_id INT NULL AFTER van_id",
    'bank_name'     => "ALTER TABLE invoice_payments ADD COLUMN bank_name VARCHAR(100) NULL AFTER reference_no",
    'cheque_no'     => "ALTER TABLE invoice_payments ADD COLUMN cheque_no VARCHAR(60) NULL AFTER bank_name",
    'cheque_date'   => "ALTER TABLE invoice_payments ADD COLUMN cheque_date DATE NULL AFTER cheque_no",
    'cheque_status' => "ALTER TABLE invoice_payments ADD COLUMN cheque_status ENUM('na','pending_clearance','cleared','bounced') NOT NULL DEFAULT 'na' AFTER cheque_date",
    'cleared_by'    => "ALTER TABLE invoice_payments ADD COLUMN cleared_by INT NULL AFTER cheque_status",
    'cleared_at'    => "ALTER TABLE invoice_payments ADD COLUMN cleared_at DATETIME NULL AFTER cleared_by",
    'cheque_notes'  => "ALTER TABLE invoice_payments ADD COLUMN cheque_notes TEXT NULL AFTER cleared_at",
];
foreach ($addCols as $col => $sql) {
    if (!in_array($col, $cols, true)) {
        $pdo->exec($sql);
    }
}

// 2. Alter closing_requests for bank_transfer & cheque
$clsCols = $pdo->query("SHOW COLUMNS FROM closing_requests")->fetchAll(PDO::FETCH_COLUMN);
$clsAdds = [
    'expected_bank_transfer' => "ALTER TABLE closing_requests ADD COLUMN expected_bank_transfer DECIMAL(12,3) NOT NULL DEFAULT 0.000 AFTER declared_qr",
    'declared_bank_transfer' => "ALTER TABLE closing_requests ADD COLUMN declared_bank_transfer DECIMAL(12,3) NOT NULL DEFAULT 0.000 AFTER expected_bank_transfer",
    'expected_cheque'        => "ALTER TABLE closing_requests ADD COLUMN expected_cheque DECIMAL(12,3) NOT NULL DEFAULT 0.000 AFTER declared_bank_transfer",
    'declared_cheque'        => "ALTER TABLE closing_requests ADD COLUMN declared_cheque DECIMAL(12,3) NOT NULL DEFAULT 0.000 AFTER expected_cheque",
];
foreach ($clsAdds as $col => $sql) {
    if (!in_array($col, $clsCols, true)) {
        $pdo->exec($sql);
    }
}

// 3. Create shop_ledger_entries
$pdo->exec("
CREATE TABLE IF NOT EXISTS shop_ledger_entries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  van_id INT NULL,
  shop_id INT NOT NULL,
  entry_type ENUM('invoice','payment','cheque_cleared','return','adjustment') NOT NULL,
  ref_no VARCHAR(60) NULL,
  invoice_id BIGINT NULL,
  payment_id BIGINT NULL,
  debit DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  credit DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  notes TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shop_ledger (vendor_id, shop_id, created_at),
  CONSTRAINT fk_ledger_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_ledger_shop FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
) ENGINE=InnoDB
");

// 4. Backfill existing van invoices into shop_ledger_entries if empty
$ledgerCnt = (int)$pdo->query("SELECT COUNT(*) FROM shop_ledger_entries")->fetchColumn();
if ($ledgerCnt === 0) {
    $invs = $pdo->query("SELECT * FROM invoices WHERE shop_id IS NOT NULL")->fetchAll(PDO::FETCH_ASSOC);
    $insL = $pdo->prepare("INSERT INTO shop_ledger_entries (vendor_id, van_id, shop_id, entry_type, ref_no, invoice_id, payment_id, debit, credit, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($invs as $inv) {
        if ($inv['invoice_type'] === 'sale') {
            $insL->execute([$inv['vendor_id'], $inv['van_id'], $inv['shop_id'], 'invoice', $inv['invoice_no'], $inv['id'], null, $inv['total_amount'], 0, 'Shop Sale Invoice']);
        } else {
            $insL->execute([$inv['vendor_id'], $inv['van_id'], $inv['shop_id'], 'return', $inv['invoice_no'], $inv['id'], null, 0, $inv['total_amount'], 'Shop Return Credit']);
        }
        $pays = $pdo->prepare("SELECT * FROM invoice_payments WHERE invoice_id = ?");
        $pays->execute([$inv['id']]);
        foreach ($pays->fetchAll(PDO::FETCH_ASSOC) as $p) {
            $pdo->prepare("UPDATE invoice_payments SET shop_id = ? WHERE id = ?")->execute([$inv['shop_id'], $p['id']]);
            if (in_array($p['payment_method'], ['cash', 'card', 'qr_pay', 'bank_transfer'], true)) {
                $insL->execute([$inv['vendor_id'], $inv['van_id'], $inv['shop_id'], 'payment', $p['reference_no'] ?: strtoupper($p['payment_method']), $inv['id'], $p['id'], 0, $p['amount'], 'Paid via ' . strtoupper($p['payment_method'])]);
            }
        }
    }

    // Add 1 sample Pending Cheque & 1 Bank Transfer for Demo Shop 1 (Al-Jazeera Cold Store)
    $sampleInv = $pdo->query("SELECT * FROM invoices WHERE shop_id IS NOT NULL ORDER BY id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if ($sampleInv) {
        // Debit 45.000 BHD credit invoice + Pending Cheque of 45.000 BHD (so ledger still shows 45.000 owed until Cheque is Confirmed/Cleared!)
        $pdo->prepare("INSERT INTO invoices (vendor_id, invoice_no, source_type, van_id, shop_id, customer_name, shift_id, driver_user_id, vat_mode, subtotal, vat_amount, total_amount, total_cogs, net_profit, invoice_type) VALUES (?, 'INV-V1-CHQ-01', 'van', ?, ?, ?, ?, ?, 'exclusive', 40.909, 4.091, 45.000, 31.000, 9.909, 'sale')")
            ->execute([$sampleInv['vendor_id'], $sampleInv['van_id'], $sampleInv['shop_id'], $sampleInv['customer_name'], $sampleInv['shift_id'], $sampleInv['driver_user_id']]);
        $newInvId = (int)$pdo->lastInsertId();
        $insL->execute([$sampleInv['vendor_id'], $sampleInv['van_id'], $sampleInv['shop_id'], 'invoice', 'INV-V1-CHQ-01', $newInvId, null, 45.000, 0, 'Credit/Cheque Invoice (Awaiting Cheque Clearance)']);

        $pdo->prepare("INSERT INTO invoice_payments (invoice_id, vendor_id, van_id, shop_id, shift_id, payment_method, amount, reference_no, bank_name, cheque_no, cheque_date, cheque_status) VALUES (?, ?, ?, ?, ?, 'cheque', 45.000, 'CHQ-77821', 'National Bank of Bahrain (NBB)', '77821', DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'pending_clearance')")
            ->execute([$newInvId, $sampleInv['vendor_id'], $sampleInv['van_id'], $sampleInv['shop_id'], $sampleInv['shift_id']]);
    }
}

echo "Migration for Bank Transfer, Cheques, Reconciliation & Shop Ledger completed successfully!\n";

