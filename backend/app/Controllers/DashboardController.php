<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Request;
use App\Core\Response;

class DashboardController
{
    private function normalizeDateRange(Request $req): array
    {
        $today = date('Y-m-d');
        $from = trim((string)($req->query('from_date') ?: ''));
        $to   = trim((string)($req->query('to_date') ?: ''));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
            $from = $today;
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            $to = $today;
        }
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }
        return [$from, $to];
    }

    private function computeAgingAndCheques(\PDO $pdo, int $vendorId, ?int $vanId = null): array
    {
        $shopSql = "
            SELECT s.id AS shop_id, s.shop_code, s.shop_name, s.phone,
                   r.route_name, r.assigned_van_id AS van_id, v.van_name
            FROM shops s
            INNER JOIN routes r ON r.id = s.route_id
            LEFT JOIN vans v ON v.id = r.assigned_van_id
            WHERE s.vendor_id = ?
        ";
        $params = [$vendorId];
        if ($vanId !== null && $vanId > 0) {
            $shopSql .= " AND r.assigned_van_id = ?";
            $params[] = $vanId;
        }
        $shopStmt = $pdo->prepare($shopSql);
        $shopStmt->execute($params);
        $shops = $shopStmt->fetchAll();

        $ledgerStmt = $pdo->prepare("
            SELECT id, entry_type, ref_no, invoice_id, payment_id, notes, debit, credit, DATE(created_at) AS entry_date,
                   created_at, DATEDIFF(CURDATE(), DATE(created_at)) AS age_days
            FROM shop_ledger_entries
            WHERE vendor_id = ? AND shop_id = ?
            ORDER BY id ASC
        ");

        $invLineStmt = $pdo->prepare("
            SELECT l.id, i.sku, i.name AS item_name, i.uom, l.batch_no, l.qty, l.unit_price, l.line_total
            FROM invoice_lines l
            INNER JOIN items i ON i.id = l.item_id
            WHERE l.invoice_id = ?
            ORDER BY l.id ASC
        ");

        $invPayStmt = $pdo->prepare("
            SELECT id, payment_method, amount, reference_no, bank_name, cheque_no, cheque_status
            FROM invoice_payments
            WHERE invoice_id = ?
            ORDER BY id ASC
        ");

        $pendingChqByShopStmt = $pdo->prepare("
            SELECT COALESCE(SUM(amount), 0)
            FROM invoice_payments
            WHERE vendor_id = ? AND shop_id = ? AND payment_method = 'cheque' AND cheque_status = 'pending_clearance'
        ");

        $agingTotals = [
            'total_outstanding' => 0.0,
            'bucket_0_7'        => 0.0,
            'bucket_8_15'       => 0.0,
            'bucket_16_30'      => 0.0,
            'bucket_31_plus'    => 0.0,
            'shop_count'        => 0,
        ];
        $agingShops = [];

        foreach ($shops as $s) {
            $sid = (int)$s['shop_id'];
            $ledgerStmt->execute([$vendorId, $sid]);
            $entries = $ledgerStmt->fetchAll();

            $totalDebit = 0.0;
            $totalCredit = 0.0;
            $debits = [];
            foreach ($entries as $e) {
                $d = (float)$e['debit'];
                $c = (float)$e['credit'];
                $totalDebit += $d;
                $totalCredit += $c;
                if ($d > 0) {
                    $debits[] = ['amount' => $d, 'age_days' => max(0, (int)$e['age_days'])];
                }
            }

            $balance = round($totalDebit - $totalCredit, 3);
            if ($balance <= 0.0005) {
                continue;
            }

            // FIFO allocation of totalCredit against chronological debits
            $remCredit = $totalCredit;
            $b0_7 = 0.0;
            $b8_15 = 0.0;
            $b16_30 = 0.0;
            $b31 = 0.0;
            $oldestDays = 0;

            foreach ($debits as $db) {
                $amt = $db['amount'];
                if ($remCredit > 0) {
                    $applied = min($amt, $remCredit);
                    $amt -= $applied;
                    $remCredit -= $applied;
                }
                if ($amt > 0.0005) {
                    $age = $db['age_days'];
                    if ($age > $oldestDays) {
                        $oldestDays = $age;
                    }
                    if ($age <= 7) {
                        $b0_7 += $amt;
                    } elseif ($age <= 15) {
                        $b8_15 += $amt;
                    } elseif ($age <= 30) {
                        $b16_30 += $amt;
                    } else {
                        $b31 += $amt;
                    }
                }
            }

            $pendingChqByShopStmt->execute([$vendorId, $sid]);
            $pendChq = round((float)$pendingChqByShopStmt->fetchColumn(), 3);

            foreach ($entries as &$ent) {
                $iid = (int)($ent['invoice_id'] ?? 0);
                if ($iid > 0) {
                    $invLineStmt->execute([$iid]);
                    $ent['lines'] = $invLineStmt->fetchAll();
                    $invPayStmt->execute([$iid]);
                    $ent['payments'] = $invPayStmt->fetchAll();
                } else {
                    $ent['lines'] = [];
                    $ent['payments'] = [];
                }
            }
            unset($ent);

            $row = [
                'shop_id'           => $sid,
                'shop_code'         => $s['shop_code'],
                'shop_name'         => $s['shop_name'],
                'phone'             => $s['phone'],
                'van_name'          => $s['van_name'] ?: 'Main Store',
                'route_name'        => $s['route_name'],
                'total_outstanding' => $balance,
                'bucket_0_7'        => round($b0_7, 3),
                'bucket_8_15'       => round($b8_15, 3),
                'bucket_16_30'      => round($b16_30, 3),
                'bucket_31_plus'    => round($b31, 3),
                'oldest_days'       => $oldestDays,
                'pending_cheques'   => $pendChq,
                'transactions'      => array_reverse($entries),
            ];
            $agingShops[] = $row;

            $agingTotals['total_outstanding'] = round($agingTotals['total_outstanding'] + $balance, 3);
            $agingTotals['bucket_0_7']        = round($agingTotals['bucket_0_7'] + $row['bucket_0_7'], 3);
            $agingTotals['bucket_8_15']       = round($agingTotals['bucket_8_15'] + $row['bucket_8_15'], 3);
            $agingTotals['bucket_16_30']      = round($agingTotals['bucket_16_30'] + $row['bucket_16_30'], 3);
            $agingTotals['bucket_31_plus']    = round($agingTotals['bucket_31_plus'] + $row['bucket_31_plus'], 3);
            $agingTotals['shop_count']++;
        }

        usort($agingShops, fn($a, $b) => $b['total_outstanding'] <=> $a['total_outstanding']);

        // Cheque Status Summary & Outstanding Cheques List
        $chqSql = "
            SELECT p.id, p.amount, p.reference_no, p.bank_name, p.cheque_no, p.cheque_date,
                   p.cheque_status, p.paid_at, p.cleared_at,
                   DATEDIFF(CURDATE(), COALESCE(p.cheque_date, DATE(p.paid_at))) AS days_pending,
                   s.shop_code, s.shop_name, v.van_name, inv.invoice_no
            FROM invoice_payments p
            LEFT JOIN shops s ON s.id = p.shop_id
            LEFT JOIN vans v ON v.id = p.van_id
            LEFT JOIN invoices inv ON inv.id = p.invoice_id
            WHERE p.vendor_id = ? AND p.payment_method = 'cheque'
        ";
        $chqParams = [$vendorId];
        if ($vanId !== null && $vanId > 0) {
            $chqSql .= " AND p.van_id = ?";
            $chqParams[] = $vanId;
        }
        $chqSql .= " ORDER BY FIELD(p.cheque_status,'pending_clearance','bounced','cleared'), p.id DESC";
        $chqStmt = $pdo->prepare($chqSql);
        $chqStmt->execute($chqParams);
        $allCheques = $chqStmt->fetchAll();

        $chequeSummary = [
            'pending_count'  => 0, 'pending_amount' => 0.0,
            'cleared_count'  => 0, 'cleared_amount' => 0.0,
            'bounced_count'  => 0, 'bounced_amount' => 0.0,
        ];
        $outstandingCheques = [];

        foreach ($allCheques as $ch) {
            $amt = (float)$ch['amount'];
            $st = $ch['cheque_status'];
            if ($st === 'pending_clearance') {
                $chequeSummary['pending_count']++;
                $chequeSummary['pending_amount'] = round($chequeSummary['pending_amount'] + $amt, 3);
                $outstandingCheques[] = $ch;
            } elseif ($st === 'bounced') {
                $chequeSummary['bounced_count']++;
                $chequeSummary['bounced_amount'] = round($chequeSummary['bounced_amount'] + $amt, 3);
                $outstandingCheques[] = $ch;
            } else {
                $chequeSummary['cleared_count']++;
                $chequeSummary['cleared_amount'] = round($chequeSummary['cleared_amount'] + $amt, 3);
            }
        }

        return [
            'aging_totals'        => $agingTotals,
            'aging_shops'         => $agingShops,
            'cheque_summary'      => $chequeSummary,
            'outstanding_cheques' => $outstandingCheques,
        ];
    }

    public function executive(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $pdo = Database::getConnection();
        [$fromDate, $toDate] = $this->normalizeDateRange($req);

        // Date-Range Summary KPIs (defaults to Today)
        $todayStmt = $pdo->prepare("
            SELECT
              COALESCE(SUM(CASE WHEN invoice_type='sale' THEN total_amount ELSE 0 END), 0) AS today_sales,
              COALESCE(SUM(CASE WHEN invoice_type='return' THEN total_amount ELSE 0 END), 0) AS today_returns,
              COALESCE(SUM(total_cogs), 0) AS today_cogs,
              COALESCE(SUM(net_profit), 0) AS today_net_profit,
              COUNT(CASE WHEN invoice_type='sale' THEN 1 END) AS today_bill_count
            FROM invoices
            WHERE vendor_id = ? AND DATE(created_at) BETWEEN ? AND ?
        ");
        $todayStmt->execute([$vendorId, $fromDate, $toDate]);
        $today = $todayStmt->fetch();

        // Split Collections in Selected Date Range (Cash, Card, QR Pay, Bank Transfer, Cheque, Credit)
        $payTodayStmt = $pdo->prepare("
            SELECT payment_method, COALESCE(SUM(amount), 0) AS total
            FROM invoice_payments
            WHERE vendor_id = ? AND DATE(paid_at) BETWEEN ? AND ?
            GROUP BY payment_method
        ");
        $payTodayStmt->execute([$vendorId, $fromDate, $toDate]);
        $splitToday = ['cash' => 0.0, 'card' => 0.0, 'qr_pay' => 0.0, 'bank_transfer' => 0.0, 'cheque' => 0.0, 'credit' => 0.0];
        foreach ($payTodayStmt->fetchAll() as $p) {
            $splitToday[$p['payment_method']] = (float)$p['total'];
        }

        // Month-to-Date Split Collections (based on toDate's month)
        $payMonthStmt = $pdo->prepare("
            SELECT payment_method, COALESCE(SUM(amount), 0) AS total
            FROM invoice_payments
            WHERE vendor_id = ? AND YEAR(paid_at) = YEAR(?) AND MONTH(paid_at) = MONTH(?)
            GROUP BY payment_method
        ");
        $payMonthStmt->execute([$vendorId, $toDate, $toDate]);
        $splitMonth = ['cash' => 0.0, 'card' => 0.0, 'qr_pay' => 0.0, 'bank_transfer' => 0.0, 'cheque' => 0.0, 'credit' => 0.0];
        foreach ($payMonthStmt->fetchAll() as $p) {
            $splitMonth[$p['payment_method']] = (float)$p['total'];
        }

        // Sales & Split Collections per Van in Date Range
        $vanStmt = $pdo->prepare("
            SELECT v.id, v.van_code, v.van_name, v.plate_number,
              COALESCE((SELECT SUM(total_amount) FROM invoices inv WHERE inv.van_id = v.id AND inv.invoice_type='sale' AND DATE(inv.created_at) BETWEEN ? AND ?), 0) AS live_sales,
              COALESCE((SELECT SUM(net_profit) FROM invoices inv WHERE inv.van_id = v.id AND DATE(inv.created_at) BETWEEN ? AND ?), 0) AS net_profit,
              COALESCE((SELECT COUNT(*) FROM invoices inv WHERE inv.van_id = v.id AND inv.invoice_type='sale' AND DATE(inv.created_at) BETWEEN ? AND ?), 0) AS bill_count,
              COALESCE((SELECT SUM(amount) FROM invoice_payments ip WHERE ip.van_id = v.id AND ip.payment_method='cash' AND DATE(ip.paid_at) BETWEEN ? AND ?), 0) AS cash_total,
              COALESCE((SELECT SUM(amount) FROM invoice_payments ip WHERE ip.van_id = v.id AND ip.payment_method='card' AND DATE(ip.paid_at) BETWEEN ? AND ?), 0) AS card_total,
              COALESCE((SELECT SUM(amount) FROM invoice_payments ip WHERE ip.van_id = v.id AND ip.payment_method='qr_pay' AND DATE(ip.paid_at) BETWEEN ? AND ?), 0) AS qr_total,
              COALESCE((SELECT SUM(amount) FROM invoice_payments ip WHERE ip.van_id = v.id AND ip.payment_method='bank_transfer' AND DATE(ip.paid_at) BETWEEN ? AND ?), 0) AS bank_transfer_total,
              COALESCE((SELECT SUM(amount) FROM invoice_payments ip WHERE ip.van_id = v.id AND ip.payment_method='cheque' AND DATE(ip.paid_at) BETWEEN ? AND ?), 0) AS cheque_total,
              COALESCE((SELECT SUM(amount) FROM invoice_payments ip WHERE ip.van_id = v.id AND ip.payment_method='credit' AND DATE(ip.paid_at) BETWEEN ? AND ?), 0) AS credit_total,
              (SELECT status FROM van_shifts vs WHERE vs.van_id = v.id ORDER BY vs.id DESC LIMIT 1) AS shift_status,
              (SELECT shift_name FROM van_shifts vs WHERE vs.van_id = v.id ORDER BY vs.id DESC LIMIT 1) AS shift_name
            FROM vans v
            WHERE v.vendor_id = ?
            ORDER BY v.id ASC
        ");
        $vanStmt->execute([
            $fromDate, $toDate,
            $fromDate, $toDate,
            $fromDate, $toDate,
            $fromDate, $toDate,
            $fromDate, $toDate,
            $fromDate, $toDate,
            $fromDate, $toDate,
            $fromDate, $toDate,
            $fromDate, $toDate,
            $vendorId,
        ]);
        $vans = $vanStmt->fetchAll();

        // Recent invoices within Date Range
        $recentStmt = $pdo->prepare("
            SELECT inv.id, inv.invoice_no, inv.source_type, inv.customer_name, inv.total_amount, inv.net_profit, inv.vat_mode, inv.created_at,
                   v.van_name
            FROM invoices inv
            LEFT JOIN vans v ON v.id = inv.van_id
            WHERE inv.vendor_id = ? AND DATE(inv.created_at) BETWEEN ? AND ?
            ORDER BY inv.id DESC
            LIMIT 100
        ");
        $recentStmt->execute([$vendorId, $fromDate, $toDate]);
        $recentInvoices = $recentStmt->fetchAll();
        $pStmt = $pdo->prepare("SELECT payment_method, amount, reference_no FROM invoice_payments WHERE invoice_id = ?");
        foreach ($recentInvoices as &$ri) {
            $pStmt->execute([$ri['id']]);
            $ri['payments'] = $pStmt->fetchAll();
        }

        // Pending Closing Requests Count & Stock Valuation
        $pendingClosings = (int)$pdo->query("SELECT COUNT(*) FROM closing_requests WHERE vendor_id = {$vendorId} AND status = 'pending'")->fetchColumn();
        $pendingRequests = (int)$pdo->query("SELECT COUNT(*) FROM van_item_requests WHERE vendor_id = {$vendorId} AND status = 'pending'")->fetchColumn();
        $stockValue = (float)$pdo->query("SELECT COALESCE(SUM(qty_available * unit_cost), 0) FROM stock_batches WHERE vendor_id = {$vendorId} AND qty_available > 0")->fetchColumn();

        $agingAndCheques = $this->computeAgingAndCheques($pdo, $vendorId, null);

        Response::ok([
            'from_date'        => $fromDate,
            'to_date'          => $toDate,
            'today'            => $today,
            'split_today'      => $splitToday,
            'split_month'      => $splitMonth,
            'vans'             => $vans,
            'recent_invoices'  => $recentInvoices,
            'pending_closings' => $pendingClosings,
            'pending_requests' => $pendingRequests,
            'stock_valuation'  => round($stockValue, 3),
            'aging_totals'     => $agingAndCheques['aging_totals'],
            'cheque_summary'   => $agingAndCheques['cheque_summary'],
        ]);
    }

    public function vanDashboard(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanId = $req->user['role'] === 'van'
            ? (int)$req->user['van_id']
            : (int)($req->query('van_id') ?: 0);

        if ($vanId <= 0) {
            Response::error('Van ID is required for Van Dashboard', 422);
        }

        $pdo = Database::getConnection();
        [$fromDate, $toDate] = $this->normalizeDateRange($req);

        // 1. Always-live Today's Transaction KPIs
        $todayStmt = $pdo->prepare("
            SELECT
              COALESCE(SUM(CASE WHEN invoice_type='sale' THEN total_amount ELSE 0 END), 0) AS sales_total,
              COALESCE(SUM(CASE WHEN invoice_type='return' THEN total_amount ELSE 0 END), 0) AS returns_total,
              COUNT(CASE WHEN invoice_type='sale' THEN 1 END) AS bill_count,
              COUNT(CASE WHEN invoice_type='return' THEN 1 END) AS return_count
            FROM invoices
            WHERE vendor_id = ? AND van_id = ? AND DATE(created_at) = CURDATE()
        ");
        $todayStmt->execute([$vendorId, $vanId]);
        $todayKpis = $todayStmt->fetch();

        $todayPayStmt = $pdo->prepare("
            SELECT payment_method, COALESCE(SUM(amount), 0) AS total
            FROM invoice_payments
            WHERE vendor_id = ? AND van_id = ? AND DATE(paid_at) = CURDATE()
            GROUP BY payment_method
        ");
        $todayPayStmt->execute([$vendorId, $vanId]);
        $todaySplit = ['cash' => 0.0, 'card' => 0.0, 'qr_pay' => 0.0, 'bank_transfer' => 0.0, 'cheque' => 0.0, 'credit' => 0.0];
        foreach ($todayPayStmt->fetchAll() as $p) {
            $todaySplit[$p['payment_method']] = (float)$p['total'];
        }
        $todayCollected = round($todaySplit['cash'] + $todaySplit['card'] + $todaySplit['qr_pay'] + $todaySplit['bank_transfer'], 3);
        $todayKpis['collected_total'] = $todayCollected;
        $todayKpis['cheque_total']    = round($todaySplit['cheque'], 3);
        $todayKpis['credit_total']    = round($todaySplit['credit'], 3);

        // 2. Date-Between Filtered Period KPIs & Van Collection Insight
        $periodStmt = $pdo->prepare("
            SELECT
              COALESCE(SUM(CASE WHEN invoice_type='sale' THEN total_amount ELSE 0 END), 0) AS sales_total,
              COALESCE(SUM(CASE WHEN invoice_type='return' THEN total_amount ELSE 0 END), 0) AS returns_total,
              COUNT(CASE WHEN invoice_type='sale' THEN 1 END) AS bill_count,
              COUNT(CASE WHEN invoice_type='return' THEN 1 END) AS return_count
            FROM invoices
            WHERE vendor_id = ? AND van_id = ? AND DATE(created_at) BETWEEN ? AND ?
        ");
        $periodStmt->execute([$vendorId, $vanId, $fromDate, $toDate]);
        $periodKpis = $periodStmt->fetch();

        $periodPayStmt = $pdo->prepare("
            SELECT payment_method, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS tx_count
            FROM invoice_payments
            WHERE vendor_id = ? AND van_id = ? AND DATE(paid_at) BETWEEN ? AND ?
            GROUP BY payment_method
        ");
        $periodPayStmt->execute([$vendorId, $vanId, $fromDate, $toDate]);
        $periodSplit = ['cash' => 0.0, 'card' => 0.0, 'qr_pay' => 0.0, 'bank_transfer' => 0.0, 'cheque' => 0.0, 'credit' => 0.0];
        $periodPayCounts = ['cash' => 0, 'card' => 0, 'qr_pay' => 0, 'bank_transfer' => 0, 'cheque' => 0, 'credit' => 0];
        foreach ($periodPayStmt->fetchAll() as $p) {
            $periodSplit[$p['payment_method']] = (float)$p['total'];
            $periodPayCounts[$p['payment_method']] = (int)$p['tx_count'];
        }
        $periodCollected = round($periodSplit['cash'] + $periodSplit['card'] + $periodSplit['qr_pay'] + $periodSplit['bank_transfer'], 3);
        $periodKpis['collected_total'] = $periodCollected;
        $periodKpis['avg_bill'] = ((int)$periodKpis['bill_count']) > 0
            ? round(((float)$periodKpis['sales_total']) / (int)$periodKpis['bill_count'], 3)
            : 0.0;

        // 3. Daily Breakdown inside Date Range
        $dailyStmt = $pdo->prepare("
            SELECT DATE(inv.created_at) AS tx_date,
                   COUNT(CASE WHEN inv.invoice_type='sale' THEN 1 END) AS bills,
                   COALESCE(SUM(CASE WHEN inv.invoice_type='sale' THEN inv.total_amount ELSE 0 END), 0) AS sales_total,
                   COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.van_id = ? AND DATE(p.paid_at) = DATE(inv.created_at) AND p.payment_method IN ('cash','card','qr_pay','bank_transfer')), 0) AS collected_total
            FROM invoices inv
            WHERE inv.vendor_id = ? AND inv.van_id = ? AND DATE(inv.created_at) BETWEEN ? AND ?
            GROUP BY DATE(inv.created_at)
            ORDER BY tx_date DESC
        ");
        $dailyStmt->execute([$vanId, $vendorId, $vanId, $fromDate, $toDate]);
        $dailyBreakdown = $dailyStmt->fetchAll();

        // 4. Outstanding Cheque Status & Shop Outstanding Amount Aging
        $agingAndCheques = $this->computeAgingAndCheques($pdo, $vendorId, $vanId);

        Response::ok([
            'from_date'           => $fromDate,
            'to_date'             => $toDate,
            'today_kpis'          => $todayKpis,
            'today_split'         => $todaySplit,
            'period_kpis'         => $periodKpis,
            'period_split'        => $periodSplit,
            'period_pay_counts'   => $periodPayCounts,
            'daily_breakdown'     => $dailyBreakdown,
            'aging_totals'        => $agingAndCheques['aging_totals'],
            'aging_shops'         => $agingAndCheques['aging_shops'],
            'cheque_summary'      => $agingAndCheques['cheque_summary'],
            'outstanding_cheques' => $agingAndCheques['outstanding_cheques'],
        ]);
    }

    public function vanDrilldown(Request $req): void
    {
        $vendorId = (int)$req->user['vendor_id'];
        $vanId = (int)($req->query('van_id') ?: 0);
        if ($vanId <= 0) {
            Response::error('van_id is required', 422);
        }

        $pdo = Database::getConnection();
        $vStmt = $pdo->prepare("SELECT id, van_code, van_name, plate_number FROM vans WHERE id = ? AND vendor_id = ? LIMIT 1");
        $vStmt->execute([$vanId, $vendorId]);
        $van = $vStmt->fetch();
        if (!$van) {
            Response::error('Van not found', 404);
        }

        [$fromDate, $toDate] = $this->normalizeDateRange($req);

        // Fetch all shops assigned to this van
        $sStmt = $pdo->prepare("
            SELECT s.id AS shop_id, s.shop_code, s.shop_name, s.phone, r.route_name,
                   COALESCE((SELECT SUM(debit - credit) FROM shop_ledger_entries l WHERE l.shop_id = s.id), 0) AS ledger_balance
            FROM shops s
            INNER JOIN routes r ON r.id = s.route_id
            WHERE s.vendor_id = ? AND r.assigned_van_id = ?
            ORDER BY s.shop_name ASC
        ");
        $sStmt->execute([$vendorId, $vanId]);
        $assignedShops = $sStmt->fetchAll();

        $shopMap = [];
        foreach ($assignedShops as $s) {
            $sid = (int)$s['shop_id'];
            $shopMap[$sid] = [
                'shop_id'             => $sid,
                'shop_code'           => $s['shop_code'],
                'shop_name'           => $s['shop_name'],
                'phone'               => $s['phone'],
                'route_name'          => $s['route_name'],
                'ledger_balance'      => round((float)$s['ledger_balance'], 3),
                'bill_count'          => 0,
                'sales_total'         => 0.0,
                'returns_total'       => 0.0,
                'net_profit'          => 0.0,
                'cash_total'          => 0.0,
                'card_total'          => 0.0,
                'qr_total'            => 0.0,
                'bank_transfer_total' => 0.0,
                'cheque_total'        => 0.0,
                'credit_total'        => 0.0,
                'collected_total'     => 0.0,
                'invoices'            => [],
            ];
        }

        // Fetch all invoices for this van within the date range
        $invStmt = $pdo->prepare("
            SELECT inv.id, inv.invoice_no, inv.shop_id, inv.customer_name, inv.invoice_type, inv.vat_mode,
                   inv.subtotal, inv.vat_amount, inv.total_amount, inv.total_cogs, inv.net_profit,
                   inv.is_corrected, inv.created_at
            FROM invoices inv
            WHERE inv.vendor_id = ? AND inv.van_id = ? AND DATE(inv.created_at) BETWEEN ? AND ?
            ORDER BY inv.id DESC
        ");
        $invStmt->execute([$vendorId, $vanId, $fromDate, $toDate]);
        $invoices = $invStmt->fetchAll();

        $lStmt = $pdo->prepare("
            SELECT l.id, l.item_id, i.sku, i.name AS item_name, i.uom, l.batch_no, l.expiry_date,
                   l.qty, l.unit_price, l.unit_cost, l.line_vat, l.line_total
            FROM invoice_lines l
            INNER JOIN items i ON i.id = l.item_id
            WHERE l.invoice_id = ?
            ORDER BY l.id ASC
        ");
        $pStmt = $pdo->prepare("
            SELECT id, payment_method, amount, reference_no, bank_name, cheque_no, cheque_date, cheque_status, paid_at
            FROM invoice_payments
            WHERE invoice_id = ?
            ORDER BY id ASC
        ");
        $aStmt = $pdo->prepare("
            SELECT id, attachment_type, file_name, mime_type, file_path, created_at
            FROM invoice_attachments
            WHERE invoice_id = ?
            ORDER BY id ASC
        ");

        foreach ($invoices as $inv) {
            $sid = (int)($inv['shop_id'] ?: 0);
            if (!isset($shopMap[$sid])) {
                $shopMap[$sid] = [
                    'shop_id'             => $sid,
                    'shop_code'           => $sid > 0 ? 'SHOP-' . $sid : 'WALK-IN',
                    'shop_name'           => $inv['customer_name'] ?: 'Walk-In Customer',
                    'phone'               => '',
                    'route_name'          => 'Direct / Other',
                    'ledger_balance'      => 0.0,
                    'bill_count'          => 0,
                    'sales_total'         => 0.0,
                    'returns_total'       => 0.0,
                    'net_profit'          => 0.0,
                    'cash_total'          => 0.0,
                    'card_total'          => 0.0,
                    'qr_total'            => 0.0,
                    'bank_transfer_total' => 0.0,
                    'cheque_total'        => 0.0,
                    'credit_total'        => 0.0,
                    'collected_total'     => 0.0,
                    'invoices'            => [],
                ];
            }

            $lStmt->execute([$inv['id']]);
            $inv['lines'] = $lStmt->fetchAll();
            $pStmt->execute([$inv['id']]);
            $inv['payments'] = $pStmt->fetchAll();
            $aStmt->execute([$inv['id']]);
            $inv['attachments'] = $aStmt->fetchAll();

            if ($inv['invoice_type'] === 'sale') {
                $shopMap[$sid]['bill_count']++;
                $shopMap[$sid]['sales_total'] = round($shopMap[$sid]['sales_total'] + (float)$inv['total_amount'], 3);
            } else {
                $shopMap[$sid]['returns_total'] = round($shopMap[$sid]['returns_total'] + (float)$inv['total_amount'], 3);
            }
            $shopMap[$sid]['net_profit'] = round($shopMap[$sid]['net_profit'] + (float)$inv['net_profit'], 3);

            foreach ($inv['payments'] as $pm) {
                $amt = (float)$pm['amount'];
                $m = $pm['payment_method'];
                if ($m === 'cash') {
                    $shopMap[$sid]['cash_total'] = round($shopMap[$sid]['cash_total'] + $amt, 3);
                    $shopMap[$sid]['collected_total'] = round($shopMap[$sid]['collected_total'] + $amt, 3);
                } elseif ($m === 'card') {
                    $shopMap[$sid]['card_total'] = round($shopMap[$sid]['card_total'] + $amt, 3);
                    $shopMap[$sid]['collected_total'] = round($shopMap[$sid]['collected_total'] + $amt, 3);
                } elseif ($m === 'qr_pay') {
                    $shopMap[$sid]['qr_total'] = round($shopMap[$sid]['qr_total'] + $amt, 3);
                    $shopMap[$sid]['collected_total'] = round($shopMap[$sid]['collected_total'] + $amt, 3);
                } elseif ($m === 'bank_transfer') {
                    $shopMap[$sid]['bank_transfer_total'] = round($shopMap[$sid]['bank_transfer_total'] + $amt, 3);
                    $shopMap[$sid]['collected_total'] = round($shopMap[$sid]['collected_total'] + $amt, 3);
                } elseif ($m === 'cheque') {
                    $shopMap[$sid]['cheque_total'] = round($shopMap[$sid]['cheque_total'] + $amt, 3);
                } elseif ($m === 'credit') {
                    $shopMap[$sid]['credit_total'] = round($shopMap[$sid]['credit_total'] + $amt, 3);
                }
            }

            $shopMap[$sid]['invoices'][] = $inv;
        }

        $shops = array_values($shopMap);
        usort($shops, fn($a, $b) => $b['sales_total'] <=> $a['sales_total']);

        Response::ok([
            'van'       => $van,
            'from_date' => $fromDate,
            'to_date'   => $toDate,
            'shops'     => $shops,
        ]);
    }
}

