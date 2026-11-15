<?php
require_once __DIR__ . '/../backend/app/Core/Database.php';

use App\Core\Database;

$pdo = Database::getConnection();

// Add correction tracking columns to invoices if missing
$cols = $pdo->query("DESCRIBE invoices")->fetchAll(PDO::FETCH_COLUMN);
if (!in_array('original_invoice_no', $cols, true)) {
    $pdo->exec("ALTER TABLE invoices ADD COLUMN original_invoice_no VARCHAR(50) NULL AFTER invoice_no");
}
if (!in_array('is_corrected', $cols, true)) {
    $pdo->exec("ALTER TABLE invoices ADD COLUMN is_corrected TINYINT(1) NOT NULL DEFAULT 0 AFTER invoice_type");
}
if (!in_array('correction_count', $cols, true)) {
    $pdo->exec("ALTER TABLE invoices ADD COLUMN correction_count INT NOT NULL DEFAULT 0 AFTER is_corrected");
}
if (!in_array('last_corrected_at', $cols, true)) {
    $pdo->exec("ALTER TABLE invoices ADD COLUMN last_corrected_at DATETIME NULL AFTER correction_count");
}
if (!in_array('last_corrected_by', $cols, true)) {
    $pdo->exec("ALTER TABLE invoices ADD COLUMN last_corrected_by INT NULL AFTER last_corrected_at");
}

// Create invoice_archives table
$pdo->exec("
CREATE TABLE IF NOT EXISTS invoice_archives (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  invoice_id BIGINT NOT NULL,
  original_invoice_no VARCHAR(50) NOT NULL,
  archived_invoice_no VARCHAR(50) NOT NULL,
  new_invoice_no VARCHAR(50) NOT NULL,
  van_id INT NULL,
  shop_id INT NULL,
  customer_name VARCHAR(150) NOT NULL,
  vat_mode ENUM('inclusive','exclusive') NOT NULL,
  subtotal DECIMAL(12,3) NOT NULL,
  vat_amount DECIMAL(12,3) NOT NULL,
  total_amount DECIMAL(12,3) NOT NULL,
  total_cogs DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  net_profit DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  lines_json JSON NOT NULL,
  payments_json JSON NOT NULL,
  correction_reason VARCHAR(255) NULL,
  corrected_by INT NOT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_arch_vendor (vendor_id),
  INDEX idx_arch_orig (original_invoice_no),
  INDEX idx_arch_inv (invoice_id),
  CONSTRAINT fk_arch_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB;
");

echo "Migration for invoice_archives & correction tracking completed successfully!\n";

