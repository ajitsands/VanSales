-- Van Supply & Distribution Management Suite (Multi-Tenant SaaS)
-- MySQL 8.0 Schema

CREATE DATABASE IF NOT EXISTS van_sales_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE van_sales_db;

-- 1. Vendors (Multi-Tenant SaaS Organizations & Licensing)
CREATE TABLE IF NOT EXISTS vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(180) NOT NULL,
  company_code VARCHAR(40) NOT NULL UNIQUE,
  logo_url TEXT NULL,
  header_bg_color VARCHAR(20) NOT NULL DEFAULT '#0f172a',
  header_text_color VARCHAR(20) NOT NULL DEFAULT '#ffffff',
  footer_bg_color VARCHAR(20) NOT NULL DEFAULT '#f8fafc',
  footer_text_color VARCHAR(20) NOT NULL DEFAULT '#475569',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'BHD',
  currency_decimals TINYINT NOT NULL DEFAULT 3,
  date_format VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY',
  vat_percent DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  default_vat_mode ENUM('inclusive','exclusive') NOT NULL DEFAULT 'exclusive',
  geofence_radius_m INT NOT NULL DEFAULT 200,
  require_eod_closing TINYINT(1) NOT NULL DEFAULT 1,
  -- SaaS Licensing & Costing (Configured by Superadmin)
  billing_cycle ENUM('yearly','monthly') NOT NULL DEFAULT 'yearly',
  software_base_cost DECIMAL(12,3) NOT NULL DEFAULT 350.000,
  max_normal_users INT NOT NULL DEFAULT 5,
  free_normal_users INT NOT NULL DEFAULT 5,
  paid_normal_user_cost DECIMAL(12,3) NOT NULL DEFAULT 30.000,
  max_van_users INT NOT NULL DEFAULT 5,
  free_van_users INT NOT NULL DEFAULT 0,
  paid_van_user_cost DECIMAL(12,3) NOT NULL DEFAULT 40.000,
  total_software_cost DECIMAL(12,3) NOT NULL DEFAULT 550.000,
  license_status ENUM('active','suspended','expired') NOT NULL DEFAULT 'active',
  license_expires_at DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Vans (Mobile Stores)
CREATE TABLE IF NOT EXISTS vans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  van_code VARCHAR(40) NOT NULL,
  van_name VARCHAR(120) NOT NULL,
  plate_number VARCHAR(40) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_van_code (vendor_id, van_code),
  CONSTRAINT fk_vans_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. Users (4 Major Roles: superadmin, admin, account, van)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(150) NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NULL,
  role ENUM('superadmin','admin','account','van') NOT NULL,
  permissions_json JSON NULL,
  van_id INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_van FOREIGN KEY (van_id) REFERENCES vans(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 4. Never-Expiring Token Management (Valid until explicit logout or revocation)
CREATE TABLE IF NOT EXISTS user_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  device_info VARCHAR(180) NULL,
  is_revoked TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(120) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(120) NULL,
  address TEXT NULL,
  vat_number VARCHAR(60) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_suppliers_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. Item Master
CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  sku VARCHAR(60) NOT NULL,
  barcode VARCHAR(80) NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'General',
  uom VARCHAR(30) NOT NULL DEFAULT 'PCS',
  purchase_price DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  selling_price DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  track_expiry TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_item_sku (vendor_id, sku),
  CONSTRAINT fk_items_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. Goods Receipt Notes (Supplier -> Main Store)
CREATE TABLE IF NOT EXISTS grn_headers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  grn_no VARCHAR(50) NOT NULL,
  supplier_id INT NOT NULL,
  supplier_invoice_no VARCHAR(80) NULL,
  total_cost DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  notes TEXT NULL,
  received_by INT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grn_no (vendor_id, grn_no),
  CONSTRAINT fk_grn_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_grn_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 8. Stock Batches (FIFO / FEFO Engine across Main Store and Vans)
CREATE TABLE IF NOT EXISTS stock_batches (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  location_type ENUM('main_store','van') NOT NULL DEFAULT 'main_store',
  van_id INT NULL,
  item_id INT NOT NULL,
  grn_id INT NULL,
  batch_no VARCHAR(60) NOT NULL,
  expiry_date DATE NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unit_cost DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  qty_initial DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  qty_available DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  INDEX idx_fifo_fefo (vendor_id, location_type, van_id, item_id, qty_available, expiry_date, received_at),
  CONSTRAINT fk_batch_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_batch_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT fk_batch_van FOREIGN KEY (van_id) REFERENCES vans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 9. Van Item Requests (Van -> Main Store)
CREATE TABLE IF NOT EXISTS van_item_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  request_no VARCHAR(50) NOT NULL,
  van_id INT NOT NULL,
  requested_by INT NOT NULL,
  status ENUM('pending','dispatched','rejected') NOT NULL DEFAULT 'pending',
  items_json JSON NOT NULL,
  notes TEXT NULL,
  reviewed_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  CONSTRAINT fk_req_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_req_van FOREIGN KEY (van_id) REFERENCES vans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 10. Stock Transfers (Store-to-Van AND Van-to-Van)
CREATE TABLE IF NOT EXISTS stock_transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  transfer_no VARCHAR(50) NOT NULL,
  transfer_type ENUM('store_to_van','van_to_van') NOT NULL,
  from_location_type ENUM('main_store','van') NOT NULL,
  from_van_id INT NULL,
  to_van_id INT NOT NULL,
  request_id INT NULL,
  otp_code VARCHAR(10) NULL,
  status ENUM('pending_confirm','completed','cancelled') NOT NULL DEFAULT 'pending_confirm',
  notes TEXT NULL,
  created_by INT NOT NULL,
  confirmed_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME NULL,
  CONSTRAINT fk_trf_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_trf_to_van FOREIGN KEY (to_van_id) REFERENCES vans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transfer_id INT NOT NULL,
  item_id INT NOT NULL,
  source_batch_id BIGINT NULL,
  batch_no VARCHAR(60) NOT NULL,
  expiry_date DATE NULL,
  unit_cost DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  qty DECIMAL(12,3) NOT NULL,
  CONSTRAINT fk_trf_line_hdr FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
  CONSTRAINT fk_trf_line_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 11. Van Returns & Damaged Items (Van -> Main Store QC)
CREATE TABLE IF NOT EXISTS van_returns_damages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  van_id INT NOT NULL,
  item_id INT NOT NULL,
  batch_id BIGINT NULL,
  batch_no VARCHAR(60) NULL,
  expiry_date DATE NULL,
  qty DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  return_type ENUM('good_return','damaged','expired') NOT NULL,
  reason_code VARCHAR(80) NOT NULL,
  notes TEXT NULL,
  qc_status ENUM('pending_qc','restocked','written_off') NOT NULL DEFAULT 'pending_qc',
  reported_by INT NOT NULL,
  qc_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  qc_at DATETIME NULL,
  CONSTRAINT fk_vrd_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_vrd_van FOREIGN KEY (van_id) REFERENCES vans(id) ON DELETE CASCADE,
  CONSTRAINT fk_vrd_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 12. Routes & Shops (Exclusive Van-to-Route Mapping + GPS)
CREATE TABLE IF NOT EXISTS routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  route_code VARCHAR(40) NOT NULL,
  route_name VARCHAR(120) NOT NULL,
  assigned_van_id INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_routes_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_routes_van FOREIGN KEY (assigned_van_id) REFERENCES vans(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  route_id INT NOT NULL,
  shop_code VARCHAR(40) NOT NULL,
  shop_name VARCHAR(150) NOT NULL,
  owner_name VARCHAR(120) NULL,
  phone VARCHAR(40) NULL,
  address TEXT NULL,
  latitude DECIMAL(10,7) NOT NULL DEFAULT 26.2285000,
  longitude DECIMAL(10,7) NOT NULL DEFAULT 50.5860000,
  vat_number VARCHAR(60) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_shops_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_shops_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shop_visits (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  van_id INT NOT NULL,
  shop_id INT NOT NULL,
  driver_user_id INT NOT NULL,
  checkin_lat DECIMAL(10,7) NOT NULL,
  checkin_lng DECIMAL(10,7) NOT NULL,
  distance_m DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_visits_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_visits_shop FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 13. Shifts (Same-Day & Multi-Day) & Compulsory Closing Requests
CREATE TABLE IF NOT EXISTS van_shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  van_id INT NOT NULL,
  driver_user_id INT NOT NULL,
  shift_name VARCHAR(80) NOT NULL,
  shift_type ENUM('same_day','multi_day') NOT NULL DEFAULT 'same_day',
  business_date DATE NOT NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  status ENUM('open','closing_pending','closed','rejected') NOT NULL DEFAULT 'open',
  CONSTRAINT fk_shifts_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_shifts_van FOREIGN KEY (van_id) REFERENCES vans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 14. Sales & Shop Return Invoices (Main Store + Van)
CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  invoice_no VARCHAR(50) NOT NULL,
  source_type ENUM('main_store','van') NOT NULL DEFAULT 'van',
  van_id INT NULL,
  shop_id INT NULL,
  customer_name VARCHAR(150) NULL,
  shift_id INT NULL,
  driver_user_id INT NULL,
  vat_mode ENUM('inclusive','exclusive') NOT NULL DEFAULT 'exclusive',
  subtotal DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  vat_amount DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  discount_amount DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  total_amount DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  total_cogs DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  net_profit DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  invoice_type ENUM('sale','return') NOT NULL DEFAULT 'sale',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoice_no (vendor_id, invoice_no),
  CONSTRAINT fk_inv_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_van FOREIGN KEY (van_id) REFERENCES vans(id) ON DELETE SET NULL,
  CONSTRAINT fk_inv_shop FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_lines (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT NOT NULL,
  item_id INT NOT NULL,
  batch_id BIGINT NULL,
  batch_no VARCHAR(60) NULL,
  expiry_date DATE NULL,
  qty DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  line_vat DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  line_total DECIMAL(12,3) NOT NULL,
  return_condition ENUM('good','damaged') NULL,
  CONSTRAINT fk_inv_line_hdr FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_line_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 15. Multi-Tender Split Payments (Cash, Card, QR Pay, Bank Transfer, Cheque, Credit)
CREATE TABLE IF NOT EXISTS invoice_payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT NULL,
  vendor_id INT NOT NULL,
  van_id INT NULL,
  shop_id INT NULL,
  shift_id INT NULL,
  payment_method ENUM('cash','card','qr_pay','bank_transfer','cheque','credit') NOT NULL,
  amount DECIMAL(12,3) NOT NULL,
  reference_no VARCHAR(80) NULL,
  bank_name VARCHAR(100) NULL,
  cheque_no VARCHAR(60) NULL,
  cheque_date DATE NULL,
  cheque_status ENUM('na','pending_clearance','cleared','bounced') NOT NULL DEFAULT 'na',
  cleared_by INT NULL,
  cleared_at DATETIME NULL,
  cheque_notes TEXT NULL,
  paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_inv FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 16. Shop / Customer Ledger (Tracks Debits, Cleared Payments & Cheque Reconciliation)
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
) ENGINE=InnoDB;

-- 17. Closing Requests (Reviewed & Approved in Admin App)
CREATE TABLE IF NOT EXISTS closing_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  shift_id INT NOT NULL,
  van_id INT NOT NULL,
  driver_user_id INT NOT NULL,
  total_sales DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  total_returns DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  total_cogs DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  net_profit DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  expected_cash DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  declared_cash DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  expected_card DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  declared_card DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  expected_qr DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  declared_qr DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  expected_bank_transfer DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  declared_bank_transfer DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  expected_cheque DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  declared_cheque DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  expected_credit DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  driver_notes TEXT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by INT NULL,
  review_notes TEXT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  CONSTRAINT fk_cls_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_cls_shift FOREIGN KEY (shift_id) REFERENCES van_shifts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cls_van FOREIGN KEY (van_id) REFERENCES vans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 18. Multiple Receipt / Payment Attachments (Screenshots, Cheque Photos, Bank Slips)
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

