<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;

class RouteController
{
    private static function ensureShopConfirmColumns(\PDO $pdo): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }
        $cols = $pdo->query("SHOW COLUMNS FROM shops LIKE 'confirm_token'")->fetch();
        if (!$cols) {
            $pdo->exec("
                ALTER TABLE shops
                ADD COLUMN confirm_token VARCHAR(64) NULL,
                ADD COLUMN location_confirmed TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN location_confirmed_at DATETIME NULL
            ");
        }
        $checked = true;
    }

    private function haversineMeters(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $R = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) * sin($dLat / 2) +
            cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
            sin($dLon / 2) * sin($dLon / 2);
        return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    public function listRoutes(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $sql = "
            SELECT r.*, v.van_code, v.van_name
            FROM routes r
            LEFT JOIN vans v ON v.id = r.assigned_van_id
            WHERE r.vendor_id = ?
        ";
        $params = [$vendorId];
        if ($req->user['role'] === 'van') {
            $sql .= " AND r.assigned_van_id = ?";
            $params[] = (int)$req->user['van_id'];
        }
        $sql .= " ORDER BY r.id ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::ok($stmt->fetchAll());
    }

    public function createRoute(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $code = trim($b['route_code'] ?? '');
        $name = trim($b['route_name'] ?? '');
        if ($code === '' || $name === '') {
            Response::error('Route code and route name are required', 422);
        }
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO routes (vendor_id, route_code, route_name, assigned_van_id) VALUES (?, ?, ?, ?)");
        $stmt->execute([$vendorId, $code, $name, !empty($b['assigned_van_id']) ? (int)$b['assigned_van_id'] : null]);
        Response::ok(['id' => (int)$pdo->lastInsertId()], 'Route created', 201);
    }

    public function listShops(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        self::ensureShopConfirmColumns($pdo);
        $sql = "
            SELECT s.*, r.route_code, r.route_name, r.assigned_van_id, v.van_name,
              (SELECT MAX(sv.checked_in_at) FROM shop_visits sv WHERE sv.shop_id = s.id AND DATE(sv.checked_in_at) = CURDATE()) AS checked_in_today,
              COALESCE((SELECT SUM(debit - credit) FROM shop_ledger_entries l WHERE l.shop_id = s.id), 0) AS pending_balance,
              COALESCE((SELECT SUM(amount) FROM invoice_payments p WHERE p.shop_id = s.id AND p.payment_method = 'cheque' AND p.cheque_status = 'pending_clearance'), 0) AS pending_cheques,
              (SELECT COUNT(*) FROM invoice_payments p WHERE p.shop_id = s.id AND p.payment_method = 'cheque' AND p.cheque_status = 'pending_clearance') AS pending_cheque_count,
              COALESCE((SELECT SUM(total_amount) FROM invoices inv WHERE inv.shop_id = s.id AND inv.invoice_type = 'sale' AND DATE(inv.created_at) = CURDATE()), 0) AS today_sales
            FROM shops s
            INNER JOIN routes r ON r.id = s.route_id
            LEFT JOIN vans v ON v.id = r.assigned_van_id
            WHERE s.vendor_id = ?
        ";
        $params = [$vendorId];
        if ($req->user['role'] === 'van') {
            $sql .= " AND r.assigned_van_id = ?";
            $params[] = (int)$req->user['van_id'];
        }
        $sql .= " ORDER BY s.id ASC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        Response::ok($stmt->fetchAll());
    }

    public function createShop(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $routeId = (int)($b['route_id'] ?? 0);
        $code = trim($b['shop_code'] ?? '');
        $name = trim($b['shop_name'] ?? '');

        $pdo = Database::getConnection();
        self::ensureShopConfirmColumns($pdo);

        if ($req->user['role'] === 'van') {
            $vanId = (int)($req->user['van_id'] ?? 0);
            if (!$vanId) {
                Response::error('No Van assigned to your account', 403);
            }
            if ($routeId) {
                $rCheck = $pdo->prepare("SELECT id, assigned_van_id FROM routes WHERE id = ? AND vendor_id = ? LIMIT 1");
                $rCheck->execute([$routeId, $vendorId]);
                $rRow = $rCheck->fetch();
                if (!$rRow || (int)$rRow['assigned_van_id'] !== $vanId) {
                    Response::error('You can only add shops to your own Van route', 403);
                }
            } else {
                $rFind = $pdo->prepare("SELECT id FROM routes WHERE vendor_id = ? AND assigned_van_id = ? ORDER BY id ASC LIMIT 1");
                $rFind->execute([$vendorId, $vanId]);
                $rRow = $rFind->fetch();
                if ($rRow) {
                    $routeId = (int)$rRow['id'];
                } else {
                    $vInfo = $pdo->prepare("SELECT van_code, van_name FROM vans WHERE id = ? AND vendor_id = ? LIMIT 1");
                    $vInfo->execute([$vanId, $vendorId]);
                    $van = $vInfo->fetch();
                    $rCode = 'RT-' . ($van['van_code'] ?? ('VAN' . $vanId));
                    $rName = ($van['van_name'] ?? ('Van ' . $vanId)) . ' Route';
                    $pdo->prepare("INSERT INTO routes (vendor_id, route_code, route_name, assigned_van_id) VALUES (?, ?, ?, ?)")
                        ->execute([$vendorId, $rCode, $rName, $vanId]);
                    $routeId = (int)$pdo->lastInsertId();
                }
            }
            if ($code === '') {
                $code = 'SHP-' . date('ymd') . '-' . rand(100, 999);
            }
        }

        if (!$routeId || $code === '' || $name === '') {
            Response::error('Route, shop code, and shop name are required', 422);
        }

        $confirmToken = bin2hex(random_bytes(16));
        $stmt = $pdo->prepare("
            INSERT INTO shops (vendor_id, route_id, shop_code, shop_name, owner_name, phone, address, latitude, longitude, vat_number, confirm_token)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $vendorId,
            $routeId,
            $code,
            $name,
            trim($b['owner_name'] ?? ''),
            trim($b['phone'] ?? ''),
            trim($b['address'] ?? ''),
            isset($b['latitude']) && $b['latitude'] !== '' ? (float)$b['latitude'] : 26.2285,
            isset($b['longitude']) && $b['longitude'] !== '' ? (float)$b['longitude'] : 50.5860,
            trim($b['vat_number'] ?? ''),
            $confirmToken,
        ]);
        $shopId = (int)$pdo->lastInsertId();
        Response::ok([
            'id'            => $shopId,
            'shop_code'     => $code,
            'confirm_token' => $confirmToken,
            'confirm_path'  => '/?confirm-shop=' . $confirmToken,
        ], 'Shop added to route. Share confirmation link with Shopkeeper.', 201);
    }

    public function updateShop(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $shopId = (int)($req->params['id'] ?? 0);
        $b = $req->body();

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            SELECT s.*, r.assigned_van_id
            FROM shops s
            INNER JOIN routes r ON r.id = s.route_id
            WHERE s.id = ? AND s.vendor_id = ? LIMIT 1
        ");
        $stmt->execute([$shopId, $vendorId]);
        $shop = $stmt->fetch();
        if (!$shop) {
            Response::error('Shop not found', 404);
        }
        if ($req->user['role'] === 'van' && (int)$shop['assigned_van_id'] !== (int)($req->user['van_id'] ?? 0)) {
            Response::error('Forbidden: You can only edit shops on your own Van route', 403);
        }

        $shopCode = trim((string)($b['shop_code'] ?? $shop['shop_code']));
        $shopName = trim((string)($b['shop_name'] ?? $shop['shop_name']));
        if ($shopCode === '' || $shopName === '') {
            Response::error('Shop Code and Shop Name are required', 422);
        }

        $routeId = (int)$shop['route_id'];
        if ($req->user['role'] === 'admin' && !empty($b['route_id'])) {
            $newRouteId = (int)$b['route_id'];
            $rChk = $pdo->prepare("SELECT id FROM routes WHERE id = ? AND vendor_id = ? LIMIT 1");
            $rChk->execute([$newRouteId, $vendorId]);
            if ($rChk->fetch()) {
                $routeId = $newRouteId;
            }
        }

        $lat = isset($b['latitude']) && $b['latitude'] !== '' && is_numeric($b['latitude']) ? (float)$b['latitude'] : (float)$shop['latitude'];
        $lng = isset($b['longitude']) && $b['longitude'] !== '' && is_numeric($b['longitude']) ? (float)$b['longitude'] : (float)$shop['longitude'];

        $pdo->prepare("
            UPDATE shops
            SET route_id = ?, shop_code = ?, shop_name = ?, owner_name = ?, phone = ?, address = ?, vat_number = ?, latitude = ?, longitude = ?
            WHERE id = ? AND vendor_id = ?
        ")->execute([
            $routeId,
            $shopCode,
            $shopName,
            trim((string)($b['owner_name'] ?? $shop['owner_name'])),
            trim((string)($b['phone'] ?? $shop['phone'])),
            trim((string)($b['address'] ?? $shop['address'])),
            trim((string)($b['vat_number'] ?? $shop['vat_number'])),
            $lat,
            $lng,
            $shopId,
            $vendorId,
        ]);

        Response::ok(['id' => $shopId], "Shop '{$shopName}' details updated!");
    }

    public function getOrCreateConfirmLink(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $shopId = (int)($req->params['id'] ?? 0);
        $pdo = Database::getConnection();
        self::ensureShopConfirmColumns($pdo);

        $stmt = $pdo->prepare("
            SELECT s.*, r.assigned_van_id
            FROM shops s
            INNER JOIN routes r ON r.id = s.route_id
            WHERE s.id = ? AND s.vendor_id = ? LIMIT 1
        ");
        $stmt->execute([$shopId, $vendorId]);
        $shop = $stmt->fetch();
        if (!$shop) {
            Response::error('Shop not found', 404);
        }
        if ($req->user['role'] === 'van' && (int)$shop['assigned_van_id'] !== (int)($req->user['van_id'] ?? 0)) {
            Response::error('Forbidden: Shop belongs to another van', 403);
        }

        $token = trim((string)($shop['confirm_token'] ?? ''));
        if ($token === '') {
            $token = bin2hex(random_bytes(16));
            $pdo->prepare("UPDATE shops SET confirm_token = ? WHERE id = ? AND vendor_id = ?")
                ->execute([$token, $shopId, $vendorId]);
        }

        Response::ok([
            'confirm_token' => $token,
            'confirm_path'  => '/?confirm-shop=' . $token,
            'shop_name'     => $shop['shop_name'],
            'phone'         => $shop['phone'],
        ]);
    }

    public function getPublicShopConfirm(Request $req): void
    {
        $token = trim((string)($req->params['token'] ?? ''));
        if ($token === '') {
            Response::error('Invalid confirmation link', 404);
        }
        $pdo = Database::getConnection();
        self::ensureShopConfirmColumns($pdo);

        $stmt = $pdo->prepare("
            SELECT s.id, s.shop_code, s.shop_name, s.owner_name, s.phone, s.address,
                   s.latitude, s.longitude, s.location_confirmed, s.location_confirmed_at,
                   v.company_name, v.header_bg_color
            FROM shops s
            INNER JOIN vendors v ON v.id = s.vendor_id
            WHERE s.confirm_token = ? LIMIT 1
        ");
        $stmt->execute([$token]);
        $shop = $stmt->fetch();
        if (!$shop) {
            Response::error('Shop confirmation link not found or expired', 404);
        }
        Response::ok($shop);
    }

    public function submitPublicShopConfirm(Request $req): void
    {
        $token = trim((string)($req->params['token'] ?? ''));
        $b = $req->body();
        if ($token === '') {
            Response::error('Invalid confirmation link', 404);
        }
        if (!isset($b['latitude']) || !isset($b['longitude']) || !is_numeric($b['latitude']) || !is_numeric($b['longitude'])) {
            Response::error('Valid GPS latitude and longitude are required to confirm store location', 422);
        }

        $pdo = Database::getConnection();
        self::ensureShopConfirmColumns($pdo);
        $stmt = $pdo->prepare("SELECT * FROM shops WHERE confirm_token = ? LIMIT 1");
        $stmt->execute([$token]);
        $shop = $stmt->fetch();
        if (!$shop) {
            Response::error('Shop confirmation link not found', 404);
        }

        $lat = (float)$b['latitude'];
        $lng = (float)$b['longitude'];
        $address = trim((string)($b['address'] ?? '')) ?: $shop['address'];
        $ownerName = trim((string)($b['owner_name'] ?? '')) ?: $shop['owner_name'];
        $phone = trim((string)($b['phone'] ?? '')) ?: $shop['phone'];

        $pdo->prepare("
            UPDATE shops
            SET latitude = ?, longitude = ?, address = ?, owner_name = ?, phone = ?,
                location_confirmed = 1, location_confirmed_at = NOW()
            WHERE id = ?
        ")->execute([$lat, $lng, $address, $ownerName, $phone, (int)$shop['id']]);

        Response::ok([
            'shop_id'               => (int)$shop['id'],
            'shop_name'             => $shop['shop_name'],
            'latitude'              => $lat,
            'longitude'             => $lng,
            'location_confirmed'    => 1,
        ], 'Store location confirmed and updated in system!');
    }

    public function transferShopToVan(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $shopId = (int)($req->params['id'] ?? 0);
        $b = $req->body();
        $targetRouteId = !empty($b['route_id']) ? (int)$b['route_id'] : 0;
        $targetVanId = !empty($b['van_id']) ? (int)$b['van_id'] : 0;

        $pdo = Database::getConnection();
        $sStmt = $pdo->prepare("SELECT * FROM shops WHERE id = ? AND vendor_id = ? LIMIT 1");
        $sStmt->execute([$shopId, $vendorId]);
        $shop = $sStmt->fetch();
        if (!$shop) {
            Response::error('Shop not found', 404);
        }

        if ($targetRouteId) {
            $rStmt = $pdo->prepare("SELECT id, route_name, assigned_van_id FROM routes WHERE id = ? AND vendor_id = ? LIMIT 1");
            $rStmt->execute([$targetRouteId, $vendorId]);
            $route = $rStmt->fetch();
            if (!$route) {
                Response::error('Target route not found', 404);
            }
        } elseif ($targetVanId) {
            $vStmt = $pdo->prepare("SELECT id, van_code, van_name FROM vans WHERE id = ? AND vendor_id = ? LIMIT 1");
            $vStmt->execute([$targetVanId, $vendorId]);
            $van = $vStmt->fetch();
            if (!$van) {
                Response::error('Target van not found', 404);
            }
            $rFind = $pdo->prepare("SELECT id FROM routes WHERE vendor_id = ? AND assigned_van_id = ? ORDER BY id ASC LIMIT 1");
            $rFind->execute([$vendorId, $targetVanId]);
            $rRow = $rFind->fetch();
            if ($rRow) {
                $targetRouteId = (int)$rRow['id'];
            } else {
                $rCode = 'RT-' . ($van['van_code'] ?? ('VAN' . $targetVanId));
                $rName = ($van['van_name'] ?? ('Van ' . $targetVanId)) . ' Route';
                $pdo->prepare("INSERT INTO routes (vendor_id, route_code, route_name, assigned_van_id) VALUES (?, ?, ?, ?)")
                    ->execute([$vendorId, $rCode, $rName, $targetVanId]);
                $targetRouteId = (int)$pdo->lastInsertId();
            }
        } else {
            Response::error('Please select a target Van or Route', 422);
        }

        $pdo->prepare("UPDATE shops SET route_id = ? WHERE id = ? AND vendor_id = ?")
            ->execute([$targetRouteId, $shopId, $vendorId]);

        Response::ok(['shop_id' => $shopId, 'route_id' => $targetRouteId], "Shop '{$shop['shop_name']}' transferred successfully.");
    }

    public function checkinShop(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $shopId = (int)($req->params['id'] ?? 0);
        $vanId = (int)($req->user['van_id'] ?? 0);
        if (!$vanId) {
            Response::error('Only assigned van drivers can check in at a shop', 403);
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            SELECT s.*, r.assigned_van_id
            FROM shops s
            INNER JOIN routes r ON r.id = s.route_id
            WHERE s.id = ? AND s.vendor_id = ? LIMIT 1
        ");
        $stmt->execute([$shopId, $vendorId]);
        $shop = $stmt->fetch();

        if (!$shop) {
            Response::error('Shop not found', 404);
        }
        if ((int)$shop['assigned_van_id'] !== $vanId) {
            Response::error('Forbidden: This shop is not assigned to your van route', 403);
        }

        $b = $req->body();
        $maxRadius = (int)($req->vendor['geofence_radius_m'] ?? 250);
        if (!isset($b['latitude']) || !isset($b['longitude']) || !is_numeric($b['latitude']) || !is_numeric($b['longitude'])) {
            Response::error("Live GPS location is required to verify arrival within {$maxRadius}m of the shop.", 422);
        }

        $lat = (float)$b['latitude'];
        $lng = (float)$b['longitude'];
        $dist = $this->haversineMeters($lat, $lng, (float)$shop['latitude'], (float)$shop['longitude']);

        if ($dist > $maxRadius) {
            Response::error("Arrival gate failed: You are " . round($dist) . "m away from shop (max allowed: {$maxRadius}m)", 422, ['distance_m' => round($dist, 1)]);
        }

        $pdo->prepare("INSERT INTO shop_visits (vendor_id, van_id, shop_id, driver_user_id, checkin_lat, checkin_lng, distance_m) VALUES (?, ?, ?, ?, ?, ?, ?)")
            ->execute([$vendorId, $vanId, $shopId, $req->user['id'], $lat, $lng, round($dist, 2)]);

        Response::ok(['shop_id' => $shopId, 'distance_m' => round($dist, 1)], 'Shop arrival verified! Billing unlocked.');
    }
}

