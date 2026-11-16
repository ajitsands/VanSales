<?php
$envFile = __DIR__ . '/../.env';
if (is_file($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$k, $v] = explode('=', $line, 2);
        $k = trim($k);
        $v = trim($v, " \t\n\r\0\x0B\"'");
        if ($k !== '' && getenv($k) === false) {
            putenv("$k=$v");
            $_ENV[$k] = $v;
        }
    }
}

$hostHeader = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
$hostOnly = explode(':', $hostHeader)[0];
$isLocal = PHP_SAPI === 'cli'
    || $hostOnly === ''
    || $hostOnly === 'localhost'
    || $hostOnly === '127.0.0.1'
    || str_starts_with($hostOnly, '192.168.')
    || str_starts_with($hostOnly, '10.');

$defaultDb   = $isLocal ? 'van_sales_db' : 'vansandslab_vansales_db';
$defaultUser = $isLocal ? 'root' : 'vansandslab_vansales_user';

return [
    'host'    => getenv('DB_HOST') ?: '127.0.0.1',
    'port'    => getenv('DB_PORT') ?: '3306',
    'dbname'  => getenv('DB_NAME') ?: $defaultDb,
    'user'    => getenv('DB_USER') ?: $defaultUser,
    'pass'    => getenv('DB_PASS') !== false ? getenv('DB_PASS') : 'S@nds1@b',
    'charset' => 'utf8mb4',
];
