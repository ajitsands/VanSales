<?php
namespace App\Middleware;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;

class AuthMiddleware
{
    public static function authenticate(): callable
    {
        return function (Request $req): void {
            $token = $req->bearerToken();
            if (!$token) {
                Response::error('Unauthorized: Bearer token required', 401);
            }

            $pdo = Database::getConnection();
            $stmt = $pdo->prepare("
                SELECT t.id AS token_id, u.id, u.vendor_id, u.username, u.email, u.full_name, u.phone,
                       u.role, u.permissions_json, u.van_id, u.is_active
                FROM user_tokens t
                INNER JOIN users u ON u.id = t.user_id
                WHERE t.token = ? AND t.is_revoked = 0
                  AND (t.expires_at IS NULL OR t.expires_at > NOW())
                LIMIT 1
            ");
            $stmt->execute([$token]);
            $user = $stmt->fetch();

            if (!$user || !(int)$user['is_active']) {
                Response::error('Unauthorized: Invalid, revoked, or inactive session', 401);
            }

            // Update last_used_at asynchronously/lightweight
            $pdo->prepare("UPDATE user_tokens SET last_used_at = NOW() WHERE id = ?")->execute([$user['token_id']]);

            $user['permissions'] = $user['permissions_json'] ? json_decode($user['permissions_json'], true) : [];
            unset($user['permissions_json']);
            $req->user = $user;

            if ($user['role'] !== 'superadmin' && $user['vendor_id']) {
                $vStmt = $pdo->prepare("SELECT * FROM vendors WHERE id = ? LIMIT 1");
                $vStmt->execute([$user['vendor_id']]);
                $vendor = $vStmt->fetch();
                if (!$vendor) {
                    Response::error('Vendor organization not found', 403);
                }
                if ($vendor['license_status'] !== 'active') {
                    Response::error('Vendor license is ' . $vendor['license_status'] . '. Contact SaNDS Lab support.', 403);
                }
                $req->vendor = $vendor;
            }
        };
    }

    public static function requireRole(array $roles): callable
    {
        return function (Request $req) use ($roles): void {
            if (!in_array($req->user['role'] ?? '', $roles, true)) {
                Response::error('Forbidden: Insufficient role privileges', 403);
            }
        };
    }

    public static function requirePermission(string $perm): callable
    {
        return function (Request $req) use ($perm): void {
            $role = $req->user['role'] ?? '';
            if ($role === 'admin') {
                return; // Vendor Admin has full vendor operational privileges
            }
            if ($role === 'account') {
                $perms = $req->user['permissions'] ?? [];
                if (!empty($perms[$perm])) {
                    return;
                }
            }
            Response::error("Forbidden: Missing permission '{$perm}'", 403);
        };
    }
}

