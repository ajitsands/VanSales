<?php
/**
 * Database Initializer & Seeder for Van Supply & Distribution Management Suite
 * Run via CLI: php database/seed.php
 */

$host = getenv('DB_HOST') ?: '127.0.0.1';
$port = getenv('DB_PORT') ?: '3306';
$dbname = getenv('DB_NAME') ?: 'van_sales_db';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') !== false ? getenv('DB_PASS') : 'S@nds1@b';

try {
    $schemaSql = file_get_contents(__DIR__ . '/schema.sql');
    if (getenv('DB_NAME')) {
        $pdo = new PDO("mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $schemaSql = preg_replace('/^\s*(CREATE DATABASE|USE)\b.*?;\s*$/mi', '', $schemaSql);
        $pdo->exec($schemaSql);
    } else {
        $pdo = new PDO("mysql:host={$host};port={$port};charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $pdo->exec($schemaSql);
        $pdo->exec("USE `{$dbname}`");
    }

    // Check if already seeded
    $count = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    if ($count > 0) {
        echo "Database already seeded ({$count} users found). Skipping.\n";
        exit(0);
    }

    $pdo->beginTransaction();

    // 1. Superadmin (Software Developer / Platform Owner)
    $stmt = $pdo->prepare("INSERT INTO users (vendor_id, username, email, password_hash, full_name, phone, role) VALUES (NULL, ?, ?, ?, ?, ?, 'superadmin')");
    $stmt->execute(['superadmin', 'dev@sandslab.bh', password_hash('Super@123', PASSWORD_BCRYPT), 'SaNDS Lab Platform Owner', '+973 1700 0000']);

    // 2. Vendor 1 (Al-Bahrain Fresh Distribution W.L.L.)
    $stmt = $pdo->prepare("INSERT INTO vendors (
        company_name, company_code, header_bg_color, header_text_color, footer_bg_color, footer_text_color,
        currency_code, currency_decimals, date_format, vat_percent, default_vat_mode, geofence_radius_m, require_eod_closing,
        billing_cycle, software_base_cost, max_normal_users, free_normal_users, paid_normal_user_cost,
        max_van_users, free_van_users, paid_van_user_cost, total_software_cost, license_status, license_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'BHD', 3, 'DD/MM/YYYY', 10.00, 'exclusive', 250, 1, 'yearly', 350.000, 5, 5, 30.000, 5, 0, 40.000, 550.000, 'active', DATE_ADD(CURDATE(), INTERVAL 1 YEAR))");
    $stmt->execute([
        'Al-Bahrain Fresh Distribution W.L.L.',
        'BFD-001',
        '#0a2540',
        '#ffffff',
        '#f8fafc',
        '#475569'
    ]);
    $vendorId = (int)$pdo->lastInsertId();

    // 3. Vans (4 Vans)
    $vansData = [
        ['VAN-01', 'Van 01 - Manama North', 'BH-44101'],
        ['VAN-02', 'Van 02 - Riffa & Isa Town', 'BH-44102'],
        ['VAN-03', 'Van 03 - Muharraq Central', 'BH-44103'],
        ['VAN-04', 'Van 04 - Budaiya & Saar', 'BH-44104'],
    ];
    $vanIds = [];
    $vStmt = $pdo->prepare("INSERT INTO vans (vendor_id, van_code, van_name, plate_number) VALUES (?, ?, ?, ?)");
    foreach ($vansData as $vd) {
        $vStmt->execute([$vendorId, $vd[0], $vd[1], $vd[2]]);
        $vanIds[] = (int)$pdo->lastInsertId();
    }

    // 4. Vendor Admin, Account User, and 4 Van Users
    $uStmt = $pdo->prepare("INSERT INTO users (vendor_id, username, email, password_hash, full_name, phone, role, permissions_json, van_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $uStmt->execute([$vendorId, 'admin', 'admin@bfbahrain.bh', password_hash('Admin@123', PASSWORD_BCRYPT), 'Khalid Al-Mansoor (Admin)', '+973 3900 1001', 'admin', null, null]);

    $accountPerms = json_encode([
        'procurement' => true,
        'inventory'   => true,
        'transfers'   => true,
        'sales'       => true,
        'returns'     => true,
        'reports'     => true,
        'settings'    => false
    ]);
    $uStmt->execute([$vendorId, 'account1', 'accounts@bfbahrain.bh', password_hash('Account@123', PASSWORD_BCRYPT), 'Fatima Hassan (Accountant)', '+973 3900 1002', 'account', $accountPerms, null]);

    $driverNames = ['Tariq Ali (Driver 1)', 'Salman Noor (Driver 2)', 'Yusuf Ahmed (Driver 3)', 'Hassan Jaffar (Driver 4)'];
    $vanUserIds = [];
    foreach ($vanIds as $idx => $vid) {
        $uname = 'van' . ($idx + 1);
        $uStmt->execute([$vendorId, $uname, "{$uname}@bfbahrain.bh", password_hash('Van@123', PASSWORD_BCRYPT), $driverNames[$idx], '+973 3911 000' . ($idx + 1), 'van', null, $vid]);
        $vanUserIds[] = (int)$pdo->lastInsertId();
    }

    // 5. Suppliers
    $supStmt = $pdo->prepare("INSERT INTO suppliers (vendor_id, name, contact_person, phone, email, address, vat_number) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $supStmt->execute([$vendorId, 'Gulf Dairy & Beverages Co.', 'Rami Khoury', '+973 1722 3344', 'orders@gulfdairy.bh', 'Sitra Industrial Area, Bahrain', '200012345600002']);
    $sup1 = (int)$pdo->lastInsertId();
    $supStmt->execute([$vendorId, 'Al-Noor FMCG Trading', 'Saeed Al-Banna', '+973 1755 8899', 'supply@alnoor.bh', 'Mina Salman, Manama', '200098765400002']);
    $sup2 = (int)$pdo->lastInsertId();

    // 6. Items (12 Core SKUs with Purchase & Selling Prices)
    $itemsData = [
        ['SKU-101', '6291000101', 'Fresh Full Cream Milk 1L', 'Dairy', 'BTL', 0.420, 0.550, 1],
        ['SKU-102', '6291000102', 'Labneh Cream Cheese 500g', 'Dairy', 'CUP', 0.850, 1.150, 1],
        ['SKU-103', '6291000103', 'Natural Drinking Water 500ml (24x)', 'Beverages', 'CTN', 1.100, 1.450, 1],
        ['SKU-104', '6291000104', 'Orange Juice 100% 1L', 'Beverages', 'BTL', 0.580, 0.800, 1],
        ['SKU-105', '6291000105', 'Sparkling Cola Can 330ml (24x)', 'Beverages', 'CTN', 3.200, 4.100, 1],
        ['SKU-106', '6291000106', 'Salted Potato Chips 150g (12x)', 'Snacks', 'CTN', 2.400, 3.200, 1],
        ['SKU-107', '6291000107', 'Roasted Mixed Nuts 200g', 'Snacks', 'PKT', 1.150, 1.600, 1],
        ['SKU-108', '6291000108', 'Basmati Rice Premium 5KG', 'Dry Goods', 'BAG', 2.800, 3.650, 0],
        ['SKU-109', '6291000109', 'Pure Sunflower Cooking Oil 1.5L', 'Dry Goods', 'BTL', 1.250, 1.650, 1],
        ['SKU-110', '6291000110', 'Facial Tissue Box 200s (5x)', 'Household', 'PKT', 0.900, 1.250, 0],
        ['SKU-111', '6291000111', 'Arabic Coffee Blend 250g', 'Beverages', 'PKT', 1.450, 2.000, 1],
        ['SKU-112', '6291000112', 'Chocolate Wafer Biscuits (24x)', 'Snacks', 'BOX', 1.950, 2.600, 1],
    ];
    $itemIds = [];
    $iStmt = $pdo->prepare("INSERT INTO items (vendor_id, sku, barcode, name, category, uom, purchase_price, selling_price, track_expiry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($itemsData as $it) {
        $iStmt->execute([$vendorId, $it[0], $it[1], $it[2], $it[3], $it[4], $it[5], $it[6], $it[7]]);
        $itemIds[] = (int)$pdo->lastInsertId();
    }

    // 7. GRN + Main Store Batches (2 batches per item to demonstrate FIFO / FEFO)
    $grnStmt = $pdo->prepare("INSERT INTO grn_headers (vendor_id, grn_no, supplier_id, supplier_invoice_no, total_cost, notes) VALUES (?, ?, ?, ?, ?, ?)");
    $grnStmt->execute([$vendorId, 'GRN-2026-001', $sup1, 'INV-GD-8821', 1200.000, 'Initial Opening Procurement']);
    $grn1 = (int)$pdo->lastInsertId();

    $bStmt = $pdo->prepare("INSERT INTO stock_batches (vendor_id, location_type, van_id, item_id, grn_id, batch_no, expiry_date, received_at, unit_cost, qty_initial, qty_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($itemIds as $idx => $iid) {
        $cost = $itemsData[$idx][5];
        $trackExp = $itemsData[$idx][7];
        $exp1 = $trackExp ? date('Y-m-d', strtotime('+' . (25 + $idx * 5) . ' days')) : null;
        $exp2 = $trackExp ? date('Y-m-d', strtotime('+' . (90 + $idx * 10) . ' days')) : null;

        // Earlier batch in Main Store
        $bStmt->execute([$vendorId, 'main_store', null, $iid, $grn1, 'BCH-' . ($idx + 1) . 'A', $exp1, date('Y-m-d H:i:s', strtotime('-10 days')), $cost, 120, 90]);
        // Newer batch in Main Store
        $bStmt->execute([$vendorId, 'main_store', null, $iid, $grn1, 'BCH-' . ($idx + 1) . 'B', $exp2, date('Y-m-d H:i:s', strtotime('-2 days')), $cost, 150, 150]);

        // Pre-loaded stock on Van 1, Van 2, Van 3, Van 4
        foreach ($vanIds as $vIdx => $vid) {
            if ($idx < 10) {
                $bStmt->execute([$vendorId, 'van', $vid, $iid, $grn1, 'BCH-' . ($idx + 1) . 'A', $exp1, date('Y-m-d H:i:s', strtotime('-1 day')), $cost, 30, 22 + $vIdx]);
            }
        }
    }

    // 8. Routes & Shops (Exclusive Van-to-Route Mapping + Bahrain GPS)
    $rStmt = $pdo->prepare("INSERT INTO routes (vendor_id, route_code, route_name, assigned_van_id) VALUES (?, ?, ?, ?)");
    $routesData = [
        ['RT-01', 'Manama North & Juffair', $vanIds[0]],
        ['RT-02', 'Riffa & Isa Town', $vanIds[1]],
        ['RT-03', 'Muharraq & Amwaj', $vanIds[2]],
        ['RT-04', 'Budaiya & Saar', $vanIds[3]],
    ];
    $routeIds = [];
    foreach ($routesData as $rd) {
        $rStmt->execute([$vendorId, $rd[0], $rd[1], $rd[2]]);
        $routeIds[] = (int)$pdo->lastInsertId();
    }

    $sStmt = $pdo->prepare("INSERT INTO shops (vendor_id, route_id, shop_code, shop_name, owner_name, phone, address, latitude, longitude, vat_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $shopsData = [
        [$routeIds[0], 'SHP-101', 'Al-Jazeera Cold Store', 'Ahmed Yousif', '+973 3311 2201', 'Block 324, Juffair, Manama', 26.2154000, 50.6085000, '2000551101'],
        [$routeIds[0], 'SHP-102', 'Manama Star Minimart', 'Nasser Ali', '+973 3311 2202', 'Exhibition Ave, Hoora', 26.2335000, 50.5902000, '2000551102'],
        [$routeIds[0], 'SHP-103', 'Bab Al-Bahrain Groceries', 'Mohammed Isa', '+973 3311 2203', 'Government Ave, Manama', 26.2361000, 50.5762000, '2000551103'],
        [$routeIds[1], 'SHP-201', 'Riffa Views Supermarket', 'Jassim Khalifa', '+973 3322 3301', 'East Riffa, Block 905', 26.1300000, 50.5550000, '2000552201'],
        [$routeIds[1], 'SHP-202', 'Isa Town Gate Coldstore', 'Rashid Salman', '+973 3322 3302', 'Isa Town Market', 26.1736000, 50.5478000, '2000552202'],
        [$routeIds[2], 'SHP-301', 'Muharraq Heritage Mart', 'Ebrahim Hassan', '+973 3333 4401', 'Airport Ave, Muharraq', 26.2572000, 50.6119000, '2000553301'],
        [$routeIds[2], 'SHP-302', 'Amwaj Lagoon Fresh', 'Layla Mahmood', '+973 3333 4402', 'Amwaj Islands', 26.2869000, 50.6631000, '2000553302'],
        [$routeIds[3], 'SHP-401', 'Saar Pavilion Market', 'Zainab Ali', '+973 3344 5501', 'Saar Avenue, Budaiya', 26.1956000, 50.4851000, '2000554401'],
    ];
    $shopIds = [];
    foreach ($shopsData as $sd) {
        $sStmt->execute([$vendorId, $sd[0], $sd[1], $sd[2], $sd[3], $sd[4], $sd[5], $sd[6], $sd[7], $sd[8]]);
        $shopIds[] = (int)$pdo->lastInsertId();
    }

    // 9. Active Shifts + Sample Today Invoices with Split Payments (Cash, Card, QR Pay)
    $shStmt = $pdo->prepare("INSERT INTO van_shifts (vendor_id, van_id, driver_user_id, shift_name, shift_type, business_date, status) VALUES (?, ?, ?, ?, ?, CURDATE(), ?)");
    $shStmt->execute([$vendorId, $vanIds[0], $vanUserIds[0], 'Morning Shift', 'same_day', 'open']);
    $shift1 = (int)$pdo->lastInsertId();
    $shStmt->execute([$vendorId, $vanIds[1], $vanUserIds[1], 'Morning Shift', 'same_day', 'open']);
    $shift2 = (int)$pdo->lastInsertId();
    $shStmt->execute([$vendorId, $vanIds[2], $vanUserIds[2], 'Morning Shift', 'same_day', 'closing_pending']);
    $shift3 = (int)$pdo->lastInsertId();

    // Sample Invoice 1 (Van 1 - Split Payment: Cash + Card + QR Pay)
    $invStmt = $pdo->prepare("INSERT INTO invoices (vendor_id, invoice_no, source_type, van_id, shop_id, customer_name, shift_id, driver_user_id, vat_mode, subtotal, vat_amount, total_amount, total_cogs, net_profit, invoice_type) VALUES (?, ?, 'van', ?, ?, ?, ?, ?, 'exclusive', ?, ?, ?, ?, ?, 'sale')");
    $invStmt->execute([$vendorId, 'INV-V1-0001', $vanIds[0], $shopIds[0], 'Al-Jazeera Cold Store', $shift1, $vanUserIds[0], 30.000, 3.000, 33.000, 22.100, 7.900]);
    $inv1 = (int)$pdo->lastInsertId();

    $payStmt = $pdo->prepare("INSERT INTO invoice_payments (invoice_id, vendor_id, van_id, shift_id, payment_method, amount, reference_no) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $payStmt->execute([$inv1, $vendorId, $vanIds[0], $shift1, 'cash', 13.000, null]);
    $payStmt->execute([$inv1, $vendorId, $vanIds[0], $shift1, 'card', 10.000, 'POS-88219']);
    $payStmt->execute([$inv1, $vendorId, $vanIds[0], $shift1, 'qr_pay', 10.000, 'BPAY-99401']);

    // Sample Invoice 2 (Van 2 - QR Pay + Cash)
    $invStmt->execute([$vendorId, 'INV-V2-0001', $vanIds[1], $shopIds[3], 'Riffa Views Supermarket', $shift2, $vanUserIds[1], 45.000, 4.500, 49.500, 32.800, 12.200]);
    $inv2 = (int)$pdo->lastInsertId();
    $payStmt->execute([$inv2, $vendorId, $vanIds[1], $shift2, 'cash', 20.000, null]);
    $payStmt->execute([$inv2, $vendorId, $vanIds[1], $shift2, 'qr_pay', 29.500, 'BPAY-99455']);

    // Sample Invoice 3 (Van 3 - Pending Closing)
    $invStmt->execute([$vendorId, 'INV-V3-0001', $vanIds[2], $shopIds[5], 'Muharraq Heritage Mart', $shift3, $vanUserIds[2], 60.000, 6.000, 66.000, 44.000, 16.000]);
    $inv3 = (int)$pdo->lastInsertId();
    $payStmt->execute([$inv3, $vendorId, $vanIds[2], $shift3, 'cash', 26.000, null]);
    $payStmt->execute([$inv3, $vendorId, $vanIds[2], $shift3, 'card', 20.000, 'POS-77412']);
    $payStmt->execute([$inv3, $vendorId, $vanIds[2], $shift3, 'qr_pay', 20.000, 'BPAY-88120']);

    // Pending Closing Request for Van 3 (visible in Admin App!)
    $clsStmt = $pdo->prepare("INSERT INTO closing_requests (vendor_id, shift_id, van_id, driver_user_id, total_sales, total_returns, total_cogs, net_profit, expected_cash, declared_cash, expected_card, declared_card, expected_qr, declared_qr, expected_credit, driver_notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')");
    $clsStmt->execute([$vendorId, $shift3, $vanIds[2], $vanUserIds[2], 66.000, 0.000, 44.000, 16.000, 26.000, 26.000, 20.000, 20.000, 20.000, 20.000, 0.000, 'All Muharraq morning deliveries completed cleanly.']);

    $pdo->commit();
    echo "Database schema & demo data seeded successfully!\n";
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "Seed Error: " . $e->getMessage() . "\n");
    exit(1);
}
