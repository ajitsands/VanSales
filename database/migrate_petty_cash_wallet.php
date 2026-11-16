<?php
require_once __DIR__ . '/../backend/app/Core/Database.php';
require_once __DIR__ . '/../backend/app/Core/SchemaHelper.php';

use App\Core\Database;
use App\Core\SchemaHelper;

$pdo = Database::getConnection();
SchemaHelper::ensurePettyCashAndWalletSchema($pdo);
echo "Migration for petty_cash_entries, driver_wallet_entries & closing_requests completed successfully!\n";
