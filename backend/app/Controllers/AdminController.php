<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use Throwable;

class AdminController
{
    private static function ensureShiftTimingsColumn(\PDO $pdo): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }
        $col = $pdo->query("SHOW COLUMNS FROM vendors LIKE 'shift_timings'")->fetch();
        if (!$col) {
            $pdo->exec("ALTER TABLE vendors ADD COLUMN shift_timings TEXT NULL");
        }
        $checked = true;
    }

    public function getSettings(Request $req): void
    {
        Response::ok($req->vendor);
    }

    public function updateSettings(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $v = $req->vendor;

        $pdo = Database::getConnection();
        self::ensureShiftTimingsColumn($pdo);

        $shiftTimingsJson = $v['shift_timings'] ?? null;
        if (array_key_exists('shift_timings', $b)) {
            $rawShifts = $b['shift_timings'];
            if (is_string($rawShifts)) {
                $decoded = json_decode($rawShifts, true);
                $rawShifts = is_array($decoded) ? $decoded : [];
            }
            if (is_array($rawShifts)) {
                $cleanShifts = [];
                foreach ($rawShifts as $idx => $s) {
                    if (!is_array($s)) continue;
                    $name = trim((string)($s['name'] ?? ''));
                    $from = substr(trim((string)($s['from'] ?? '')), 0, 5);
                    $to = substr(trim((string)($s['to'] ?? '')), 0, 5);
                    if ($name !== '' && $from !== '' && $to !== '') {
                        $cleanShifts[] = [
                            'id'   => trim((string)($s['id'] ?? '')) ?: ('shift_' . ($idx + 1)),
                            'name' => $name,
                            'from' => $from,
                            'to'   => $to,
                        ];
                    }
                }
                $shiftTimingsJson = json_encode($cleanShifts, JSON_UNESCAPED_UNICODE);
            }
        }

        $stmt = $pdo->prepare("
            UPDATE vendors SET
                company_name = ?,
                logo_url = ?,
                header_bg_color = ?,
                header_text_color = ?,
                footer_bg_color = ?,
                footer_text_color = ?,
                currency_code = ?,
                currency_decimals = ?,
                date_format = ?,
                vat_percent = ?,
                default_vat_mode = ?,
                geofence_radius_m = ?,
                require_eod_closing = ?,
                shift_timings = ?
            WHERE id = ?
        ");
        $stmt->execute([
            trim($b['company_name'] ?? $v['company_name']),
            $b['logo_url'] ?? $v['logo_url'],
            $b['header_bg_color'] ?? $v['header_bg_color'],
            $b['header_text_color'] ?? $v['header_text_color'],
            $b['footer_bg_color'] ?? $v['footer_bg_color'],
            $b['footer_text_color'] ?? $v['footer_text_color'],
            strtoupper(trim($b['currency_code'] ?? $v['currency_code'])),
            (int)($b['currency_decimals'] ?? $v['currency_decimals']),
            $b['date_format'] ?? $v['date_format'],
            (float)($b['vat_percent'] ?? $v['vat_percent']),
            ($b['default_vat_mode'] ?? $v['default_vat_mode']) === 'inclusive' ? 'inclusive' : 'exclusive',
            (int)($b['geofence_radius_m'] ?? $v['geofence_radius_m']),
            isset($b['require_eod_closing']) ? ((int)$b['require_eod_closing'] ? 1 : 0) : (int)$v['require_eod_closing'],
            $shiftTimingsJson,
            $vendorId,
        ]);

        $fresh = $pdo->prepare("SELECT * FROM vendors WHERE id = ?");
        $fresh->execute([$vendorId]);
        Response::ok($fresh->fetch(), 'Organization settings & theme updated');
    }

    public function listUsers(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            SELECT u.id, u.username, u.email, u.full_name, u.phone, u.role, u.permissions_json, u.van_id, u.is_active, u.created_at,
                   v.van_code, v.van_name
            FROM users u
            LEFT JOIN vans v ON v.id = u.van_id
            WHERE u.vendor_id = ? AND u.role IN ('admin','account','van')
            ORDER BY FIELD(u.role,'admin','account','van'), u.id DESC
        ");
        $stmt->execute([$vendorId]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['permissions'] = $r['permissions_json'] ? json_decode($r['permissions_json'], true) : [];
            unset($r['permissions_json']);
        }

        $normalUsed = count(array_filter($rows, fn($r) => $r['role'] === 'account'));
        $vanUsed = count(array_filter($rows, fn($r) => $r['role'] === 'van'));

        Response::ok([
            'users' => $rows,
            'quotas' => [
                'max_normal_users'  => (int)$req->vendor['max_normal_users'],
                'free_normal_users' => (int)$req->vendor['free_normal_users'],
                'used_normal_users' => $normalUsed,
                'max_van_users'     => (int)$req->vendor['max_van_users'],
                'free_van_users'    => (int)$req->vendor['free_van_users'],
                'used_van_users'    => $vanUsed,
            ],
        ]);
    }

    public function createUser(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $role = $b['role'] ?? '';

        if (!in_array($role, ['account', 'van'], true)) {
            Response::error('Vendor Admin can only create Account Users or Van Users', 422);
        }

        $pdo = Database::getConnection();

        // Enforce Superadmin-configured quotas
        $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE vendor_id = ? AND role = ?");
        $cntStmt->execute([$vendorId, $role]);
        $currentCount = (int)$cntStmt->fetchColumn();

        if ($role === 'account' && $currentCount >= (int)$req->vendor['max_normal_users']) {
            Response::error("Account user quota reached ({$currentCount}/{$req->vendor['max_normal_users']}). Contact Superadmin to upgrade license.", 403);
        }
        if ($role === 'van' && $currentCount >= (int)$req->vendor['max_van_users']) {
            Response::error("Van user quota reached ({$currentCount}/{$req->vendor['max_van_users']}). Contact Superadmin to upgrade license.", 403);
        }

        $username = trim($b['username'] ?? '');
        $password = (string)($b['password'] ?? '');
        $fullName = trim($b['full_name'] ?? '');
        if ($username === '' || $password === '' || $fullName === '') {
            Response::error('Username, password, and full name are required', 422);
        }

        $permsJson = $role === 'account' ? json_encode($b['permissions'] ?? [
            'procurement' => true,
            'inventory'   => true,
            'transfers'   => true,
            'sales'       => true,
            'returns'     => true,
            'reports'     => true,
            'settings'    => false,
        ]) : null;

        $vanId = $role === 'van' && !empty($b['van_id']) ? (int)$b['van_id'] : null;

        try {
            $stmt = $pdo->prepare("
                INSERT INTO users (vendor_id, username, email, password_hash, full_name, phone, role, permissions_json, van_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $vendorId,
                $username,
                trim($b['email'] ?? ''),
                password_hash($password, PASSWORD_BCRYPT),
                $fullName,
                trim($b['phone'] ?? ''),
                $role,
                $permsJson,
                $vanId,
            ]);
            Response::ok(['id' => (int)$pdo->lastInsertId()], 'User created successfully', 201);
        } catch (Throwable $e) {
            Response::error('Could not create user: ' . $e->getMessage(), 400);
        }
    }

    public function updateUser(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $id = (int)($req->params['id'] ?? 0);
        $b = $req->body();
        $pdo = Database::getConnection();

        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND vendor_id = ? LIMIT 1");
        $stmt->execute([$id, $vendorId]);
        $user = $stmt->fetch();
        if (!$user) {
            Response::error('User not found', 404);
        }

        $permsJson = isset($b['permissions']) ? json_encode($b['permissions']) : $user['permissions_json'];
        $isActive = isset($b['is_active']) ? ((int)$b['is_active'] ? 1 : 0) : (int)$user['is_active'];
        $vanId = array_key_exists('van_id', $b) ? ($b['van_id'] ? (int)$b['van_id'] : null) : $user['van_id'];

        $pdo->prepare("UPDATE users SET full_name = ?, phone = ?, permissions_json = ?, van_id = ?, is_active = ? WHERE id = ?")
            ->execute([
                trim($b['full_name'] ?? $user['full_name']),
                trim($b['phone'] ?? ($user['phone'] ?? '')),
                $permsJson,
                $vanId,
                $isActive,
                $id,
            ]);

        Response::ok(null, 'User updated');
    }

    public function listVans(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM vans WHERE vendor_id = ? ORDER BY id ASC");
        $stmt->execute([$vendorId]);
        Response::ok($stmt->fetchAll());
    }

    public function createVan(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $b = $req->body();
        $code = trim($b['van_code'] ?? '');
        $name = trim($b['van_name'] ?? '');
        if ($code === '' || $name === '') {
            Response::error('Van code and van name are required', 422);
        }
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("INSERT INTO vans (vendor_id, van_code, van_name, plate_number) VALUES (?, ?, ?, ?)");
        $stmt->execute([$vendorId, $code, $name, trim($b['plate_number'] ?? '')]);
        Response::ok(['id' => (int)$pdo->lastInsertId()], 'Van created', 201);
    }
}

