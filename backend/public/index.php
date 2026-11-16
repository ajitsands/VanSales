<?php
declare(strict_types=1);

// CORS Headers for ReactJS Frontend
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Simple PSR-4 Autoloader for App\*
spl_autoload_register(function (string $class): void {
    $prefix = 'App\\';
    $baseDir = __DIR__ . '/../app/';
    if (strncmp($prefix, $class, strlen($prefix)) !== 0) {
        return;
    }
    $relClass = substr($class, strlen($prefix));
    $file = $baseDir . str_replace('\\', '/', $relClass) . '.php';
    if (file_exists($file)) {
        require $file;
    }
});

use App\Core\Request;
use App\Core\Response;
use App\Core\Router;
use App\Middleware\AuthMiddleware;
use App\Controllers\AuthController;
use App\Controllers\SuperadminController;
use App\Controllers\AdminController;
use App\Controllers\ProcurementController;
use App\Controllers\InventoryController;
use App\Controllers\TransferController;
use App\Controllers\RouteController;
use App\Controllers\SalesController;
use App\Controllers\ShiftController;
use App\Controllers\DashboardController;
use App\Controllers\LedgerChequeController;
use App\Controllers\AttachmentController;
use App\Controllers\ShareController;

set_exception_handler(function (Throwable $e): void {
    Response::error('Server Error: ' . $e->getMessage(), 500);
});

$router = new Router();
$auth = AuthMiddleware::authenticate();

// Health Check
$router->add('GET', '/api/health', fn() => Response::ok(['status' => 'running', 'time' => date('c')]));

// Auth & Never-Expiring Token Management
$router->add('POST', '/api/auth/login', [AuthController::class, 'login']);
$router->add('POST', '/api/auth/logout', [AuthController::class, 'logout'], [$auth]);
$router->add('GET', '/api/auth/me', [AuthController::class, 'me'], [$auth]);

// Superadmin Routes (Platform Owner Only: Licensing & Vendor Creation)
$onlySuper = [$auth, AuthMiddleware::requireRole(['superadmin'])];
$router->add('GET', '/api/superadmin/stats', [SuperadminController::class, 'stats'], $onlySuper);
$router->add('GET', '/api/superadmin/vendors', [SuperadminController::class, 'listVendors'], $onlySuper);
$router->add('POST', '/api/superadmin/vendors', [SuperadminController::class, 'createVendor'], $onlySuper);
$router->add('PUT', '/api/superadmin/vendors/{id}', [SuperadminController::class, 'updateVendor'], $onlySuper);

// Vendor Admin Routes (NO Licensing/Vendor Creation; Company Settings, Theme, User Quotas)
$onlyAdmin = [$auth, AuthMiddleware::requireRole(['admin'])];
$router->add('GET', '/api/admin/settings', [AdminController::class, 'getSettings'], $onlyAdmin);
$router->add('PUT', '/api/admin/settings', [AdminController::class, 'updateSettings'], $onlyAdmin);
$router->add('GET', '/api/admin/users', [AdminController::class, 'listUsers'], $onlyAdmin);
$router->add('POST', '/api/admin/users', [AdminController::class, 'createUser'], $onlyAdmin);
$router->add('PUT', '/api/admin/users/{id}', [AdminController::class, 'updateUser'], $onlyAdmin);
$router->add('POST', '/api/admin/vans', [AdminController::class, 'createVan'], $onlyAdmin);

// Shared Vendor Read (Admin, Account, Van)
$vendorUsers = [$auth, AuthMiddleware::requireRole(['admin', 'account', 'van'])];
$router->add('GET', '/api/vans', [AdminController::class, 'listVans'], $vendorUsers);

// Executive Admin Dashboard (Admin or Account with reports)
$router->add('GET', '/api/dashboard/executive', [DashboardController::class, 'executive'], [$auth, AuthMiddleware::requirePermission('reports')]);
$router->add('GET', '/api/dashboard/van-drilldown', [DashboardController::class, 'vanDrilldown'], [$auth, AuthMiddleware::requirePermission('reports')]);
$router->add('GET', '/api/dashboard/van-sales-report', [DashboardController::class, 'vanSalesReport'], [$auth, AuthMiddleware::requirePermission('reports')]);
$router->add('GET', '/api/dashboard/van', [DashboardController::class, 'vanDashboard'], $vendorUsers);

// Procurement & Item Master
$router->add('GET', '/api/suppliers', [ProcurementController::class, 'listSuppliers'], [$auth, AuthMiddleware::requirePermission('procurement')]);
$router->add('POST', '/api/suppliers', [ProcurementController::class, 'createSupplier'], [$auth, AuthMiddleware::requirePermission('procurement')]);
$router->add('GET', '/api/items', [ProcurementController::class, 'listItems'], $vendorUsers);
$router->add('POST', '/api/items', [ProcurementController::class, 'createItem'], [$auth, AuthMiddleware::requirePermission('procurement')]);
$router->add('PUT', '/api/items/{id}', [ProcurementController::class, 'updateItem'], [$auth, AuthMiddleware::requirePermission('procurement')]);
$router->add('GET', '/api/grns', [ProcurementController::class, 'listGrns'], [$auth, AuthMiddleware::requirePermission('procurement')]);
$router->add('POST', '/api/grns', [ProcurementController::class, 'createGrn'], [$auth, AuthMiddleware::requirePermission('procurement')]);
$router->add('PUT', '/api/grns/{grn_id}/items/{batch_id}', [ProcurementController::class, 'updateGrnItem'], [$auth, AuthMiddleware::requirePermission('procurement')]);
$router->add('DELETE', '/api/grns/{id}', [ProcurementController::class, 'deleteGrn'], [$auth, AuthMiddleware::requirePermission('procurement')]);

// Inventory (FIFO / FEFO Batches)
$router->add('GET', '/api/inventory/batches', [InventoryController::class, 'listBatches'], $vendorUsers);
$router->add('GET', '/api/inventory/van-stock', [InventoryController::class, 'vanStockSummary'], $vendorUsers);

// Requests, Store-to-Van, Van-to-Van Transfers & Returns/Damages
$router->add('GET', '/api/requests', [TransferController::class, 'listRequests'], $vendorUsers);
$router->add('POST', '/api/requests', [TransferController::class, 'createRequest'], $vendorUsers);
$router->add('POST', '/api/requests/{id}/cancel', [TransferController::class, 'cancelRequest'], $vendorUsers);
$router->add('POST', '/api/requests/{id}/cancel-balance', [TransferController::class, 'cancelRequestBalance'], $vendorUsers);
$router->add('POST', '/api/requests/{id}/delete', [TransferController::class, 'deleteRequest'], $vendorUsers);
$router->add('DELETE', '/api/requests/{id}', [TransferController::class, 'deleteRequest'], $vendorUsers);
$router->add('POST', '/api/transfers/store-to-van', [TransferController::class, 'dispatchStoreToVan'], [$auth, AuthMiddleware::requirePermission('transfers')]);
$router->add('POST', '/api/transfers/van-to-van', [TransferController::class, 'createVanToVan'], $vendorUsers);
$router->add('POST', '/api/transfers/{id}/confirm', [TransferController::class, 'confirmTransfer'], $vendorUsers);
$router->add('GET', '/api/transfers', [TransferController::class, 'listTransfers'], $vendorUsers);

$router->add('GET', '/api/returns-damages', [TransferController::class, 'listReturnsDamages'], $vendorUsers);
$router->add('POST', '/api/returns-damages', [TransferController::class, 'reportReturnDamage'], $vendorUsers);
$router->add('POST', '/api/returns-damages/{id}/qc', [TransferController::class, 'qcReturnDamage'], [$auth, AuthMiddleware::requirePermission('returns')]);

// Routes, Shops & GPS Arrival Check-In
$router->add('GET', '/api/routes', [RouteController::class, 'listRoutes'], $vendorUsers);
$router->add('POST', '/api/routes', [RouteController::class, 'createRoute'], [$auth, AuthMiddleware::requireRole(['admin'])]);
$router->add('GET', '/api/shops', [RouteController::class, 'listShops'], $vendorUsers);
$router->add('POST', '/api/shops', [RouteController::class, 'createShop'], $vendorUsers);
$router->add('PUT', '/api/shops/{id}', [RouteController::class, 'updateShop'], $vendorUsers);
$router->add('PUT', '/api/shops/{id}/transfer-van', [RouteController::class, 'transferShopToVan'], [$auth, AuthMiddleware::requireRole(['admin'])]);
$router->add('POST', '/api/shops/{id}/confirm-link', [RouteController::class, 'getOrCreateConfirmLink'], $vendorUsers);
$router->add('POST', '/api/shops/{id}/checkin', [RouteController::class, 'checkinShop'], $vendorUsers);

// Sales & Shop Returns (Main Store + Van POS + Split Payments + Bill Correction/Archive)
$router->add('GET', '/api/invoices', [SalesController::class, 'listInvoices'], $vendorUsers);
$router->add('POST', '/api/invoices', [SalesController::class, 'createInvoice'], $vendorUsers);
$router->add('POST', '/api/invoices/{id}/correct', [SalesController::class, 'correctInvoice'], $vendorUsers);
$router->add('GET', '/api/invoice-archives', [SalesController::class, 'listArchives'], [$auth, AuthMiddleware::requirePermission('reports')]);

// Shifts (Same-Day & Multi-Day) & Compulsory Closing Requests
$router->add('GET', '/api/shifts/current', [ShiftController::class, 'currentShift'], $vendorUsers);
$router->add('POST', '/api/shifts/open', [ShiftController::class, 'openShift'], $vendorUsers);
$router->add('POST', '/api/shifts/close', [ShiftController::class, 'submitClosing'], $vendorUsers);
$router->add('GET', '/api/closings', [ShiftController::class, 'listClosings'], [$auth, AuthMiddleware::requirePermission('reports')]);
$router->add('POST', '/api/closings/{id}/review', [ShiftController::class, 'reviewClosing'], [$auth, AuthMiddleware::requireRole(['admin'])]);

// Shop / Customer Ledgers & Cheque Reconciliation
$router->add('GET', '/api/shop-ledgers', [LedgerChequeController::class, 'listShopLedgers'], $vendorUsers);
$router->add('GET', '/api/shop-ledgers/{id}', [LedgerChequeController::class, 'getShopStatement'], $vendorUsers);
$router->add('POST', '/api/shop-ledgers/{id}/collect', [LedgerChequeController::class, 'collectPayment'], $vendorUsers);
$router->add('GET', '/api/customer-ledgers', [LedgerChequeController::class, 'listCustomerLedgers'], $vendorUsers);
$router->add('POST', '/api/customer-ledgers', [LedgerChequeController::class, 'createOrUpdateCustomerLedger'], $vendorUsers);
$router->add('GET', '/api/customer-ledgers/lookup', [LedgerChequeController::class, 'lookupCustomerByMobile'], $vendorUsers);
$router->add('POST', '/api/customer-ledgers/merge', [LedgerChequeController::class, 'mergeCustomerLedgers'], $vendorUsers);
$router->add('GET', '/api/customer-ledgers/{id}', [LedgerChequeController::class, 'getCustomerStatement'], $vendorUsers);
$router->add('POST', '/api/customer-ledgers/{id}/collect', [LedgerChequeController::class, 'collectCustomerPayment'], $vendorUsers);
$router->add('GET', '/api/reports/van-today-shops', [LedgerChequeController::class, 'vanTodayShopReport'], $vendorUsers);
$router->add('GET', '/api/cheques', [LedgerChequeController::class, 'listCheques'], [$auth, AuthMiddleware::requirePermission('reports')]);
$router->add('POST', '/api/cheques/{id}/reconcile', [LedgerChequeController::class, 'reconcileCheque'], [$auth, AuthMiddleware::requirePermission('reports')]);

// Receipt & Payment Attachments (Screenshots, Cheque Photos, Bank Slips)
$router->add('POST', '/api/attachments', [AttachmentController::class, 'upload'], $vendorUsers);
$router->add('GET', '/api/invoices/{id}/attachments', [AttachmentController::class, 'listByInvoice'], $vendorUsers);
$router->add('GET', '/api/attachments/{id}/file', [AttachmentController::class, 'serveFile'], $vendorUsers);

// Public & Authenticated WhatsApp Share Links (Shop Ledger & Bills)
$router->add('POST', '/api/share-links', [ShareController::class, 'createLink'], $vendorUsers);
$router->add('GET', '/api/public/share/{token}', [ShareController::class, 'viewPublic']);
$router->add('GET', '/api/public/shop-confirm/{token}', [RouteController::class, 'getPublicShopConfirm']);
$router->add('POST', '/api/public/shop-confirm/{token}', [RouteController::class, 'submitPublicShopConfirm']);

$router->dispatch(new Request());

