<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use Throwable;

class SuperadminController
{
    private function computeTotalCost(array $d): float
    {
        $base = (float)($d['software_base_cost'] ?? 350);
        $maxNormal = (int)($d['max_normal_users'] ?? 5);
        $freeNormal = (int)($d['free_normal_users'] ?? 5);
        $paidNormalCost = (float)($d['paid_normal_user_cost'] ?? 30);

        $maxVan = (int)($d['max_van_users'] ?? 5);
        $freeVan = (int)($d['free_van_users'] ?? 0);
        $paidVanCost = (float)($d['paid_van_user_cost'] ?? 40);

        $paidNormalCount = max(0, $maxNormal - $freeNormal);
        $paidVanCount = max(0, $maxVan - $freeVan);

        return round($base + ($paidNormalCount * $paidNormalCost) + ($paidVanCount * $paidVanCost), 3);
    }

    public function stats(Request $req): void
    {
        $pdo = Database::getConnection();
        $vendors = $pdo->query("SELECT COUNT(*) AS total, SUM(CASE WHEN license_status='active' THEN 1 ELSE 0 END) AS active_count, COALESCE(SUM(CASE WHEN license_status='active' THEN total_software_cost ELSE 0 END), 0) AS total_saas_value FROM vendors")->fetch();
        $users = $pdo->query("SELECT role, COUNT(*) AS cnt FROM users WHERE role != 'superadmin' GROUP BY role")->fetchAll();
        $tokens = $pdo->query("SELECT COUNT(*) FROM user_tokens WHERE is_revoked = 0")->fetchColumn();

        Response::ok([
            'vendors'       => $vendors,
            'users_by_role' => $users,
            'active_tokens' => (int)$tokens,
        ]);
    }

    public function listVendors(Request $req): void
    {
        $pdo = Database::getConnection();
        $rows = $pdo->query("
            SELECT v.*,
              (SELECT COUNT(*) FROM users u WHERE u.vendor_id = v.id AND u.role = 'account') AS current_normal_users,
              (SELECT COUNT(*) FROM users u WHERE u.vendor_id = v.id AND u.role = 'van') AS current_van_users,
              (SELECT COUNT(*) FROM users u WHERE u.vendor_id = v.id AND u.role = 'admin') AS current_admin_users
            FROM vendors v
            ORDER BY v.id DESC
        ")->fetchAll();

        Response::ok($rows);
    }

    public function createVendor(Request $req): void
    {
        $b = $req->body();
        $companyName = trim($b['company_name'] ?? '');
        $companyCode = trim($b['company_code'] ?? '');
        $adminUsername = trim($b['admin_username'] ?? '');
        $adminPassword = (string)($b['admin_password'] ?? 'Admin@123');
        $adminName = trim($b['admin_full_name'] ?? ($companyName . ' Admin'));

        if ($companyName === '' || $companyCode === '' || $adminUsername === '') {
            Response::error('Company name, company code, and admin username are required', 422);
        }

        $totalCost = $this->computeTotalCost($b);
        $billingCycle = ($b['billing_cycle'] ?? 'yearly') === 'monthly' ? 'monthly' : 'yearly';
        $expiresAt = $b['license_expires_at'] ?? ($billingCycle === 'monthly' ? date('Y-m-d', strtotime('+1 month')) : date('Y-m-d', strtotime('+1 year')));

        $pdo = Database::getConnection();
        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare("
                INSERT INTO vendors (
                    company_name, company_code, billing_cycle, software_base_cost,
                    max_normal_users, free_normal_users, paid_normal_user_cost,
                    max_van_users, free_van_users, paid_van_user_cost,
                    total_software_cost, license_status, license_expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
            ");
            $stmt->execute([
                $companyName,
                $companyCode,
                $billingCycle,
                (float)($b['software_base_cost'] ?? 350),
                (int)($b['max_normal_users'] ?? 5),
                (int)($b['free_normal_users'] ?? 5),
                (float)($b['paid_normal_user_cost'] ?? 30),
                (int)($b['max_van_users'] ?? 5),
                (int)($b['free_van_users'] ?? 0),
                (float)($b['paid_van_user_cost'] ?? 40),
                $totalCost,
                $expiresAt,
            ]);
            $vendorId = (int)$pdo->lastInsertId();

            // Create initial Vendor Admin user
            $uStmt = $pdo->prepare("INSERT INTO users (vendor_id, username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?, 'admin')");
            $uStmt->execute([
                $vendorId,
                $adminUsername,
                trim($b['admin_email'] ?? ''),
                password_hash($adminPassword, PASSWORD_BCRYPT),
                $adminName,
            ]);

            // Auto-provision 1 default van so vendor can start right away
            $pdo->prepare("INSERT INTO vans (vendor_id, van_code, van_name, plate_number) VALUES (?, 'VAN-01', 'Van 01 - Primary', 'BH-10001')")
                ->execute([$vendorId]);

            $pdo->commit();
            Response::ok(['vendor_id' => $vendorId, 'total_software_cost' => $totalCost], 'Vendor & Admin created successfully', 201);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            Response::error('Failed to create vendor: ' . $e->getMessage(), 400);
        }
    }

    public function updateVendor(Request $req): void
    {
        $id = (int)($req->params['id'] ?? 0);
        $b = $req->body();
        $pdo = Database::getConnection();

        $existing = $pdo->prepare("SELECT * FROM vendors WHERE id = ? LIMIT 1");
        $existing->execute([$id]);
        $row = $existing->fetch();
        if (!$row) {
            Response::error('Vendor not found', 404);
        }

        $merged = array_merge($row, $b);
        $totalCost = $this->computeTotalCost($merged);

        $stmt = $pdo->prepare("
            UPDATE vendors SET
                company_name = ?, billing_cycle = ?, software_base_cost = ?,
                max_normal_users = ?, free_normal_users = ?, paid_normal_user_cost = ?,
                max_van_users = ?, free_van_users = ?, paid_van_user_cost = ?,
                total_software_cost = ?, license_status = ?, license_expires_at = ?
            WHERE id = ?
        ");
        $stmt->execute([
            $merged['company_name'],
            $merged['billing_cycle'],
            (float)$merged['software_base_cost'],
            (int)$merged['max_normal_users'],
            (int)$merged['free_normal_users'],
            (float)$merged['paid_normal_user_cost'],
            (int)$merged['max_van_users'],
            (int)$merged['free_van_users'],
            (float)$merged['paid_van_user_cost'],
            $totalCost,
            $merged['license_status'],
            $merged['license_expires_at'],
            $id,
        ]);

        Response::ok(['total_software_cost' => $totalCost], 'Vendor license updated');
    }
}

