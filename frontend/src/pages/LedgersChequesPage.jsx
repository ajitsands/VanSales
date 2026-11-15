import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePersistedState } from '../hooks/usePersistedState';
import { shareViaWhatsApp } from '../utils/shareWhatsApp';
import DataTable from '../components/DataTable';
import SearchableSelect from '../components/SearchableSelect';
import { BookOpen, CheckCircle2, XCircle, Landmark, FileCheck2, DollarSign, Archive, Eye, Printer, Share2 } from 'lucide-react';

export default function LedgersChequesPage() {
  const { formatMoney } = useAuth();
  const [tab, setTab] = usePersistedState('ledger_tab', 'cheques');
  const [cheques, setCheques] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [archives, setArchives] = useState([]);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [vans, setVans] = useState([]);
  const [vanFilter, setVanFilter] = usePersistedState('ledger_van_filter', '');
  const [statement, setStatement] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [collectForm, setCollectForm] = useState({ payment_method: 'cash', amount: '', reference_no: '', bank_name: '', cheque_no: '', cheque_date: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [c, l, v, a] = await Promise.all([
        api.get('/api/cheques'),
        api.get('/api/shop-ledgers' + (vanFilter ? `?van_id=${vanFilter}` : '')),
        api.get('/api/vans'),
        api.get('/api/invoice-archives'),
      ]);
      setCheques(c);
      setLedgers(l);
      setVans(v);
      setArchives(a);
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { load(); }, [vanFilter]);

  const openStatement = async (shopId, fDate = fromDate, tDate = toDate) => {
    setErr(''); setMsg('');
    try {
      const qs = new URLSearchParams();
      if (fDate) qs.set('from_date', fDate);
      if (tDate) qs.set('to_date', tDate);
      const qStr = qs.toString() ? `?${qs.toString()}` : '';
      const st = await api.get(`/api/shop-ledgers/${shopId}${qStr}`);
      setStatement(st);
    } catch (e) { setErr(e.message); }
  };

  const handlePrintPublicLedger = async () => {
    if (!statement) return;
    try {
      const res = await api.post('/api/share-links', {
        share_type: 'ledger',
        shop_id: statement.shop.id,
        from_date: fromDate || null,
        to_date: toDate || null,
      });
      window.open(`${window.location.origin}${res.share_path}`, '_blank', 'noopener,noreferrer');
    } catch (e) { setErr(e.message); }
  };

  const handleWhatsAppLedger = async () => {
    if (!statement) return;
    try {
      const latestInv = (statement.invoices || [])[0];
      const url = await shareViaWhatsApp({
        share_type: 'ledger',
        shop_id: statement.shop.id,
        bill_invoice_id: latestInv?.id || null,
        bill_label: latestInv ? `Purchase Bill (${latestInv.invoice_no})` : 'Purchase Bill',
        from_date: fromDate || null,
        to_date: toDate || null,
        phone: statement.shop.phone,
        label: `Ledger Statement for ${statement.shop.shop_name}`,
      });
      setMsg(`WhatsApp share link ready & copied: ${url}`);
    } catch (e) { setErr(e.message); }
  };

  const handleReconcile = async (id, action) => {
    setErr(''); setMsg('');
    try {
      const res = await api.post(`/api/cheques/${id}/reconcile`, { action });
      setMsg(res?.message || `Cheque #${id} marked as ${action}!`);
      load();
      if (statement) openStatement(statement.shop.id);
    } catch (e) { setErr(e.message); }
  };

  const handleCollect = async (e) => {
    e.preventDefault();
    if (!statement) return;
    setErr(''); setMsg('');
    try {
      await api.post(`/api/shop-ledgers/${statement.shop.id}/collect`, collectForm);
      setMsg(collectForm.payment_method === 'cheque'
        ? 'Cheque recorded as Pending Clearance. Ledger will update upon Cheque Reconciliation.'
        : 'Collection posted and credited to Shop Ledger!');
      setCollectForm({ payment_method: 'cash', amount: '', reference_no: '', bank_name: '', cheque_no: '', cheque_date: '' });
      load();
      openStatement(statement.shop.id);
    } catch (e2) { setErr(e2.message); }
  };

  const pendingCount = cheques.filter(c => c.cheque_status === 'pending_clearance').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>Van Shop Ledgers &amp; Cheque Reconciliation</h2>
          <p style={{ fontSize: 12.5, color: '#64748b' }}>Track every Van's Shop Customer Ledger. Cheques only credit the Shop Ledger once confirmed &amp; cleared here.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn btn-sm ${tab === 'cheques' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('cheques')}>
            <FileCheck2 size={14} /> Cheque Reconciliation ({pendingCount} Pending)
          </button>
          <button className={`btn btn-sm ${tab === 'ledgers' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('ledgers')}>
            <BookOpen size={14} /> Van Shop Ledgers ({ledgers.length})
          </button>
          <button className={`btn btn-sm ${tab === 'archives' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('archives')}>
            <Archive size={14} /> Corrected Bills &amp; Archive ({archives.length})
          </button>
        </div>
      </div>

      {msg && <div className="badge badge-emerald" style={{ padding: '9px 14px', borderRadius: 8 }}>{msg}</div>}
      {err && <div className="badge badge-rose" style={{ padding: '9px 14px', borderRadius: 8 }}>{err}</div>}

      {tab === 'cheques' && (
        <div className="card">
          <div className="card-title">
            <span><Landmark size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Cheque Clearance &amp; Reconciliation Queue</span>
            <span className="badge badge-amber">{pendingCount} Pending Clearance</span>
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '9px 12px', borderRadius: 8, fontSize: 12, color: '#1e3a8a', marginBottom: 12 }}>
            <strong>Reconciliation Rule:</strong> Collected cheques remain <em>Pending Clearance</em> and do <strong>not</strong> reduce the Shop's Ledger Balance until you click <strong>Confirm &amp; Clear</strong>.
          </div>
          <DataTable
            data={cheques}
            searchPlaceholder="Search cheque #, bank, shop, van, invoice #..."
            exportFilename="cheques-reconciliation.csv"
            columns={[
              {
                key: 'cheque_no',
                label: 'Cheque # & Bank',
                sortValue: (c) => c.cheque_no || c.reference_no || c.id,
                searchValue: (c) => `${c.cheque_no || c.reference_no || c.id} ${c.bank_name || ''}`,
                render: (c) => (
                  <>
                    <div className="mono" style={{ fontWeight: 700 }}>#{c.cheque_no || c.reference_no || c.id}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.bank_name || 'Bank Not Specified'}</div>
                  </>
                ),
              },
              {
                key: 'cheque_date',
                label: 'Cheque Date',
                sortValue: (c) => c.cheque_date || '',
                render: (c) => <span className="mono">{c.cheque_date || '-'}</span>,
              },
              {
                key: 'shop_name',
                label: 'Van & Shop',
                sortValue: (c) => c.shop_name || 'Walk-in',
                searchValue: (c) => `${c.shop_name || 'Walk-in'} ${c.van_name || 'Main Store'}`,
                render: (c) => (
                  <>
                    <div style={{ fontWeight: 700 }}>{c.shop_name || 'Walk-in'}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.van_name || 'Main Store'}</div>
                  </>
                ),
              },
              {
                key: 'invoice_no',
                label: 'Invoice #',
                sortValue: (c) => c.invoice_no || 'On-Account',
                render: (c) => <span className="mono">{c.invoice_no || 'On-Account'}</span>,
              },
              {
                key: 'amount',
                label: 'Amount',
                sortValue: (c) => Number(c.amount || 0),
                render: (c) => <span className="mono" style={{ fontWeight: 800 }}>{formatMoney(c.amount)}</span>,
              },
              {
                key: 'attachments',
                label: 'Attachments',
                sortable: false,
                searchValue: (c) => (c.attachments || []).map((a) => a.attachment_type).join(' '),
                render: (c) => (c.attachments || []).length > 0 ? (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {c.attachments.map(a => (
                      <a key={a.id} href={a.file_path} target="_blank" rel="noreferrer" className="badge badge-blue" style={{ textDecoration: 'none' }}>
                        {a.attachment_type.replace('_', ' ')}
                      </a>
                    ))}
                  </div>
                ) : <span style={{ color: '#94a3b8', fontSize: 11 }}>None</span>,
              },
              {
                key: 'cheque_status',
                label: 'Status',
                sortValue: (c) => c.cheque_status || '',
                searchValue: (c) => (c.cheque_status || '').replace('_', ' '),
                render: (c) => (
                  <span className={`badge ${c.cheque_status === 'cleared' ? 'badge-emerald' : c.cheque_status === 'bounced' ? 'badge-rose' : 'badge-amber'}`}>
                    {c.cheque_status.replace('_', ' ')}
                  </span>
                ),
              },
              {
                key: 'action',
                label: 'Action',
                sortable: false,
                render: (c) => c.cheque_status === 'pending_clearance' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-emerald btn-sm" onClick={() => handleReconcile(c.id, 'cleared')}>
                      <CheckCircle2 size={13} /> Confirm &amp; Clear
                    </button>
                    <button className="btn btn-rose btn-sm" onClick={() => handleReconcile(c.id, 'bounced')}>
                      <XCircle size={13} /> Bounced
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: '#64748b' }}>{c.cleared_at || '-'}</span>
                ),
              },
            ]}
          />
        </div>
      )}

      {tab === 'ledgers' && (
        <div className="card">
          <div className="card-title">
            <span>Van-Wise Shop / Customer Ledgers</span>
            <SearchableSelect
              compact
              style={{ width: 220 }}
              value={vanFilter}
              onChange={val => setVanFilter(val)}
              placeholder="All Vans"
              searchPlaceholder="Search van..."
              options={[{ value: '', label: 'All Vans' }, ...vans.map(v => ({ value: v.id, label: v.van_name }))]}
            />
          </div>
          <DataTable
            data={ledgers}
            searchPlaceholder="Search shop, code, van, route..."
            exportFilename="shop-ledgers.csv"
            columns={[
              {
                key: 'shop_name',
                label: 'Shop',
                sortValue: (l) => l.shop_name || '',
                searchValue: (l) => `${l.shop_name || ''} ${l.shop_code || ''} ${l.phone || ''}`,
                render: (l) => (
                  <>
                    <div style={{ fontWeight: 700 }}>{l.shop_name}</div>
                    <div className="mono" style={{ fontSize: 11, color: '#64748b' }}>{l.shop_code} &bull; {l.phone}</div>
                  </>
                ),
              },
              {
                key: 'van_name',
                label: 'Assigned Van & Route',
                sortValue: (l) => l.van_name || '',
                searchValue: (l) => `${l.van_name || ''} ${l.route_name || ''}`,
                render: (l) => (
                  <>
                    <span className="badge badge-amber">{l.van_name}</span>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{l.route_name}</div>
                  </>
                ),
              },
              {
                key: 'total_debit',
                label: 'Total Debit (Billed)',
                sortValue: (l) => Number(l.total_debit || 0),
                render: (l) => <span className="mono">{formatMoney(l.total_debit)}</span>,
              },
              {
                key: 'total_credit',
                label: 'Cleared Credit (Paid)',
                sortValue: (l) => Number(l.total_credit || 0),
                render: (l) => <span className="mono" style={{ color: '#059669' }}>{formatMoney(l.total_credit)}</span>,
              },
              {
                key: 'pending_cheques',
                label: 'Pending Cheques',
                sortValue: (l) => Number(l.pending_cheques || 0),
                render: (l) => <span className="mono" style={{ color: '#d97706', fontWeight: 700 }}>{formatMoney(l.pending_cheques)}</span>,
              },
              {
                key: 'balance',
                label: 'Net Balance Owed',
                sortValue: (l) => Number(l.balance || 0),
                render: (l) => <span className="mono" style={{ fontWeight: 800, color: Number(l.balance) > 0 ? '#dc2626' : '#059669' }}>{formatMoney(l.balance)}</span>,
              },
              {
                key: 'statement',
                label: 'Statement',
                sortable: false,
                render: (l) => (
                  <button className="btn btn-blue btn-sm" onClick={() => openStatement(l.shop_id)}>
                    <BookOpen size={13} /> Ledger / Collect
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* Statement of Account & On-Account Collection Modal */}
      {statement && (
        <div className="modal-overlay" onClick={() => setStatement(null)}>
          <div className="modal-card" style={{ maxWidth: 1120, width: '96%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>{statement.shop.shop_name} — Customer Ledger</h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>{statement.shop.van_name} &bull; {statement.shop.route_name}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Opening: <span className="mono">{formatMoney(statement.opening_balance)}</span></div>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: statement.balance > 0 ? '#dc2626' : '#059669' }}>
                    Closing: {formatMoney(statement.balance)}
                  </div>
                </div>
              </div>
            </div>

            {/* Date Between Filter + Print + WhatsApp Share */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12, padding: 10, background: '#f1f5f9', borderRadius: 8 }}>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', display: 'block' }}>From Date</label>
                <input type="date" className="form-control" style={{ padding: '4px 8px', fontSize: 12 }} value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', display: 'block' }}>To Date</label>
                <input type="date" className="form-control" style={{ padding: '4px 8px', fontSize: 12 }} value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openStatement(statement.shop.id, fromDate, toDate)}>Filter</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate(''); openStatement(statement.shop.id, '', ''); }}>All</button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={handlePrintPublicLedger}><Printer size={13} /> Print Statement</button>
                <button type="button" className="btn btn-emerald btn-sm" onClick={handleWhatsAppLedger}><Share2 size={13} /> WhatsApp</button>
              </div>
            </div>

            <form onSubmit={handleCollect} style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}><DollarSign size={14} style={{ verticalAlign: 'middle' }} /> Collect On-Account Payment</div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label">Method</label>
                  <SearchableSelect
                    value={collectForm.payment_method}
                    onChange={val => setCollectForm({ ...collectForm, payment_method: val })}
                    searchPlaceholder="Search method..."
                    options={[
                      { value: 'cash', label: 'Cash' },
                      { value: 'card', label: 'Card' },
                      { value: 'qr_pay', label: 'QR Pay (BenefitPay)' },
                      { value: 'bank_transfer', label: 'Bank Transfer' },
                      { value: 'cheque', label: 'Cheque (Pending Clearance)' },
                    ]}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input className="form-control mono" type="number" step="0.001" required value={collectForm.amount} onChange={e => setCollectForm({ ...collectForm, amount: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Reference / Bank</label>
                  <input className="form-control" value={collectForm.reference_no} onChange={e => setCollectForm({ ...collectForm, reference_no: e.target.value })} placeholder="Ref / Slip #" />
                </div>
              </div>
              {collectForm.payment_method === 'cheque' && (
                <div className="grid-3">
                  <div className="form-group"><label className="form-label">Bank Name</label><input className="form-control" required value={collectForm.bank_name} onChange={e => setCollectForm({ ...collectForm, bank_name: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Cheque #</label><input className="form-control mono" required value={collectForm.cheque_no} onChange={e => setCollectForm({ ...collectForm, cheque_no: e.target.value })} /></div>
                  <div className="form-group"><label className="form-label">Cheque Date</label><input className="form-control" type="date" required value={collectForm.cheque_date} onChange={e => setCollectForm({ ...collectForm, cheque_date: e.target.value })} /></div>
                </div>
              )}
              <button type="submit" className="btn btn-emerald btn-sm">Post Collection</button>
            </form>

            <DataTable
              data={statement.entries || []}
              compact
              searchPlaceholder="Search date, type, ref #, notes..."
              exportFilename={`ledger-statement-${statement.shop?.shop_code || 'shop'}.csv`}
              columns={[
                {
                  key: 'created_at',
                  label: 'Date',
                  sortValue: (e) => e.created_at || '',
                  render: (e) => <span className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{e.created_at}</span>,
                },
                {
                  key: 'entry_type',
                  label: 'Type',
                  sortValue: (e) => e.entry_type || '',
                  render: (e) => (
                    <span className={`badge ${e.entry_type === 'cheque_cleared' ? 'badge-purple' : e.debit > 0 ? 'badge-amber' : 'badge-emerald'}`}>{e.entry_type}</span>
                  ),
                },
                {
                  key: 'ref_no',
                  label: 'Ref #',
                  sortValue: (e) => e.ref_no || '',
                  render: (e) => <span className="mono" style={{ whiteSpace: 'nowrap' }}>{e.ref_no}</span>,
                },
                {
                  key: 'notes',
                  label: 'Notes',
                  sortValue: (e) => e.notes || '',
                  render: (e) => <span style={{ fontSize: 11 }}>{e.notes}</span>,
                },
                {
                  key: 'debit',
                  label: 'Debit',
                  align: 'right',
                  sortValue: (e) => Number(e.debit || 0),
                  render: (e) => <span className="mono" style={{ whiteSpace: 'nowrap' }}>{Number(e.debit) > 0 ? formatMoney(e.debit) : '-'}</span>,
                },
                {
                  key: 'credit',
                  label: 'Credit',
                  align: 'right',
                  sortValue: (e) => Number(e.credit || 0),
                  render: (e) => <span className="mono" style={{ color: '#059669', whiteSpace: 'nowrap' }}>{Number(e.credit) > 0 ? formatMoney(e.credit) : '-'}</span>,
                },
                {
                  key: 'running_balance',
                  label: 'Balance',
                  align: 'right',
                  sortValue: (e) => Number(e.running_balance || 0),
                  render: (e) => <span className="mono" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatMoney(e.running_balance)}</span>,
                },
              ]}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setStatement(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'archives' && (
        <div className="card">
          <div className="card-title">
            <span><Archive size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Corrected Bills &amp; Archived Versions</span>
            <span className="badge badge-amber">{archives.length} Archived Version(s)</span>
          </div>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '9px 12px', borderRadius: 8, fontSize: 12, color: '#92400e', marginBottom: 12 }}>
            <strong>Audit Trail:</strong> Whenever a Van Driver corrects a bill, the old bill is archived here against the original bill number and a new suffixed bill number (e.g. <code>-C1</code>) is issued.
          </div>
          <DataTable
            data={archives}
            searchPlaceholder="Search bill #, shop, van, reason..."
            emptyText="No bill corrections recorded yet."
            exportFilename="bill-archives.csv"
            columns={[
              {
                key: 'original_invoice_no',
                label: 'Original Bill #',
                sortValue: (a) => a.original_invoice_no || '',
                render: (a) => <span className="mono" style={{ fontWeight: 700 }}>{a.original_invoice_no}</span>,
              },
              {
                key: 'archived_invoice_no',
                label: 'Archived Version',
                sortValue: (a) => a.archived_invoice_no || '',
                render: (a) => <span className="mono" style={{ color: '#64748b' }}>{a.archived_invoice_no}</span>,
              },
              {
                key: 'current_invoice_no',
                label: 'Updated Active Bill #',
                sortValue: (a) => a.current_invoice_no || a.new_invoice_no || '',
                render: (a) => <span className="badge badge-amber mono">{a.current_invoice_no || a.new_invoice_no}</span>,
              },
              {
                key: 'shop_name',
                label: 'Shop & Van',
                sortValue: (a) => a.shop_name || a.customer_name || '',
                searchValue: (a) => `${a.shop_name || a.customer_name || ''} ${a.van_name || 'Main Store'}`,
                render: (a) => (
                  <>
                    <div style={{ fontWeight: 700 }}>{a.shop_name || a.customer_name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{a.van_name || 'Main Store'}</div>
                  </>
                ),
              },
              {
                key: 'total_amount',
                label: 'Old Total',
                sortValue: (a) => Number(a.total_amount || 0),
                render: (a) => <span className="mono" style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{formatMoney(a.total_amount)}</span>,
              },
              {
                key: 'current_total_amount',
                label: 'Current Total',
                sortValue: (a) => Number(a.current_total_amount || 0),
                render: (a) => <span className="mono" style={{ fontWeight: 800, color: '#2563eb' }}>{formatMoney(a.current_total_amount)}</span>,
              },
              {
                key: 'corrected_by_name',
                label: 'Corrected By & Reason',
                sortValue: (a) => a.corrected_by_name || '',
                searchValue: (a) => `${a.corrected_by_name || ''} ${a.correction_reason || ''} ${a.archived_at || ''}`,
                render: (a) => (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{a.corrected_by_name || 'User'}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{a.correction_reason} &bull; {a.archived_at}</div>
                  </>
                ),
              },
              {
                key: 'inspect',
                label: 'Inspect',
                sortable: false,
                render: (a) => (
                  <button className="btn btn-outline btn-sm" onClick={() => setSelectedArchive(a)}>
                    <Eye size={13} /> Old Bill
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {selectedArchive && (
        <div className="modal-overlay" onClick={() => setSelectedArchive(null)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>Archived Bill: {selectedArchive.archived_invoice_no}</h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Original: {selectedArchive.original_invoice_no} &rarr; Updated Active: <strong>{selectedArchive.current_invoice_no || selectedArchive.new_invoice_no}</strong>
                </div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedArchive(null)}>Close</button>
            </div>
            <div style={{ fontSize: 12, marginBottom: 10, padding: 8, background: '#f8fafc', borderRadius: 6 }}>
              <strong>Correction Reason:</strong> {selectedArchive.correction_reason} &bull; <strong>Corrected By:</strong> {selectedArchive.corrected_by_name} ({selectedArchive.archived_at})
            </div>
            <DataTable
              data={selectedArchive.lines || []}
              compact
              searchPlaceholder="Search item..."
              exportFilename={`archived-bill-${selectedArchive.archived_invoice_no}.csv`}
              columns={[
                { key: 'item_name', label: 'Item', sortValue: (l) => l.item_name || '' },
                { key: 'qty', label: 'Qty', sortValue: (l) => Number(l.qty || 0), render: (l) => <span className="mono">{Number(l.qty)}</span> },
                { key: 'unit_price', label: 'Price', sortValue: (l) => Number(l.unit_price || 0), render: (l) => <span className="mono">{formatMoney(l.unit_price)}</span> },
                { key: 'line_total', label: 'Line Total', sortValue: (l) => Number(l.line_total || 0), render: (l) => <span className="mono">{formatMoney(l.line_total)}</span> },
              ]}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontWeight: 800 }}>
              <span>Archived Old Total ({selectedArchive.vat_mode}):</span>
              <span className="mono">{formatMoney(selectedArchive.total_amount)}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {(selectedArchive.payments || []).map((p, i) => (
                <span key={i} className="badge badge-slate">
                  {p.payment_method.replace('_', ' ').toUpperCase()}: {formatMoney(p.amount)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

