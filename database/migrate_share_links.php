<?php
require_once __DIR__ . '/../backend/app/Core/Database.php';

use App\Core\Database;

$pdo = Database::getConnection();

$pdo->exec("
CREATE TABLE IF NOT EXISTS share_links (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  token VARCHAR(64) NOT NULL,
  share_type ENUM('ledger','invoice') NOT NULL,
  shop_id INT NULL,
  invoice_id BIGINT NULL,
  from_date DATE NULL,
  to_date DATE NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_share_token (token),
  CONSTRAINT fk_share_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB;
");

echo "Migration for share_links completed successfully!\n";

