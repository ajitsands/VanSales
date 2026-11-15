import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePersistedState } from '../hooks/usePersistedState';
import DataTable from '../components/DataTable';
import ConfirmModal from '../components/ConfirmModal';
import {
  TrendingUp, DollarSign, Truck, QrCode, CreditCard, Banknote,
  CheckCircle, XCircle, RefreshCw, Package, Clock, Landmark, FileCheck2, Calendar,
  ChevronRight, ArrowLeft, X, Store, FileText
} from 'lucide-react';

const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function ExecutiveDashboard() {
  const { user, formatMoney, formatDateTime } = useAuth();
  const todayStr = localDateStr();
  const [fromDate, setFromDate] = usePersistedState('exec_from_date', todayStr);
  const [toDate, setToDate] = usePersistedState('exec_to_date', todayStr);
  const [data, setData] = useState(null);
  const [closings, setClosings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [drillVan, setDrillVan] = useState(null);
  const [drillShop, setDrillShop] = useState(null);
  const [drillInvoice, setDrillInvoice] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const openVanDrilldown = async (vanRow) => {
    setDrillLoading(true);
    setDrillShop(null);
    setDrillInvoice(null);
    try {
      const qs = new URLSearchParams({ van_id: vanRow.id });
      if (fromDate) qs.set('from_date', fromDate);
      if (toDate) qs.set('to_date', toDate);
      const res = await api.get(`/api/dashboard/van-drilldown?${qs.toString()}`);
      setDrillVan(res);
    } catch (e) {
      setAlertMessage(e.message);
    } finally {
      setDrillLoading(false);
    }
  };

  const load = async (fDate = fromDate, tDate = toDate) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (fDate) qs.set('from_date', fDate);
      if (tDate) qs.set('to_date', tDate);
      const [exec, cls] = await Promise.all([
        api.get(`/api/dashboard/executive?${qs.toString()}`),
        api.get('/api/closings'),
      ]);
      setData(exec);
      setClosings(cls);
    } catch {
      // handled gracefully
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(fromDate, toDate); }, []);

  const applyPreset = (days) => {
    const end = new Date();
    const start = new Date();
    if (days === 'month') {
      start.setDate(1);
    } else if (days > 0) {
      start.setDate(end.getDate() - days);
    }
    const f = localDateStr(start);
    const t = localDateStr(end);
    setFromDate(f);
    setToDate(t);
    load(f, t);
  };

  const handleReview = async (id, decision) => {
    try {
      await api.post(`/api/closings/${id}/review`, { decision, review_notes: `Reviewed by ${user.full_name}` });
      setMsg(`Closing #${id} ${decision}!`);
      load();
    } catch (e) {
      setAlertMessage(e.message);
    }
  };

  if (loading && !data) {
    return <div className="card">Loading live fleet telemetry...</div>;
  }

  const today = data?.today || {};
  const splitToday = data?.split_today || {};
  const splitMonth = data?.split_month || {};
  const agingTotals = data?.aging_totals || {};
  const chequeSummary = data?.cheque_summary || {};
  const pendingClosings = closings.filter(c => c.status === 'pending');
  const isTodayOnly = fromDate === todayStr && toDate === todayStr;
  const periodLabel = isTodayOnly ? 'Today' : `${fromDate} → ${toDate}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>Executive Live Dashboard &amp; Closing Approvals</h2>
          <p style={{ fontSize: 12.5, color: '#64748b' }}>Real-time van sales, FIFO/FEFO net profit, split collections, date-range insights, and closing requests.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: '#fff', padding: '6px 10px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <Calendar size={14} style={{ color: '#64748b' }} />
          <input type="date" className="form-control" style={{ width: 135, padding: '4px 8px', fontSize: 12 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ fontSize: 12, color: '#64748b' }}>to</span>
          <input type="date" className="form-control" style={{ width: 135, padding: '4px 8px', fontSize: 12 }} value={toDate} onChange={e => setToDate(e.target.value)} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => load(fromDate, toDate)}>Search</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => applyPreset(0)}>Today</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => applyPreset(6)}>7D</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => applyPreset('month')}>Month</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => load(fromDate, toDate)}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {msg && <div className="badge badge-emerald" style={{ padding: '9px 14px', borderRadius: 8 }}>{msg}</div>}

      {/* Top Executive KPIs */}
      <div className="grid-4">
        <div className="kpi-card" style={{ borderLeft: '4px solid #059669' }}>
          <div>
            <div className="kpi-label">Net Profit ({periodLabel})</div>
            <div className="kpi-value mono" style={{ color: '#059669' }}>{formatMoney(today.today_net_profit)}</div>
            <div className="kpi-sub">Revenue &minus; FIFO/FEFO COGS ({formatMoney(today.today_cogs)})</div>
          </div>
          <div className="kpi-icon" style={{ background: '#ecfdf5', color: '#059669' }}><TrendingUp size={20} /></div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <div>
            <div className="kpi-label">Sales ({periodLabel})</div>
            <div className="kpi-value mono">{formatMoney(today.today_sales)}</div>
            <div className="kpi-sub">{today.today_bill_count || 0} bills in selected range</div>
          </div>
          <div className="kpi-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><DollarSign size={20} /></div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #d97706' }}>
          <div>
            <div className="kpi-label">Outstanding &amp; Aging</div>
            <div className="kpi-value mono" style={{ color: '#b45309' }}>{formatMoney(agingTotals.total_outstanding)}</div>
            <div className="kpi-sub">{agingTotals.shop_count || 0} shops &bull; 31+d: {formatMoney(agingTotals.bucket_31_plus)}</div>
          </div>
          <div className="kpi-icon" style={{ background: '#fffbeb', color: '#d97706' }}><Clock size={20} /></div>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid #7c3aed' }}>
          <div>
            <div className="kpi-label">Pending Cheques / Stock</div>
            <div className="kpi-value mono">{formatMoney(chequeSummary.pending_amount)}</div>
            <div className="kpi-sub">{chequeSummary.pending_count || 0} pending chq &bull; Stock: {formatMoney(data?.stock_valuation)}</div>
          </div>
          <div className="kpi-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}><Package size={20} /></div>
        </div>
      </div>

      {/* Split Collections Breakdown: Selected Period vs This Month */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            <span>Split Collections — {periodLabel}</span>
            <span className="badge badge-blue">Period Breakdown</span>
          </div>
          <div className="grid-2" style={{ gap: 10 }}>
            <div style={{ padding: 10, borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#065f46' }}>
                <Banknote size={15} /> Cash Collected
              </div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: '#064e3b', marginTop: 4 }}>{formatMoney(splitToday.cash)}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#1e40af' }}>
                <CreditCard size={15} /> Card Payments
              </div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: '#1e3a8a', marginTop: 4 }}>{formatMoney(splitToday.card)}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#5b21b6' }}>
                <QrCode size={15} /> QR Pay (BenefitPay)
              </div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: '#4c1d95', marginTop: 4 }}>{formatMoney(splitToday.qr_pay)}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#92400e' }}>
                <Clock size={15} /> Credit / On-Account
              </div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: '#78350f', marginTop: 4 }}>{formatMoney(splitToday.credit)}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#ecfeff', border: '1px solid #a5f3fc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#155e75' }}>
                <Landmark size={15} /> Bank Transfer
              </div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: '#164e63', marginTop: 4 }}>{formatMoney(splitToday.bank_transfer)}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#fdf2f8', border: '1px solid #fbcfe8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#9d174d' }}>
                <FileCheck2 size={15} /> Cheques (Collected)
              </div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: '#831843', marginTop: 4 }}>{formatMoney(splitToday.cheque)}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <span>Split Collections — This Month</span>
            <span className="badge badge-purple">Month-to-Date</span>
          </div>
          <div className="grid-2" style={{ gap: 10 }}>
            <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Cash (This Month)</div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{formatMoney(splitMonth.cash)}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Card (This Month)</div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{formatMoney(splitMonth.card)}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#5b21b6' }}>QR Pay (This Month)</div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: '#4c1d95', marginTop: 4 }}>{formatMoney(splitMonth.qr_pay)}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Credit (This Month)</div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{formatMoney(splitMonth.credit)}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#ecfeff', border: '1px solid #a5f3fc' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#155e75' }}>Bank Transfer (Month)</div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: '#164e63', marginTop: 4 }}>{formatMoney(splitMonth.bank_transfer)}</div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#fdf2f8', border: '1px solid #fbcfe8' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9d174d' }}>Cheques (Month)</div>
              <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: '#831843', marginTop: 4 }}>{formatMoney(splitMonth.cheque)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Sales & Split Collections per Van */}
      <div className="card">
        <div className="card-title">
          <span><Truck size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Sales &amp; Split Collections by Van ({periodLabel})</span>
          <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 500 }}>Click any Van to drill down Shop &rarr; Invoice &rarr; Items</span>
        </div>
        <DataTable
          data={data?.vans || []}
          searchPlaceholder="Search vans, shift status..."
          exportFilename="van-live-sales.csv"
          columns={[
            {
              key: 'van_name',
              label: 'Van',
              sortValue: (v) => v.van_name || '',
              searchValue: (v) => `${v.van_name || ''} ${v.van_code || ''} ${v.plate_number || ''}`,
              render: (v) => (
                <button
                  type="button"
                  onClick={() => openVanDrilldown(v)}
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: '#1d4ed8' }}
                >
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {v.van_name} <ChevronRight size={14} />
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{v.van_code} &bull; {v.plate_number}</div>
                </button>
              ),
            },
            {
              key: 'shift_status',
              label: 'Shift Status',
              sortValue: (v) => v.shift_status || 'idle',
              searchValue: (v) => `${v.shift_name || 'No Shift'} ${v.shift_status || 'idle'}`,
              render: (v) => (
                <span className={`badge ${v.shift_status === 'open' ? 'badge-emerald' : v.shift_status === 'closing_pending' ? 'badge-amber' : 'badge-slate'}`}>
                  {v.shift_name || 'No Shift'} ({v.shift_status || 'idle'})
                </span>
              ),
            },
            {
              key: 'bill_count',
              label: 'Bills',
              sortValue: (v) => Number(v.bill_count || 0),
              render: (v) => <span className="mono">{v.bill_count}</span>,
            },
            {
              key: 'live_sales',
              label: 'Live Sales',
              sortValue: (v) => Number(v.live_sales || 0),
              render: (v) => <span className="mono" style={{ fontWeight: 700 }}>{formatMoney(v.live_sales)}</span>,
            },
            {
              key: 'net_profit',
              label: 'Net Profit',
              sortValue: (v) => Number(v.net_profit || 0),
              render: (v) => <span className="mono" style={{ fontWeight: 700, color: '#059669' }}>{formatMoney(v.net_profit)}</span>,
            },
            {
              key: 'cash_total',
              label: 'Cash',
              sortValue: (v) => Number(v.cash_total || 0),
              render: (v) => <span className="mono">{formatMoney(v.cash_total)}</span>,
            },
            {
              key: 'card_total',
              label: 'Card',
              sortValue: (v) => Number(v.card_total || 0),
              render: (v) => <span className="mono">{formatMoney(v.card_total)}</span>,
            },
            {
              key: 'qr_total',
              label: 'QR Pay',
              sortValue: (v) => Number(v.qr_total || 0),
              render: (v) => <span className="mono" style={{ color: '#6d28d9', fontWeight: 600 }}>{formatMoney(v.qr_total)}</span>,
            },
            {
              key: 'bank_transfer_total',
              label: 'Bank Trf',
              sortValue: (v) => Number(v.bank_transfer_total || 0),
              render: (v) => <span className="mono" style={{ color: '#0e7490' }}>{formatMoney(v.bank_transfer_total)}</span>,
            },
            {
              key: 'cheque_total',
              label: 'Cheque',
              sortValue: (v) => Number(v.cheque_total || 0),
              render: (v) => <span className="mono" style={{ color: '#be185d' }}>{formatMoney(v.cheque_total)}</span>,
            },
            {
              key: 'credit_total',
              label: 'Credit',
              sortValue: (v) => Number(v.credit_total || 0),
              render: (v) => <span className="mono">{formatMoney(v.credit_total)}</span>,
            },
          ]}
        />
      </div>

      {/* Closing Requests Queue */}
      <div className="card" style={{ borderColor: pendingClosings.length > 0 ? '#f59e0b' : undefined }}>
        <div className="card-title">
          <span>Shift &amp; EOD Closing Requests (Admin Approval)</span>
          <span className="badge badge-amber">{pendingClosings.length} Pending</span>
        </div>
        <DataTable
          data={closings}
          searchPlaceholder="Search van, shift, driver, status..."
          exportFilename="shift-closings.csv"
          columns={[
            {
              key: 'van_name',
              label: 'Van & Shift',
              sortValue: (c) => c.van_name || '',
              searchValue: (c) => `${c.van_name || ''} ${c.shift_name || ''} ${c.shift_type || ''} ${c.driver_name || ''}`,
              render: (c) => (
                <>
                  <div style={{ fontWeight: 700 }}>{c.van_name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{c.shift_name} ({c.shift_type}) &bull; {c.driver_name}</div>
                </>
              ),
            },
            {
              key: 'total_sales',
              label: 'Sales / Profit',
              sortValue: (c) => Number(c.total_sales || 0),
              searchValue: (c) => `${c.total_sales || ''} ${c.net_profit || ''}`,
              render: (c) => (
                <div className="mono">
                  <div>Sales: <strong>{formatMoney(c.total_sales)}</strong></div>
                  <div style={{ color: '#059669', fontSize: 11 }}>Profit: {formatMoney(c.net_profit)}</div>
                </div>
              ),
            },
            {
              key: 'declared_cash',
              label: 'Cash (Exp / Decl)',
              sortValue: (c) => Number(c.declared_cash || 0),
              render: (c) => <span className="mono">{Number(c.expected_cash).toFixed(3)} / <strong>{Number(c.declared_cash).toFixed(3)}</strong></span>,
            },
            {
              key: 'declared_card',
              label: 'Card (Exp / Decl)',
              sortValue: (c) => Number(c.declared_card || 0),
              render: (c) => <span className="mono">{Number(c.expected_card).toFixed(3)} / <strong>{Number(c.declared_card).toFixed(3)}</strong></span>,
            },
            {
              key: 'declared_qr',
              label: 'QR Pay (Exp / Decl)',
              sortValue: (c) => Number(c.declared_qr || 0),
              render: (c) => <span className="mono" style={{ color: '#6d28d9' }}>{Number(c.expected_qr).toFixed(3)} / <strong>{Number(c.declared_qr).toFixed(3)}</strong></span>,
            },
            {
              key: 'status',
              label: 'Status',
              sortValue: (c) => c.status || '',
              searchValue: (c) => c.status || '',
              render: (c) => (
                <span className={`badge ${c.status === 'approved' ? 'badge-emerald' : c.status === 'rejected' ? 'badge-rose' : 'badge-amber'}`}>
                  {c.status}
                </span>
              ),
            },
            {
              key: 'action',
              label: 'Action',
              sortable: false,
              render: (c) => c.status === 'pending' && user.role === 'admin' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-emerald btn-sm" onClick={() => handleReview(c.id, 'approved')}>
                    <CheckCircle size={13} /> Approve
                  </button>
                  <button className="btn btn-rose btn-sm" onClick={() => handleReview(c.id, 'rejected')}>
                    <XCircle size={13} /> Reject
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 11, color: '#64748b' }}>{c.reviewed_at || 'View Only'}</span>
              ),
            },
          ]}
        />
      </div>

      {/* Live Recent Invoices with Split Payments */}
      <div className="card">
        <div className="card-title">Live Invoice &amp; Split Payment Feed</div>
        <DataTable
          data={data?.recent_invoices || []}
          searchPlaceholder="Search invoice #, source, shop, payment..."
          exportFilename="live-invoices.csv"
          columns={[
            {
              key: 'invoice_no',
              label: 'Invoice #',
              sortValue: (inv) => inv.invoice_no || '',
              searchValue: (inv) => inv.invoice_no || '',
              render: (inv) => <span className="mono" style={{ fontWeight: 700 }}>{inv.invoice_no}</span>,
            },
            {
              key: 'van_name',
              label: 'Source',
              sortValue: (inv) => inv.van_name || 'Main Store',
              searchValue: (inv) => inv.van_name || 'Main Store',
              render: (inv) => <span className="badge badge-slate">{inv.van_name || 'Main Store'}</span>,
            },
            {
              key: 'customer_name',
              label: 'Customer / Shop',
              sortValue: (inv) => inv.customer_name || '',
              searchValue: (inv) => inv.customer_name || '',
              render: (inv) => inv.customer_name,
            },
            {
              key: 'total_amount',
              label: 'Total',
              sortValue: (inv) => Number(inv.total_amount || 0),
              render: (inv) => <span className="mono" style={{ fontWeight: 700 }}>{formatMoney(inv.total_amount)}</span>,
            },
            {
              key: 'net_profit',
              label: 'Net Profit',
              sortValue: (inv) => Number(inv.net_profit || 0),
              render: (inv) => <span className="mono" style={{ color: '#059669', fontWeight: 700 }}>{formatMoney(inv.net_profit)}</span>,
            },
            {
              key: 'payments',
              label: 'Split Payment Breakdown',
              sortable: false,
              searchValue: (inv) => (inv.payments || []).map((p) => `${p.payment_method} ${p.amount} ${p.reference_no || ''}`).join(' '),
              render: (inv) => (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(inv.payments || []).map((p, i) => (
                    <span key={i} className={`badge ${p.payment_method === 'qr_pay' ? 'badge-purple' : p.payment_method === 'card' ? 'badge-blue' : p.payment_method === 'cash' ? 'badge-emerald' : 'badge-amber'}`}>
                      {p.payment_method.toUpperCase()}: {Number(p.amount).toFixed(3)}
                      {p.reference_no ? ` (${p.reference_no})` : ''}
                    </span>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* Van -> Shop -> Invoice -> Items & Transactions Drill-Down Modal */}
      {(drillVan || drillLoading) && (
        <div className="modal-overlay" onClick={() => { setDrillVan(null); setDrillShop(null); setDrillInvoice(null); }}>
          <div className="modal-card" style={{ maxWidth: 960, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => { setDrillShop(null); setDrillInvoice(null); }}
                    style={{ fontWeight: !drillShop ? 800 : 600 }}
                  >
                    <Truck size={13} /> {drillVan?.van?.van_name || 'Van'} ({drillVan?.from_date} &rarr; {drillVan?.to_date})
                  </button>
                  {drillShop && (
                    <>
                      <ChevronRight size={14} style={{ color: '#94a3b8' }} />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setDrillInvoice(null)}
                        style={{ fontWeight: !drillInvoice ? 800 : 600 }}
                      >
                        <Store size={13} /> {drillShop.shop_name}
                      </button>
                    </>
                  )}
                  {drillInvoice && (
                    <>
                      <ChevronRight size={14} style={{ color: '#94a3b8' }} />
                      <span className="badge badge-blue mono" style={{ fontSize: 12 }}>
                        <FileText size={12} /> {drillInvoice.invoice_no}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDrillVan(null); setDrillShop(null); setDrillInvoice(null); }}>
                <X size={14} /> Close
              </button>
            </div>

            {drillLoading ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>Loading drill-down details...</div>
            ) : !drillShop ? (
              /* LEVEL 1: SHOP-WISE BREAKDOWN FOR SELECTED VAN */
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
                  Shop-Wise Sales &amp; Collections ({(drillVan?.shops || []).length} Shops)
                </div>
                <DataTable
                  data={drillVan?.shops || []}
                  compact
                  searchPlaceholder="Search shop name, code, route..."
                  exportFilename={`van-${drillVan?.van?.van_code || 'van'}-shops.csv`}
                  columns={[
                    {
                      key: 'shop_name',
                      label: 'Shop',
                      sortValue: (s) => s.shop_name || '',
                      searchValue: (s) => `${s.shop_name} ${s.shop_code} ${s.route_name}`,
                      render: (s) => (
                        <button
                          type="button"
                          onClick={() => setDrillShop(s)}
                          style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: '#1d4ed8' }}
                        >
                          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {s.shop_name} <ChevronRight size={13} />
                          </div>
                          <div style={{ fontSize: 10.5, color: '#64748b' }}>{s.shop_code} &bull; {s.route_name}</div>
                        </button>
                      ),
                    },
                    { key: 'bill_count', label: 'Bills', sortValue: (s) => Number(s.bill_count || 0), render: (s) => <span className="mono">{s.bill_count}</span> },
                    { key: 'sales_total', label: 'Sales', sortValue: (s) => Number(s.sales_total || 0), render: (s) => <span className="mono" style={{ fontWeight: 700 }}>{formatMoney(s.sales_total)}</span> },
                    { key: 'collected_total', label: 'Collected', sortValue: (s) => Number(s.collected_total || 0), render: (s) => <span className="mono" style={{ color: '#059669', fontWeight: 700 }}>{formatMoney(s.collected_total)}</span> },
                    { key: 'cheque_total', label: 'Cheque', sortValue: (s) => Number(s.cheque_total || 0), render: (s) => <span className="mono">{formatMoney(s.cheque_total)}</span> },
                    { key: 'credit_total', label: 'Credit', sortValue: (s) => Number(s.credit_total || 0), render: (s) => <span className="mono">{formatMoney(s.credit_total)}</span> },
                    { key: 'ledger_balance', label: 'Ledger Bal', sortValue: (s) => Number(s.ledger_balance || 0), render: (s) => <span className="mono" style={{ color: Number(s.ledger_balance) > 0 ? '#dc2626' : '#059669', fontWeight: 700 }}>{formatMoney(s.ledger_balance)}</span> },
                    {
                      key: 'action',
                      label: 'Invoices',
                      sortable: false,
                      render: (s) => (
                        <button type="button" className="btn btn-blue btn-sm" onClick={() => setDrillShop(s)}>
                          {(s.invoices || []).length} Bills <ChevronRight size={12} />
                        </button>
                      ),
                    },
                  ]}
                />
              </div>
            ) : !drillInvoice ? (
              /* LEVEL 2: INVOICES FOR SELECTED SHOP */
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>
                    Invoices for {drillShop.shop_name} ({(drillShop.invoices || []).length})
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrillShop(null)}>
                    <ArrowLeft size={13} /> Back to Shops
                  </button>
                </div>
                <DataTable
                  data={drillShop.invoices || []}
                  compact
                  emptyText="No invoices for this shop in the selected date range."
                  searchPlaceholder="Search invoice #, type, payment..."
                  exportFilename={`shop-${drillShop.shop_code}-invoices.csv`}
                  columns={[
                    {
                      key: 'invoice_no',
                      label: 'Invoice #',
                      sortValue: (inv) => inv.invoice_no || '',
                      render: (inv) => (
                        <button
                          type="button"
                          onClick={() => setDrillInvoice(inv)}
                          style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: '#1d4ed8' }}
                        >
                          <span className="mono" style={{ fontWeight: 700 }}>{inv.invoice_no}</span>
                          {Number(inv.is_corrected) === 1 && <span className="badge badge-amber" style={{ marginLeft: 4, fontSize: 9 }}>Corrected</span>}
                        </button>
                      ),
                    },
                    { key: 'invoice_type', label: 'Type', sortValue: (inv) => inv.invoice_type, render: (inv) => <span className={`badge ${inv.invoice_type === 'return' ? 'badge-rose' : 'badge-blue'}`}>{inv.invoice_type}</span> },
                    { key: 'created_at', label: 'Date/Time', sortValue: (inv) => inv.created_at || '', render: (inv) => <span className="mono" style={{ fontSize: 11 }}>{formatDateTime(inv.created_at)}</span> },
                    { key: 'total_amount', label: 'Total', sortValue: (inv) => Number(inv.total_amount || 0), render: (inv) => <span className="mono" style={{ fontWeight: 700 }}>{formatMoney(inv.total_amount)}</span> },
                    { key: 'net_profit', label: 'Profit', sortValue: (inv) => Number(inv.net_profit || 0), render: (inv) => <span className="mono" style={{ color: '#059669', fontWeight: 700 }}>{formatMoney(inv.net_profit)}</span> },
                    {
                      key: 'payments',
                      label: 'Payments',
                      sortable: false,
                      searchValue: (inv) => (inv.payments || []).map((p) => `${p.payment_method} ${p.amount}`).join(' '),
                      render: (inv) => (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(inv.payments || []).map((p, i) => (
                            <span key={i} className="badge badge-slate" style={{ fontSize: 10 }}>
                              {p.payment_method.toUpperCase()}: {Number(p.amount).toFixed(3)}
                            </span>
                          ))}
                        </div>
                      ),
                    },
                    {
                      key: 'action',
                      label: 'Details',
                      sortable: false,
                      render: (inv) => (
                        <button type="button" className="btn btn-blue btn-sm" onClick={() => setDrillInvoice(inv)}>
                          Items &amp; Txns <ChevronRight size={12} />
                        </button>
                      ),
                    },
                  ]}
                />
              </div>
            ) : (
              /* LEVEL 3: INVOICE LINE ITEMS & PAYMENT TRANSACTIONS */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>
                      Invoice {drillInvoice.invoice_no} &mdash; {drillShop.shop_name}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>
                      {drillInvoice.created_at} &bull; VAT Mode: {drillInvoice.vat_mode} &bull; Type: {drillInvoice.invoice_type}
                    </div>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setDrillInvoice(null)}>
                    <ArrowLeft size={13} /> Back to Invoices
                  </button>
                </div>

                <div className="grid-4" style={{ gap: 8 }}>
                  <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>Subtotal</div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 800 }}>{formatMoney(drillInvoice.subtotal)}</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>VAT</div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 800 }}>{formatMoney(drillInvoice.vat_amount)}</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: 10.5, color: '#1e40af', fontWeight: 700 }}>Invoice Total</div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8' }}>{formatMoney(drillInvoice.total_amount)}</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                    <div style={{ fontSize: 10.5, color: '#065f46', fontWeight: 700 }}>Net Profit</div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: '#059669' }}>{formatMoney(drillInvoice.net_profit)}</div>
                  </div>
                </div>

                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Invoice Items ({(drillInvoice.lines || []).length})</div>
                  <DataTable
                    data={drillInvoice.lines || []}
                    compact
                    searchPlaceholder="Search SKU, item, batch..."
                    exportFilename={`invoice-${drillInvoice.invoice_no}-items.csv`}
                    columns={[
                      { key: 'sku', label: 'SKU', sortValue: (l) => l.sku || '', render: (l) => <span className="mono" style={{ fontWeight: 700 }}>{l.sku}</span> },
                      { key: 'item_name', label: 'Item Name', sortValue: (l) => l.item_name || '' },
                      { key: 'batch_no', label: 'Batch', sortValue: (l) => l.batch_no || '', render: (l) => <span className="mono">{l.batch_no || '-'}</span> },
                      { key: 'qty', label: 'Qty', sortValue: (l) => Number(l.qty || 0), render: (l) => <span className="mono">{Number(l.qty)} {l.uom}</span> },
                      { key: 'unit_price', label: 'Unit Price', sortValue: (l) => Number(l.unit_price || 0), render: (l) => <span className="mono">{formatMoney(l.unit_price)}</span> },
                      { key: 'unit_cost', label: 'Unit Cost', sortValue: (l) => Number(l.unit_cost || 0), render: (l) => <span className="mono">{formatMoney(l.unit_cost)}</span> },
                      { key: 'line_total', label: 'Line Total', sortValue: (l) => Number(l.line_total || 0), render: (l) => <span className="mono" style={{ fontWeight: 700 }}>{formatMoney(l.line_total)}</span> },
                    ]}
                  />
                </div>

                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Payment Transactions ({(drillInvoice.payments || []).length})</div>
                  <DataTable
                    data={drillInvoice.payments || []}
                    compact
                    searchPlaceholder="Search method, ref #, cheque #..."
                    exportFilename={`invoice-${drillInvoice.invoice_no}-payments.csv`}
                    columns={[
                      { key: 'payment_method', label: 'Method', sortValue: (p) => p.payment_method, render: (p) => <span className="badge badge-blue">{p.payment_method.toUpperCase()}</span> },
                      { key: 'amount', label: 'Amount', sortValue: (p) => Number(p.amount || 0), render: (p) => <span className="mono" style={{ fontWeight: 800 }}>{formatMoney(p.amount)}</span> },
                      { key: 'reference_no', label: 'Ref #', sortValue: (p) => p.reference_no || '', render: (p) => <span className="mono">{p.reference_no || '-'}</span> },
                      { key: 'cheque_no', label: 'Bank / Cheque #', sortValue: (p) => p.cheque_no || '', render: (p) => <span>{p.bank_name ? `${p.bank_name} ` : ''}{p.cheque_no ? `#${p.cheque_no}` : '-'}</span> },
                      {
                        key: 'cheque_status',
                        label: 'Status',
                        sortValue: (p) => p.cheque_status || '',
                        render: (p) => p.payment_method === 'cheque'
                          ? <span className={`badge ${p.cheque_status === 'cleared' ? 'badge-emerald' : p.cheque_status === 'bounced' ? 'badge-rose' : 'badge-amber'}`}>{p.cheque_status.replace('_', ' ')}</span>
                          : <span className="badge badge-emerald">settled</span>,
                      },
                      { key: 'paid_at', label: 'Paid At', sortValue: (p) => p.paid_at || '', render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.paid_at}</span> },
                    ]}
                  />
                </div>

                {(drillInvoice.attachments || []).length > 0 && (
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Attachments ({drillInvoice.attachments.length})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {drillInvoice.attachments.map(a => (
                        <a key={a.id} href={a.file_path} target="_blank" rel="noreferrer" className="badge badge-purple" style={{ textDecoration: 'none', padding: '6px 10px' }}>
                          {a.attachment_type.replace('_', ' ')}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!alertMessage}
        title="Notice"
        message={alertMessage}
        variant="warning"
        alertOnly
        onCancel={() => setAlertMessage('')}
      />
    </div>
  );
}

