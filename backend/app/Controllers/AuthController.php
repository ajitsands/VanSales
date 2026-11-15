<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;

class AuthController
{
    public function login(Request $req): void
    {
        $body = $req->body();
        $username = trim($body['username'] ?? '');
        $password = (string)($body['password'] ?? '');
        $deviceInfo = trim($body['device_info'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? 'Web/Mobile Client'));

        if ($username === '' || $password === '') {
            Response::error('Username and password are required', 422);
        }

        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ? LIMIT 1");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Response::error('Invalid username or password', 401);
        }

        if (!(int)$user['is_active']) {
            Response::error('User account is deactivated', 403);
        }

        $vendor = null;
        if ($user['role'] !== 'superadmin' && $user['vendor_id']) {
            $vStmt = $pdo->prepare("SELECT * FROM vendors WHERE id = ? LIMIT 1");
            $vStmt->execute([$user['vendor_id']]);
            $vendor = $vStmt->fetch();
            if (!$vendor || $vendor['license_status'] !== 'active') {
                Response::error('Organization license is inactive or suspended', 403);
            }
        }

        // Generate never-expiring token (expires_at = NULL; valid until explicit logout)
        $token = bin2hex(random_bytes(32));
        $tStmt = $pdo->prepare("INSERT INTO user_tokens (user_id, token, device_info, is_revoked, expires_at) VALUES (?, ?, ?, 0, NULL)");
        $tStmt->execute([$user['id'], $token, substr($deviceInfo, 0, 175)]);

        unset($user['password_hash']);
        $user['permissions'] = $user['permissions_json'] ? json_decode($user['permissions_json'], true) : [];
        unset($user['permissions_json']);

        $van = null;
        if ($user['van_id']) {
            $vanStmt = $pdo->prepare("SELECT * FROM vans WHERE id = ? LIMIT 1");
            $vanStmt->execute([$user['van_id']]);
            $van = $vanStmt->fetch() ?: null;
        }

        Response::ok([
            'token'  => $token,
            'user'   => $user,
            'vendor' => $vendor,
            'van'    => $van,
        ], 'Login successful');
    }

    public function logout(Request $req): void
    {
        $token = $req->bearerToken();
        if ($token) {
            $pdo = Database::getConnection();
            $pdo->prepare("UPDATE user_tokens SET is_revoked = 1 WHERE token = ?")->execute([$token]);
        }
        Response::ok(null, 'Logged out successfully');
    }

    public function me(Request $req): void
    {
        $pdo = Database::getConnection();
        $van = null;
        if (!empty($req->user['van_id'])) {
            $vanStmt = $pdo->prepare("SELECT * FROM vans WHERE id = ? LIMIT 1");
            $vanStmt->execute([$req->user['van_id']]);
            $van = $vanStmt->fetch() ?: null;
        }

        Response::ok([
            'user'   => $req->user,
            'vendor' => $req->vendor,
            'van'    => $van,
        ]);
    }
}

