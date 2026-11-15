<?php
namespace App\Models;

use PDO;

class CustomerLedgerModel
{
    public static function ensureTables(PDO $pdo): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS main_store_customers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vendor_id INT NOT NULL,
                customer_name VARCHAR(160) NOT NULL,
                mobile_no VARCHAR(40) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_ms_cust_vendor_mobile (vendor_id, mobile_no)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS main_store_customer_ledger (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vendor_id INT NOT NULL,
                customer_id INT NOT NULL,
                entry_type VARCHAR(32) NOT NULL,
                ref_no VARCHAR(80) NULL,
                invoice_id INT NULL,
                payment_method VARCHAR(32) NULL,
                debit DECIMAL(12,3) NOT NULL DEFAULT 0.000,
                credit DECIMAL(12,3) NOT NULL DEFAULT 0.000,
                notes VARCHAR(255) NULL,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ms_ledger_cust (vendor_id, customer_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        $done = true;
    }

    public static function upsertCustomer(PDO $pdo, int $vendorId, string $mobileNo, string $customerName): int
    {
        self::ensureTables($pdo);
        $mobile = trim($mobileNo);
        $name = trim($customerName) ?: 'Walk-in Customer';

        $stmt = $pdo->prepare("SELECT id, customer_name FROM main_store_customers WHERE vendor_id = ? AND mobile_no = ? LIMIT 1");
        $stmt->execute([$vendorId, $mobile]);
        $existing = $stmt->fetch();
        if ($existing) {
            if ($name !== '' && $name !== 'Counter Customer' && $name !== 'Walk-in Customer' && $name !== $existing['customer_name']) {
                $pdo->prepare("UPDATE main_store_customers SET customer_name = ? WHERE id = ?")->execute([$name, (int)$existing['id']]);
            }
            return (int)$existing['id'];
        }

        $ins = $pdo->prepare("INSERT INTO main_store_customers (vendor_id, customer_name, mobile_no) VALUES (?, ?, ?)");
        $ins->execute([$vendorId, $name, $mobile]);
        return (int)$pdo->lastInsertId();
    }

    public static function addEntry(
        PDO $pdo,
        int $vendorId,
        int $customerId,
        string $entryType,
        ?string $refNo,
        ?int $invoiceId,
        ?string $paymentMethod,
        float $debit,
        float $credit,
        string $notes,
        ?int $userId
    ): void {
        self::ensureTables($pdo);
        $stmt = $pdo->prepare("
            INSERT INTO main_store_customer_ledger (vendor_id, customer_id, entry_type, ref_no, invoice_id, payment_method, debit, credit, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $vendorId,
            $customerId,
            $entryType,
            $refNo,
            $invoiceId,
            $paymentMethod,
            round($debit, 3),
            round($credit, 3),
            $notes,
            $userId,
        ]);
    }

    public static function getSummaryByMobile(PDO $pdo, int $vendorId, string $mobileNo): array
    {
        self::ensureTables($pdo);
        $mobile = trim($mobileNo);
        if ($mobile === '') {
            return ['found' => false];
        }
        $stmt = $pdo->prepare("SELECT * FROM main_store_customers WHERE vendor_id = ? AND mobile_no = ? LIMIT 1");
        $stmt->execute([$vendorId, $mobile]);
        $cust = $stmt->fetch();
        if (!$cust) {
            $digits = preg_replace('/\D+/', '', $mobile);
            if (strlen($digits) >= 6) {
                $localTail = substr($digits, -8);
                $stmt2 = $pdo->prepare("SELECT * FROM main_store_customers WHERE vendor_id = ? AND (REPLACE(REPLACE(mobile_no, '+', ''), ' ', '') = ? OR mobile_no = ? OR mobile_no LIKE ?) LIMIT 1");
                $stmt2->execute([$vendorId, $digits, $localTail, '%' . $localTail]);
                $cust = $stmt2->fetch();
            }
        }
        if (!$cust) {
            return ['found' => false];
        }
        $cid = (int)$cust['id'];
        $agg = $pdo->prepare("
            SELECT COALESCE(SUM(debit), 0) AS total_debit,
                   COALESCE(SUM(credit), 0) AS total_credit,
                   COALESCE(SUM(debit - credit), 0) AS balance
            FROM main_store_customer_ledger
            WHERE vendor_id = ? AND customer_id = ?
        ");
        $agg->execute([$vendorId, $cid]);
        $totals = $agg->fetch() ?: ['total_debit' => 0, 'total_credit' => 0, 'balance' => 0];

        $rec = $pdo->prepare("
            SELECT * FROM main_store_customer_ledger
            WHERE vendor_id = ? AND customer_id = ?
            ORDER BY id DESC LIMIT 15
        ");
        $rec->execute([$vendorId, $cid]);

        return [
            'found'          => true,
            'customer'       => $cust,
            'total_debit'    => (float)$totals['total_debit'],
            'total_credit'   => (float)$totals['total_credit'],
            'balance'        => (float)$totals['balance'],
            'recent_entries' => $rec->fetchAll(),
        ];
    }
}

