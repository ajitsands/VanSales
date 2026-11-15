<?php
require_once __DIR__ . '/../backend/app/Core/Database.php';

use App\Core\Database;

$pdo = Database::getConnection();

$pdo->exec("
CREATE TABLE IF NOT EXISTS invoice_attachments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  invoice_id BIGINT NULL,
  payment_id BIGINT NULL,
  attachment_type ENUM('payment_screenshot','cheque_photo','bank_slip','other') NOT NULL DEFAULT 'payment_screenshot',
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  uploaded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_att_invoice (invoice_id),
  INDEX idx_att_payment (payment_id),
  CONSTRAINT fk_att_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB;
");

echo "Migration for invoice_attachments completed successfully!\n";

