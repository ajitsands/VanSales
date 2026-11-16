<?php
namespace App\Core;

use PDO;

class SchemaHelper
{
    private static bool $pettyChecked = false;

    public static function ensurePettyCashAndWalletSchema(PDO $pdo): void
    {
        if (self::$pettyChecked) {
            return;
        }
        self::$pettyChecked = true;

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS petty_cash_entries (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                vendor_id INT NOT NULL,
                source_type ENUM('van','main_store') NOT NULL DEFAULT 'van',
                van_id INT NULL,
                shift_id INT NULL,
                user_id INT NOT NULL,
                entry_type ENUM('expense','income') NOT NULL,
                category VARCHAR(80) NOT NULL DEFAULT 'Misc',
                amount DECIMAL(12,3) NOT NULL,
                notes VARCHAR(255) NULL,
                entry_date DATE NOT NULL,
                bill_attachment_path VARCHAR(255) NULL,
                attachments_json LONGTEXT NULL,
                closing_id BIGINT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pc_vendor_src (vendor_id, source_type, entry_date),
                INDEX idx_pc_van_closing (van_id, closing_id)
            ) ENGINE=InnoDB
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS driver_wallet_entries (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                vendor_id INT NOT NULL,
                van_id INT NOT NULL,
                driver_user_id INT NOT NULL,
                shift_id INT NULL,
                closing_id BIGINT NULL,
                entry_type ENUM('shortage','excess','settlement') NOT NULL,
                amount DECIMAL(12,3) NOT NULL,
                notes VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_dw_vendor_van (vendor_id, van_id)
            ) ENGINE=InnoDB
        ");

        $cols = $pdo->query("SHOW COLUMNS FROM closing_requests")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('petty_cash_income', $cols, true)) {
            $pdo->exec("ALTER TABLE closing_requests ADD COLUMN petty_cash_income DECIMAL(12,3) NOT NULL DEFAULT 0.000 AFTER expected_credit");
        }
        if (!in_array('petty_cash_expense', $cols, true)) {
            $pdo->exec("ALTER TABLE closing_requests ADD COLUMN petty_cash_expense DECIMAL(12,3) NOT NULL DEFAULT 0.000 AFTER petty_cash_income");
        }
        if (!in_array('shortage_amount', $cols, true)) {
            $pdo->exec("ALTER TABLE closing_requests ADD COLUMN shortage_amount DECIMAL(12,3) NOT NULL DEFAULT 0.000 AFTER petty_cash_expense");
        }
        if (!in_array('keep_shortage_in_wallet', $cols, true)) {
            $pdo->exec("ALTER TABLE closing_requests ADD COLUMN keep_shortage_in_wallet TINYINT(1) NOT NULL DEFAULT 0 AFTER shortage_amount");
        }
        if (!in_array('included_shift_ids', $cols, true)) {
            $pdo->exec("ALTER TABLE closing_requests ADD COLUMN included_shift_ids VARCHAR(255) NULL AFTER keep_shortage_in_wallet");
        }

        $pcCols = $pdo->query("SHOW COLUMNS FROM petty_cash_entries")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('bill_attachment_path', $pcCols, true)) {
            $pdo->exec("ALTER TABLE petty_cash_entries ADD COLUMN bill_attachment_path VARCHAR(255) NULL AFTER entry_date");
        }
        if (!in_array('attachments_json', $pcCols, true)) {
            $pdo->exec("ALTER TABLE petty_cash_entries ADD COLUMN attachments_json LONGTEXT NULL AFTER bill_attachment_path");
        }
    }
}
