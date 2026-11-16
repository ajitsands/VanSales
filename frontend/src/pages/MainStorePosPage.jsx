import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AttachmentUploader from '../components/AttachmentUploader';
import DataTable from '../components/DataTable';
import SearchableSelect from '../components/SearchableSelect';
import { GULF_INDIA_COUNTRY_CODES, getDefaultCountryCode, buildFullMobile, toWhatsAppDigits } from '../utils/phoneCodes';
import { shareViaWhatsApp } from '../utils/shareWhatsApp';
import { getVendorShifts, getCurrentShift, toLocalDateStr, addDaysStr, matchesDateAndShift } from '../utils/shiftTimings';
import { calculateFifoLineBreakdown } from '../utils/batchPricing';
import { ShoppingCart, Printer, Plus, Minus, Trash2, Search, CreditCard, Banknote, QrCode, X, BookOpen, Phone, UserCheck, Calendar, Share2, Clock, GitMerge } from 'lucide-react';

export default function MainStorePosPage() {
  const { vendor, formatMoney, formatDateTime } = useAuth();
  const [items, setItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [cart, setCart] = useState([]);
  const [posSearch, setPosSearch] = useState('');
  const [posCategory, setPosCategory] = useState('All');
  const [customerName, setCustomerName] = useState('Counter Customer');
  const [countryCode, setCountryCode] = useState(() => getDefaultCountryCode(vendor));
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerLedger, setCustomerLedger] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [ledgerModal, setLedgerModal] = useState(null);
  const [customerLedgers, setCustomerLedgers] = useState([]);
  const [ledgerFilter, setLedgerFilter] = useState('all');
  const [ledgerFromDate, setLedgerFromDate] = useState('');
  const [ledgerToDate, setLedgerToDate] = useState('');
  const [modalFromDate, setModalFromDate] = useState('');
  const [modalToDate, setModalToDate] = useState('');
  const [collectForm, setCollectForm] = useState({ amount: '', payment_method: 'cash', entry_type: 'payment', notes: '' });
  const [vatMode, setVatMode] = useState('inclusive');
  const [payCash, setPayCash] = useState('');
  const [payCard, setPayCard] = useState('');
  const [payQr, setPayQr] = useState('');
  const [payBank, setPayBank] = useState('');
  const [payCheque, setPayCheque] = useState('');
  const [payCredit, setPayCredit] = useState('');
  const [saveExcessAsAdvance, setSaveExcessAsAdvance] = useState(false);
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [printInv, setPrintInv] = useState(null);
  const [invDatePreset, setInvDatePreset] = useState('today');
  const [invFromDate, setInvFromDate] = useState(() => toLocalDateStr(new Date()));
  const [invToDate, setInvToDate] = useState(() => toLocalDateStr(new Date()));
  const [storePettyOpen, setStorePettyOpen] = useState(false);
  const [storePettyData, setStorePettyData] = useState({ entries: [], summary: { total_income: 0, total_expense: 0, net_petty: 0 } });
  const [storePettyForm, setStorePettyForm] = useState({ entry_type: 'expense', category: 'Office / Store Expense', amount: '', notes: '' });
  const [savingStorePetty, setSavingStorePetty] = useState(false);

  const loadStorePettyCash = async () => {
    try {
      const res = await api.get('/api/petty-cash?source_type=main_store');
      setStorePettyData(res);
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const submitStorePettyCash = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!Number(storePettyForm.amount) || Number(storePettyForm.amount) <= 0) {
      setErr('Enter a valid petty cash amount.');
      return;
    }
    setSavingStorePetty(true);
    try {
      await api.post('/api/petty-cash', {
        source_type: 'main_store',
        entry_type: storePettyForm.entry_type,
        category: storePettyForm.category,
        amount: Number(storePettyForm.amount),
        notes: storePettyForm.notes,
      });
      setMsg(`Store ${storePettyForm.entry_type === 'income' ? 'Other Income' : 'Expense'} recorded!`);
      setStorePettyForm({ ...storePettyForm, amount: '', notes: '' });
      loadStorePettyCash();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSavingStorePetty(false);
    }
  };
  const [invShiftPreset, setInvShiftPreset] = useState('all');
  const [invFromTime, setInvFromTime] = useState('00:00');
  const [invToTime, setInvToTime] = useState('23:59');
  const [mergeModal, setMergeModal] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeSourceIds, setMergeSourceIds] = useState([]);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeName, setMergeName] = useState('');
  const [mergeMobile, setMergeMobile] = useState('');
  const [merging, setMerging] = useState(false);

  const load = async () => {
    try {
      const [it, inv, cl] = await Promise.all([
        api.get('/api/items'),
        api.get('/api/invoices'),
        api.get('/api/customer-ledgers').catch(() => []),
      ]);
      setItems(it.filter(x => Number(x.main_store_qty) > 0));
      setInvoices(inv.filter(x => x.source_type === 'main_store'));
      setCustomerLedgers(Array.isArray(cl) ? cl : []);
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setCountryCode(getDefaultCountryCode(vendor));
  }, [vendor?.currency_code, vendor?.timezone]);

  const lookupMobile = async (mobileVal, codeVal = countryCode) => {
    const raw = String(mobileVal || '').trim();
    if (raw.length < 4) {
      setCustomerLedger(null);
      return;
    }
    const full = buildFullMobile(codeVal, raw);
    setLookupLoading(true);
    try {
      const res = await api.get(`/api/customer-ledgers/lookup?mobile=${encodeURIComponent(full)}`);
      setCustomerLedger(res);
      if (res?.found && res.customer?.customer_name && (!customerName.trim() || customerName === 'Counter Customer')) {
        setCustomerName(res.customer.customer_name);
      }
    } catch {
      // ignore lookup errors
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => lookupMobile(customerMobile, countryCode), 300);
    return () => clearTimeout(t);
  }, [customerMobile, countryCode]);

  const openOrCreateLedgerModal = async () => {
    setErr('');
    const fullMobile = buildFullMobile(countryCode, customerMobile);
    if (!fullMobile) {
      setErr('Enter Customer Mobile Number first to open or view their Ledger.');
      return;
    }
    try {
      let cid = customerLedger?.customer?.id;
      if (!cid) {
        const created = await api.post('/api/customer-ledgers', {
          mobile_no: fullMobile,
          customer_name: customerName.trim() || 'Counter Customer',
        });
        setCustomerLedger(created);
        cid = created?.customer?.id;
      }
      if (cid) {
        const st = await api.get(`/api/customer-ledgers/${cid}`);
        setLedgerModal(st);
      }
    } catch (e) {
      setErr(e.message);
    }
  };

  const submitLedgerCollection = async (e) => {
    e.preventDefault();
    if (!ledgerModal?.customer?.id) return;
    setErr(''); setMsg('');
    try {
      await api.post(`/api/customer-ledgers/${ledgerModal.customer.id}/collect`, collectForm);
      setMsg(`${collectForm.entry_type === 'advance' ? 'Customer Advance' : 'Credit Collection'} recorded!`);
      setCollectForm({ amount: '', payment_method: 'cash', entry_type: 'payment', notes: '' });
      const st = await api.get(`/api/customer-ledgers/${ledgerModal.customer.id}`);
      setLedgerModal(st);
      lookupMobile(customerMobile);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const addToCart = (it) => {
    const existing = cart.find(c => c.item_id === it.id);
    if (existing) {
      setCart(cart.map(c => c.item_id === it.id ? { ...c, qty: c.qty + 1, batches: it.main_store_batches || c.batches } : c));
    } else {
      setCart([...cart, { item_id: it.id, name: it.name, sku: it.sku, unit_price: Number(it.selling_price), batches: it.main_store_batches || [], qty: 1 }]);
    }
  };

  const vatRate = Number(vendor?.vat_percent || 10) / 100;
  const grossSum = cart.reduce((s, c) => s + calculateFifoLineBreakdown(c.qty, c.batches, c.unit_price).totalGross, 0);
  const netSum = vatMode === 'inclusive' ? grossSum / (1 + vatRate) : grossSum;
  const vatSum = vatMode === 'inclusive' ? grossSum - netSum : grossSum * vatRate;
  const grandTotal = vatMode === 'inclusive' ? grossSum : grossSum + vatSum;

  const totalPaidInput = Number(payCash || 0) + Number(payCard || 0) + Number(payQr || 0) + Number(payBank || 0) + Number(payCheque || 0) + Number(payCredit || 0);
  const balanceDue = Math.max(0, grandTotal - totalPaidInput);
  const overpaidAmount = Math.max(0, totalPaidInput - grandTotal);
  const isOverpaid = totalPaidInput > grandTotal + 0.0005;
  const isUnderpaid = totalPaidInput > 0 && balanceDue > 0.0005;

  const submitSale = async () => {
    setErr(''); setMsg('');
    if (cart.length === 0) return;
    if (Number(payCredit) > 0 && !customerMobile.trim()) {
      setErr('Please enter Customer Mobile Number to record Credit / Half Payment in their Ledger.');
      return;
    }
    if (isOverpaid && !(saveExcessAsAdvance && customerMobile.trim())) {
      setErr(`Entered split (${formatMoney(totalPaidInput)}) exceeds Grand Total (${formatMoney(grandTotal)}) by ${formatMoney(overpaidAmount)}. Enable "Save Excess as Advance" (with Mobile #) or adjust payment amounts.`);
      return;
    }
    if (isUnderpaid) {
      setErr(`Entered split (${formatMoney(totalPaidInput)}) is less than Grand Total (${formatMoney(grandTotal)}). Remaining due: ${formatMoney(balanceDue)} (use "+ Credit" for Half Payment).`);
      return;
    }

    const payments = [];
    if (Number(payCash) > 0) payments.push({ payment_method: 'cash', amount: Number(payCash) });
    if (Number(payCard) > 0) payments.push({ payment_method: 'card', amount: Number(payCard), reference_no: 'MS-POS' });
    if (Number(payQr) > 0) payments.push({ payment_method: 'qr_pay', amount: Number(payQr), reference_no: 'MS-QR' });
    if (Number(payBank) > 0) payments.push({ payment_method: 'bank_transfer', amount: Number(payBank), bank_name: bankName || 'Bank Transfer', reference_no: 'MS-TRF' });
    if (Number(payCheque) > 0) payments.push({ payment_method: 'cheque', amount: Number(payCheque), cheque_no: chequeNo, bank_name: bankName, cheque_date: chequeDate || null });
    if (Number(payCredit) > 0) payments.push({ payment_method: 'credit', amount: Number(payCredit), reference_no: 'MS-CREDIT' });
    if (payments.length === 0) {
      payments.push({ payment_method: 'cash', amount: Number(grandTotal.toFixed(3)) });
    }
    try {
      const res = await api.post('/api/invoices', {
        source_type: 'main_store',
        customer_name: customerName,
        customer_mobile: buildFullMobile(countryCode, customerMobile) || undefined,
        vat_mode: vatMode,
        lines: cart.map(c => ({ item_id: c.item_id, qty: c.qty, unit_price: c.unit_price })),
        payments,
        attachments,
      });
      setMsg(`Main Store Invoice ${res.invoice_no} generated! Net Profit: ${formatMoney(res.net_profit)}`);
      setCart([]); setPayCash(''); setPayCard(''); setPayQr(''); setPayBank(''); setPayCheque(''); setPayCredit(''); setSaveExcessAsAdvance(false); setChequeNo(''); setBankName(''); setChequeDate(''); setAttachments([]);
      load();
      if (customerMobile.trim()) {
        lookupMobile(customerMobile);
      }
    } catch (e) { setErr(e.message); }
  };

  const categories = ['All', ...Array.from(new Set(items.map(it => it.category).filter(Boolean))).sort()];
  const filteredPosItems = items.filter((it) => {
    const matchCat = posCategory === 'All' || it.category === posCategory;
    if (!matchCat) return false;
    const q = posSearch.trim().toLowerCase();
    if (!q) return true;
    return `${it.sku} ${it.name} ${it.category || ''}`.toLowerCase().includes(q);
  });

  const setQuickPay = (method) => {
    const amt = grandTotal > 0 ? grandTotal.toFixed(3) : '';
    setPayCash(method === 'cash' ? amt : '');
    setPayCard(method === 'card' ? amt : '');
    setPayQr(method === 'qr' ? amt : '');
    setPayCredit(method === 'credit' ? amt : '');
    setPayBank('');
    setPayCheque('');
    if (method === 'clear') setSaveExcessAsAdvance(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>Main Store POS (FIFO/FEFO + Split Pay)</h2>
          <p style={{ fontSize: 12.5, color: '#64748b' }}>Point-of-Sale counter billing from Main Store inventory with Inclusive/Exclusive VAT.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-blue mono">{items.length} In-Stock SKUs</span>
          <span className="badge badge-emerald mono">{cart.reduce((s, c) => s + Number(c.qty || 0), 0)} Items in Cart</span>
        </div>
      </div>

      {msg && <div className="badge badge-emerald" style={{ padding: '9px 14px', borderRadius: 8 }}>{msg}</div>}
      {err && <div className="badge badge-rose" style={{ padding: '9px 14px', borderRadius: 8 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* LEFT: POS PRODUCT TILE GRID */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                className="form-control"
                style={{ paddingLeft: 32, paddingRight: posSearch ? 30 : 10 }}
                placeholder="Scan SKU or search product name..."
                value={posSearch}
                onChange={(e) => setPosSearch(e.target.value)}
              />
              {posSearch && (
                <button
                  type="button"
                  onClick={() => setPosSearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              Showing {filteredPosItems.length} items
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setStorePettyOpen(true);
                loadStorePettyCash();
              }}
            >
              <Banknote size={14} color="#059669" /> Store Petty Cash
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`btn btn-sm ${posCategory === cat ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setPosCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))',
              gap: 10,
              maxHeight: 540,
              overflowY: 'auto',
              paddingRight: 2,
            }}
          >
            {filteredPosItems.map((it) => {
              const inCart = cart.find((c) => c.item_id === it.id);
              const stockQty = Number(it.main_store_qty || 0);
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => addToCart(it)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 11px',
                    borderRadius: 10,
                    border: inCart ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: inCart ? '#eff6ff' : '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 8,
                    minHeight: 106,
                    transition: 'all 0.12s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, width: '100%' }}>
                    <span className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '2px 6px', borderRadius: 5 }}>
                      {it.sku}
                    </span>
                    <span className={`badge ${stockQty > 10 ? 'badge-emerald' : 'badge-amber'} mono`} style={{ fontSize: 10 }}>
                      {stockQty} {it.uom || 'PCS'}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a', lineHeight: 1.3 }}>
                      {it.name}
                    </div>
                    {it.category && (
                      <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>{it.category}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingTop: 4, borderTop: '1px dashed #e2e8f0' }}>
                    <span className="mono" style={{ fontWeight: 800, fontSize: 12.5, color: '#2563eb' }}>
                      {formatMoney(it.selling_price)}
                    </span>
                    {inCart ? (
                      <span className="badge badge-blue mono" style={{ fontSize: 10.5 }}>x{inCart.qty}</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <Plus size={12} /> Add
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {filteredPosItems.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 28, color: '#64748b', fontSize: 12.5 }}>
                No matching in-stock items found.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: POS REGISTER & SPLIT CHECKOUT */}
        <div className="card" style={{ position: 'sticky', top: 12 }}>
          <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span><ShoppingCart size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />POS Register</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {cart.length > 0 && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setCart([])}>
                  Clear
                </button>
              )}
              <SearchableSelect
                compact
                style={{ width: 150 }}
                value={vatMode}
                onChange={val => setVatMode(val)}
                searchPlaceholder="Search VAT mode..."
                options={[
                  { value: 'exclusive', label: 'VAT Exclusive' },
                  { value: 'inclusive', label: 'VAT Inclusive' },
                ]}
              />
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 8 }}>
            <div className="form-group">
              <label className="form-label">Customer Name</label>
              <input className="form-control" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name..." />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile Number (Ledger Lookup)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  className="form-control mono"
                  style={{ width: 112, padding: '6px 6px', fontSize: 12, flexShrink: 0 }}
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  title="Select Country Dial Code (Gulf / India)"
                >
                  {GULF_INDIA_COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code}>{c.short} {c.code}</option>
                  ))}
                </select>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Phone size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    className="form-control mono"
                    style={{ paddingLeft: 28 }}
                    placeholder="e.g. 33112233"
                    value={customerMobile}
                    onChange={e => setCustomerMobile(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {customerMobile.trim().length >= 4 && (
            <div
              style={{
                marginBottom: 10,
                padding: '9px 11px',
                borderRadius: 9,
                background: customerLedger?.found
                  ? (customerLedger.balance > 0.0005 ? '#fff1f2' : customerLedger.balance < -0.0005 ? '#ecfdf5' : '#f8fafc')
                  : '#eff6ff',
                border: `1px solid ${customerLedger?.found
                  ? (customerLedger.balance > 0.0005 ? '#fecdd3' : customerLedger.balance < -0.0005 ? '#a7f3d0' : '#e2e8f0')
                  : '#bfdbfe'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                fontSize: 12,
              }}
            >
              {lookupLoading ? (
                <span style={{ color: '#475569' }}>Checking customer ledger...</span>
              ) : customerLedger?.found ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <UserCheck size={14} color="#2563eb" />
                    <strong>{customerLedger.customer.customer_name}</strong>
                    {customerLedger.balance > 0.0005 ? (
                      <span className="badge badge-rose mono">
                        Debit / Due: {formatMoney(customerLedger.balance)}
                      </span>
                    ) : customerLedger.balance < -0.0005 ? (
                      <span className="badge badge-emerald mono">
                        Advance / Credit: {formatMoney(Math.abs(customerLedger.balance))}
                      </span>
                    ) : (
                      <span className="badge badge-slate mono">Settled: {formatMoney(0)}</span>
                    )}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: '#475569' }}>
                    Billed (Dr): {formatMoney(customerLedger.total_debit)} &bull; Paid (Cr): {formatMoney(customerLedger.total_credit)}
                  </div>
                </div>
              ) : (
                <span style={{ color: '#1e40af', fontWeight: 600 }}>
                  New Customer ({customerMobile.trim()}) &mdash; Ledger will open on sale or click Open Ledger.
                </span>
              )}
              <button type="button" className="btn btn-outline btn-sm" onClick={openOrCreateLedgerModal}>
                <BookOpen size={12} /> {customerLedger?.found ? 'View Ledger / Advance' : 'Open Ledger'}
              </button>
            </div>
          )}

          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: cart.length ? '4px 8px' : 14, background: '#f8fafc' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                Tap any product tile on the left to add items to the bill.
              </div>
            ) : (
              cart.map(c => {
                const bd = calculateFifoLineBreakdown(c.qty, c.batches, c.unit_price);
                return (
                <div key={c.item_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: '#64748b' }}>
                      {c.sku} &bull; {bd.hasMultiplePrices ? 'Batch Split' : formatMoney(c.unit_price)}
                    </div>
                    {bd.hasMultiplePrices && (
                      <div className="mono" style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 700, marginTop: 2 }}>
                        {bd.slices.map(sl => `${sl.qty}×${Number(sl.unit_price).toFixed(3)}`).join(' + ')}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ padding: '2px 6px' }}
                      onClick={() => setCart(cart.map(x => x.item_id === c.item_id ? { ...x, qty: Math.max(1, Number(x.qty) - 1) } : x))}
                    >
                      <Minus size={11} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      className="form-control mono"
                      style={{ width: 52, padding: '3px 5px', textAlign: 'center', fontSize: 12 }}
                      value={c.qty}
                      onChange={e => setCart(cart.map(x => x.item_id === c.item_id ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x))}
                    />
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ padding: '2px 6px' }}
                      onClick={() => setCart(cart.map(x => x.item_id === c.item_id ? { ...x, qty: Number(x.qty) + 1 } : x))}
                    >
                      <Plus size={11} />
                    </button>
                    <span className="mono" style={{ width: 72, textAlign: 'right', fontWeight: 700, fontSize: 12 }}>{formatMoney(bd.totalGross)}</span>
                    <button type="button" className="btn btn-outline btn-sm" style={{ padding: '3px 6px', color: '#dc2626' }} onClick={() => setCart(cart.filter(x => x.item_id !== c.item_id))}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                );
              })
            )}
          </div>

          <div style={{ marginTop: 10, padding: '12px 14px', background: '#0f172a', color: '#fff', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1' }}>
              <span>Subtotal</span><span className="mono">{formatMoney(netSum)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1', marginTop: 2 }}>
              <span>VAT ({vendor?.vat_percent || 10}%)</span><span className="mono">{formatMoney(vatSum)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <span>GRAND TOTAL</span><span className="mono" style={{ color: '#34d399' }}>{formatMoney(grandTotal)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <button type="button" className="btn btn-outline btn-sm" disabled={cart.length === 0} onClick={() => setQuickPay('cash')}>
              <Banknote size={13} /> Exact Cash
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={cart.length === 0} onClick={() => setQuickPay('card')}>
              <CreditCard size={13} /> Exact Card
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={cart.length === 0} onClick={() => setQuickPay('qr')}>
              <QrCode size={13} /> Exact QR
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={cart.length === 0}
              onClick={() => setQuickPay('credit')}
              title="Full Credit Sale (requires Mobile #)"
            >
              Full Credit
            </button>
            {isUnderpaid && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setPayCredit((Number(payCredit || 0) + balanceDue).toFixed(3))}
                title="Put remaining balance on Credit (Half Payment)"
              >
                + Remaining to Credit
              </button>
            )}
            {customerLedger?.found && customerLedger.balance < -0.0005 && cart.length > 0 && (
              <button
                type="button"
                className="btn btn-emerald btn-sm"
                onClick={() => {
                  const advAvail = Math.abs(customerLedger.balance);
                  const useAmt = Math.min(grandTotal, advAvail);
                  setPayCredit(useAmt.toFixed(3));
                }}
              >
                Use Advance ({formatMoney(Math.abs(customerLedger.balance))})
              </button>
            )}
            {totalPaidInput > 0 && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setQuickPay('clear')}>
                Clear Pay
              </button>
            )}
          </div>

          <div className="grid-3" style={{ marginTop: 8 }}>
            <div className="form-group"><label className="form-label">Cash</label><input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payCash} onChange={e => setPayCash(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Card</label><input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payCard} onChange={e => setPayCard(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">QR Pay</label><input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payQr} onChange={e => setPayQr(e.target.value)} /></div>
          </div>
          <div className="grid-3">
            <div className="form-group"><label className="form-label">Bank Transfer</label><input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payBank} onChange={e => setPayBank(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Cheque (Pending)</label><input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payCheque} onChange={e => setPayCheque(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Credit / Ledger</label><input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payCredit} onChange={e => setPayCredit(e.target.value)} /></div>
          </div>
          {isOverpaid && customerMobile.trim() && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#047857', fontWeight: 700, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={saveExcessAsAdvance} onChange={e => setSaveExcessAsAdvance(e.target.checked)} />
              Save excess ({formatMoney(overpaidAmount)}) as Customer Advance in Ledger
            </label>
          )}
          {cart.length > 0 && (
            <div
              style={{
                marginBottom: 10,
                padding: '9px 12px',
                borderRadius: 9,
                background: isOverpaid ? '#fffbeb' : isUnderpaid ? '#fff1f2' : totalPaidInput === 0 ? '#eff6ff' : '#ecfdf5',
                border: `1.5px solid ${isOverpaid ? '#f59e0b' : isUnderpaid ? '#fda4af' : totalPaidInput === 0 ? '#93c5fd' : '#6ee7b7'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              <span style={{ color: isOverpaid ? '#b45309' : '#1d4ed8' }}>
                Entered Split: <strong className="mono">{formatMoney(totalPaidInput)}</strong>
              </span>
              {totalPaidInput === 0 ? (
                <span className="badge badge-blue" style={{ fontSize: 11.5 }}>
                  Defaults to Full Cash ({formatMoney(grandTotal)})
                </span>
              ) : isOverpaid ? (
                <span className="badge badge-rose mono" style={{ fontSize: 12 }}>
                  Overpaid by +{formatMoney(overpaidAmount)} (Exceeds Total!)
                </span>
              ) : isUnderpaid ? (
                <span className="badge badge-rose mono" style={{ fontSize: 12 }}>
                  Remaining Due: {formatMoney(balanceDue)}
                </span>
              ) : (
                <span className="badge badge-emerald mono" style={{ fontSize: 12 }}>
                  Remaining: {formatMoney(0)} &bull; Paid in Full
                </span>
              )}
            </div>
          )}
          {(Number(payBank) > 0 || Number(payCheque) > 0) && (
            <div className="grid-3" style={{ marginBottom: 10 }}>
              <div className="form-group"><label className="form-label">Bank Name</label><input className="form-control" placeholder="e.g. NBB / BBK" value={bankName} onChange={e => setBankName(e.target.value)} /></div>
              {Number(payCheque) > 0 && (
                <>
                  <div className="form-group"><label className="form-label">Cheque #</label><input className="form-control mono" placeholder="Chq No." value={chequeNo} onChange={e => setChequeNo(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Cheque Date</label><input className="form-control" type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} /></div>
                </>
              )}
            </div>
          )}

          <AttachmentUploader attachments={attachments} setAttachments={setAttachments} />

          <button
            className="btn btn-emerald"
            style={{ width: '100%', marginTop: 10 }}
            disabled={cart.length === 0 || (isOverpaid && !(saveExcessAsAdvance && customerMobile.trim())) || isUnderpaid}
            onClick={submitSale}
          >
            Complete Main Store Sale
          </button>
        </div>
      </div>

      {(() => {
        const applyDatePreset = (preset) => {
          setInvDatePreset(preset);
          const today = toLocalDateStr(new Date());
          if (preset === 'today') {
            setInvFromDate(today);
            setInvToDate(today);
          } else if (preset === 'yesterday') {
            const yest = addDaysStr(today, -1);
            setInvFromDate(yest);
            setInvToDate(yest);
          } else if (preset === '7days') {
            setInvFromDate(addDaysStr(today, -6));
            setInvToDate(today);
          } else if (preset === 'all') {
            setInvFromDate('');
            setInvToDate('');
          }
        };

        const vendorShifts = getVendorShifts(vendor);
        const activeShiftNow = getCurrentShift(vendorShifts);
        const shiftOptions = [
          { id: 'all', label: 'All Shifts', from: '00:00', to: '23:59' },
          ...vendorShifts.map((s) => ({ id: s.id, label: `${s.name} (${s.from}–${s.to})`, from: s.from, to: s.to })),
        ];

        const applyShiftPreset = (shiftId) => {
          setInvShiftPreset(shiftId);
          const found = shiftOptions.find((s) => s.id === shiftId);
          if (found) {
            setInvFromTime(found.from);
            setInvToTime(found.to);
          }
        };

        const filteredInvoices = invoices.filter((inv) =>
          matchesDateAndShift(inv.created_at, {
            fromDate: invFromDate,
            toDate: invToDate,
            fromTime: invFromTime,
            toTime: invToTime,
          })
        );

        const filteredTotalSales = filteredInvoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0);
        const filteredNetProfit = filteredInvoices.reduce((s, inv) => s + Number(inv.net_profit || 0), 0);

        return (
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span>Main Store Direct Invoices</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge badge-blue mono">Invoices: {filteredInvoices.length}</span>
            <span className="badge badge-emerald mono">Sales: {formatMoney(filteredTotalSales)}</span>
            <span className="badge badge-purple mono">Profit: {formatMoney(filteredNetProfit)}</span>
          </div>
        </div>

        {/* Date Between + Shift Time Filter Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#334155', marginRight: 4 }}>
              <Calendar size={14} /> Date:
            </span>
            {[
              { id: 'today', label: "Today's Sales" },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7days', label: 'Last 7 Days' },
              { id: 'all', label: 'All Dates' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm ${invDatePreset === p.id ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => applyDatePreset(p.id)}
              >
                {p.label}
              </button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>From:</span>
              <input
                type="date"
                className="input"
                style={{ width: 140, padding: '4px 8px', fontSize: 12 }}
                value={invFromDate}
                onChange={(e) => { setInvFromDate(e.target.value); setInvDatePreset('custom'); }}
              />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>To:</span>
              <input
                type="date"
                className="input"
                style={{ width: 140, padding: '4px 8px', fontSize: 12 }}
                value={invToDate}
                onChange={(e) => { setInvToDate(e.target.value); setInvDatePreset('custom'); }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#334155', marginRight: 4 }}>
              <Clock size={14} /> Shift Time:
            </span>
            {activeShiftNow && (
              <span className="badge badge-blue" style={{ fontSize: 11 }}>
                Now: {activeShiftNow.name} ({activeShiftNow.from}–{activeShiftNow.to})
              </span>
            )}
            {shiftOptions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`btn btn-sm ${invShiftPreset === s.id ? 'btn-emerald' : 'btn-outline'}`}
                onClick={() => applyShiftPreset(s.id)}
              >
                {s.label}
              </button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>Shift From:</span>
              <input
                type="time"
                className="input mono"
                style={{ width: 110, padding: '4px 8px', fontSize: 12 }}
                value={invFromTime}
                onChange={(e) => { setInvFromTime(e.target.value); setInvShiftPreset('custom'); }}
              />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>To:</span>
              <input
                type="time"
                className="input mono"
                style={{ width: 110, padding: '4px 8px', fontSize: 12 }}
                value={invToTime}
                onChange={(e) => { setInvToTime(e.target.value); setInvShiftPreset('custom'); }}
              />
            </div>
          </div>
        </div>

        <DataTable
          data={filteredInvoices}
          searchPlaceholder="Search invoices, customer, VAT..."
          exportFilename="main-store-invoices.csv"
          emptyText="No invoices found for the selected date & shift."
          columns={[
            {
              key: 'created_at',
              label: 'Date & Time',
              sortValue: (inv) => inv.created_at || '',
              searchValue: (inv) => inv.created_at || '',
              render: (inv) => <span className="mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap', color: '#475569' }}>{formatDateTime(inv.created_at)}</span>,
            },
            {
              key: 'invoice_no',
              label: 'Invoice #',
              sortValue: (inv) => inv.invoice_no,
              searchValue: (inv) => inv.invoice_no,
              render: (inv) => <span className="mono" style={{ fontWeight: 700 }}>{inv.invoice_no}</span>,
            },
            {
              key: 'customer_name',
              label: 'Customer',
              sortValue: (inv) => inv.customer_name || '',
              searchValue: (inv) => inv.customer_name || '',
              render: (inv) => inv.customer_name,
            },
            {
              key: 'vat_mode',
              label: 'VAT Mode',
              sortValue: (inv) => inv.vat_mode || '',
              searchValue: (inv) => inv.vat_mode || '',
              render: (inv) => <span className="badge badge-blue">{inv.vat_mode}</span>,
            },
            {
              key: 'total_amount',
              label: 'Total',
              sortValue: (inv) => Number(inv.total_amount || 0),
              searchValue: (inv) => String(inv.total_amount || ''),
              render: (inv) => <span className="mono" style={{ fontWeight: 700 }}>{formatMoney(inv.total_amount)}</span>,
            },
            {
              key: 'net_profit',
              label: 'Net Profit',
              sortValue: (inv) => Number(inv.net_profit || 0),
              searchValue: (inv) => String(inv.net_profit || ''),
              render: (inv) => <span className="mono" style={{ color: '#059669' }}>{formatMoney(inv.net_profit)}</span>,
            },
            {
              key: 'attachments',
              label: 'Attachments',
              sortable: false,
              searchValue: (inv) => (inv.attachments || []).map((a) => a.attachment_type).join(' '),
              render: (inv) => (inv.attachments || []).length > 0 ? (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {inv.attachments.map(a => (
                    <a key={a.id} href={a.file_path} target="_blank" rel="noreferrer" className="badge badge-purple" style={{ textDecoration: 'none' }}>
                      {a.attachment_type.replace('_', ' ')}
                    </a>
                  ))}
                </div>
              ) : <span style={{ color: '#94a3b8', fontSize: 11 }}>-</span>,
            },
            {
              key: 'print',
              label: 'Actions',
              sortable: false,
              render: (inv) => (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setPrintInv(inv)}><Printer size={13} /> 80mm</button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: '#16a34a', color: '#fff', border: 'none' }}
                    onClick={() => shareViaWhatsApp({
                      share_type: 'invoice',
                      invoice_id: inv.id,
                      phone: inv.customer_mobile || '',
                      fallbackDialCode: countryCode,
                      label: `Purchase Bill ${inv.invoice_no} (${inv.customer_name || 'Customer'})`,
                    }).then(() => setMsg(`WhatsApp bill link ready for ${inv.invoice_no}!`)).catch((e) => setErr(e.message))}
                  >
                    <Share2 size={13} /> WhatsApp
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>
        );
      })()}

      {printInv && (
        <div className="modal-overlay" onClick={() => setPrintInv(null)}>
          <div className="modal-card" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="thermal-receipt-80mm">
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 13 }}>{vendor?.company_name}</div>
              <div style={{ textAlign: 'center', fontSize: 10, marginBottom: 6 }}>TAX INVOICE ({printInv.vat_mode.toUpperCase()})</div>
              <div>Inv: {printInv.invoice_no}</div>
              <div>Cust: {printInv.customer_name}</div>
              <hr style={{ margin: '6px 0', borderStyle: 'dashed' }} />
              {(printInv.lines || []).map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{l.item_name} x{Number(l.qty)}</span>
                  <span>{Number(l.line_total).toFixed(3)}</span>
                </div>
              ))}
              <hr style={{ margin: '6px 0', borderStyle: 'dashed' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>VAT:</span><span>{Number(printInv.vat_amount).toFixed(3)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 12 }}><span>TOTAL:</span><span>{formatMoney(printInv.total_amount)}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={() => window.print()}><Printer size={14} /> Print 80mm</button>
              {printInv.id && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: '#16a34a', color: '#fff', border: 'none' }}
                  onClick={() => shareViaWhatsApp({
                    share_type: 'invoice',
                    invoice_id: printInv.id,
                    phone: printInv.customer_mobile || '',
                    fallbackDialCode: countryCode,
                    label: `Purchase Bill ${printInv.invoice_no} (${printInv.customer_name || 'Customer'})`,
                  }).then(() => setMsg(`WhatsApp bill link ready for ${printInv.invoice_no}!`)).catch((e) => setErr(e.message))}
                >
                  <Share2 size={14} /> WhatsApp Bill
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={() => setPrintInv(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {(() => {
        const inDate = (ts, f, t) => {
          if (!f && !t) return true;
          const d = String(ts || '').slice(0, 10);
          if (!d) return false;
          return (!f || d >= f) && (!t || d <= t);
        };
        const dateFilteredLedgers = customerLedgers.filter(c => inDate(c.last_activity || c.created_at, ledgerFromDate, ledgerToDate));
        const outstandingList = dateFilteredLedgers.filter(c => Number(c.balance || 0) > 0.0005);
        const advanceList = dateFilteredLedgers.filter(c => Number(c.balance || 0) < -0.0005);
        const settledList = dateFilteredLedgers.filter(c => Math.abs(Number(c.balance || 0)) <= 0.0005);
        const totalBilled = dateFilteredLedgers.reduce((s, c) => s + Number(c.total_debit || 0), 0);
        const totalCollection = dateFilteredLedgers.reduce((s, c) => s + Number(c.total_credit || 0), 0);
        const totalOutstanding = outstandingList.reduce((s, c) => s + Number(c.balance || 0), 0);
        const totalAdvance = advanceList.reduce((s, c) => s + Math.abs(Number(c.balance || 0)), 0);
        const filteredLedgers =
          ledgerFilter === 'outstanding' ? outstandingList :
          ledgerFilter === 'advance' ? advanceList :
          ledgerFilter === 'settled' ? settledList :
          dateFilteredLedgers;

        return (
          <div className="card">
            <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span><BookOpen size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Sales Ledger &amp; Outstanding Customers</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className={`btn btn-sm ${ledgerFilter === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setLedgerFilter('all')}>
                  All ({dateFilteredLedgers.length})
                </button>
                <button type="button" className={`btn btn-sm ${ledgerFilter === 'outstanding' ? 'btn-rose' : 'btn-outline'}`} onClick={() => setLedgerFilter('outstanding')}>
                  Outstanding ({outstandingList.length})
                </button>
                <button type="button" className={`btn btn-sm ${ledgerFilter === 'advance' ? 'btn-emerald' : 'btn-outline'}`} onClick={() => setLedgerFilter('advance')}>
                  Advance Paid ({advanceList.length})
                </button>
                <button type="button" className={`btn btn-sm ${ledgerFilter === 'settled' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setLedgerFilter('settled')}>
                  Settled ({settledList.length})
                </button>
                {customerLedgers.length >= 2 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    style={{ borderColor: '#6366f1', color: '#4338ca' }}
                    onClick={() => {
                      setMergeTargetId('');
                      setMergeSourceIds([]);
                      setMergeSearch('');
                      setMergeName('');
                      setMergeMobile('');
                      setMergeModal(true);
                    }}
                  >
                    <GitMerge size={14} /> Merge Ledgers
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>
                <Calendar size={14} /> Date Between:
              </span>
              <input type="date" className="input" style={{ width: 145, padding: '4px 8px', fontSize: 12 }} value={ledgerFromDate} onChange={e => setLedgerFromDate(e.target.value)} />
              <span style={{ fontSize: 12, color: '#64748b' }}>to</span>
              <input type="date" className="input" style={{ width: 145, padding: '4px 8px', fontSize: 12 }} value={ledgerToDate} onChange={e => setLedgerToDate(e.target.value)} />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { const t = new Date().toLocaleDateString('en-CA'); setLedgerFromDate(t); setLedgerToDate(t); }}>Today</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { const n = new Date(); const p = new Date(n); p.setDate(n.getDate() - 6); setLedgerFromDate(p.toLocaleDateString('en-CA')); setLedgerToDate(n.toLocaleDateString('en-CA')); }}>7D</button>
              {(ledgerFromDate || ledgerToDate) && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setLedgerFromDate(''); setLedgerToDate(''); }}>Clear</button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                <div style={{ fontSize: 11.5, color: '#334155', fontWeight: 700 }}>Total Billed (Dr)</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{formatMoney(totalBilled)}</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 11.5, color: '#1e40af', fontWeight: 700 }}>Total Collection (Paid)</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8' }}>{formatMoney(totalCollection)}</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fff1f2', border: '1px solid #fecdd3' }}>
                <div style={{ fontSize: 11.5, color: '#9f1239', fontWeight: 700 }}>Total Outstanding (Due)</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: '#be123c' }}>{formatMoney(totalOutstanding)}</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 11.5, color: '#92400e', fontWeight: 700 }}>Outstanding Customers</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: '#b45309' }}>{outstandingList.length}</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                <div style={{ fontSize: 11.5, color: '#065f46', fontWeight: 700 }}>Total Customer Advance (Cr)</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: '#047857' }}>{formatMoney(totalAdvance)}</div>
              </div>
            </div>

            <DataTable
              data={filteredLedgers}
              searchPlaceholder="Search customer name, mobile #..."
              exportFilename="main-store-customer-ledgers.csv"
              emptyText="No customer ledgers found."
              columns={[
                {
                  key: 'customer_name',
                  label: 'Customer Name',
                  sortValue: (c) => c.customer_name || '',
                  render: (c) => <strong>{c.customer_name}</strong>,
                },
                {
                  key: 'mobile_no',
                  label: 'Mobile #',
                  sortValue: (c) => c.mobile_no || '',
                  render: (c) => <span className="mono">{c.mobile_no}</span>,
                },
                {
                  key: 'total_debit',
                  label: 'Total Billed (Dr)',
                  align: 'right',
                  sortValue: (c) => Number(c.total_debit || 0),
                  render: (c) => <span className="mono">{formatMoney(c.total_debit)}</span>,
                },
                {
                  key: 'total_credit',
                  label: 'Total Paid (Cr)',
                  align: 'right',
                  sortValue: (c) => Number(c.total_credit || 0),
                  render: (c) => <span className="mono" style={{ color: '#059669' }}>{formatMoney(c.total_credit)}</span>,
                },
                {
                  key: 'balance',
                  label: 'Balance / Status',
                  align: 'right',
                  sortValue: (c) => Number(c.balance || 0),
                  render: (c) => {
                    const b = Number(c.balance || 0);
                    if (b > 0.0005) return <span className="badge badge-rose mono">Due: {formatMoney(b)}</span>;
                    if (b < -0.0005) return <span className="badge badge-emerald mono">Adv: {formatMoney(Math.abs(b))}</span>;
                    return <span className="badge badge-slate mono">Settled</span>;
                  },
                },
                {
                  key: 'last_activity',
                  label: 'Last Activity',
                  sortValue: (c) => c.last_activity || '',
                  render: (c) => <span className="mono" style={{ fontSize: 11.5, color: '#64748b' }}>{formatDateTime(c.last_activity || c.created_at)}</span>,
                },
                {
                  key: 'action',
                  label: 'Action',
                  sortable: false,
                  render: (c) => (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        try {
                          const st = await api.get(`/api/customer-ledgers/${c.id}`);
                          setLedgerModal(st);
                        } catch (e2) { setErr(e2.message); }
                      }}
                    >
                      <BookOpen size={12} /> View / Collect
                    </button>
                  ),
                },
              ]}
            />
          </div>
        );
      })()}

      {ledgerModal && (() => {
        const filteredEntries = (ledgerModal.entries || []).filter((en) => {
          if (!modalFromDate && !modalToDate) return true;
          const d = String(en.created_at || '').slice(0, 10);
          if (!d) return false;
          return (!modalFromDate || d >= modalFromDate) && (!modalToDate || d <= modalToDate);
        });

        const handlePrintCustomerStatement = () => {
          const w = window.open('', '_blank', 'width=900,height=700');
          if (!w) return;
          const rowsHtml = filteredEntries.map(en => `
            <tr>
              <td>${formatDateTime(en.created_at)}</td>
              <td>${en.ref_no || '-'}</td>
              <td>${en.notes || en.entry_type}</td>
              <td style="text-align:right;color:#dc2626;">${Number(en.debit) > 0 ? formatMoney(en.debit) : '-'}</td>
              <td style="text-align:right;color:#059669;">${Number(en.credit) > 0 ? formatMoney(en.credit) : '-'}</td>
              <td style="text-align:right;font-weight:700;">${formatMoney(en.running_balance)}</td>
            </tr>
          `).join('');
          w.document.write(`
            <html><head><title>Statement - ${ledgerModal.customer?.customer_name}</title>
            <style>
              @page {
                size: A4;
                margin: 14mm 12mm 16mm 12mm;
                @bottom-right {
                  content: "Page " counter(page) " of " counter(pages);
                  font-family: Arial, sans-serif;
                  font-size: 10px;
                  color: #475569;
                }
                @bottom-left {
                  content: "${(vendor?.company_name || 'VanSales').replace(/"/g, '\\"')} — Statement";
                  font-family: Arial, sans-serif;
                  font-size: 10px;
                  color: #64748b;
                }
              }
              body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
              h2 { margin: 0 0 4px; }
              .meta { font-size: 12px; color: #475569; margin-bottom: 14px; }
              .summary { display: flex; gap: 16px; margin-bottom: 16px; }
              .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 14px; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th, td { border: 1px solid #cbd5e1; padding: 7px 10px; text-align: left; }
              th { background: #f1f5f9; }
            </style></head><body>
            <h2>${vendor?.company_name || 'VanSales'} — Customer Ledger Statement</h2>
            <div class="meta">Customer: <strong>${ledgerModal.customer?.customer_name}</strong> | Mobile: <strong>${ledgerModal.customer?.mobile_no}</strong> | Period: ${modalFromDate || 'All'} to ${modalToDate || 'All'}</div>
            <div class="summary">
              <div class="box">Total Billed (Dr): <strong>${formatMoney(ledgerModal.total_debit)}</strong></div>
              <div class="box">Total Paid (Cr): <strong>${formatMoney(ledgerModal.total_credit)}</strong></div>
              <div class="box">${ledgerModal.balance > 0.0005 ? 'Balance Due' : ledgerModal.balance < -0.0005 ? 'Advance Paid' : 'Balance'}: <strong>${formatMoney(Math.abs(ledgerModal.balance || 0))}</strong></div>
            </div>
            <table><thead><tr><th>Date</th><th>Ref #</th><th>Type / Notes</th><th style="text-align:right;">Debit</th><th style="text-align:right;">Credit</th><th style="text-align:right;">Balance</th></tr></thead>
            <tbody>${rowsHtml || '<tr><td colspan="6" style="text-align:center;">No entries</td></tr>'}</tbody></table>
            <script>window.onload = function() { window.print(); };</script>
            </body></html>
          `);
          w.document.close();
        };

        const handleWhatsAppCustomer = async () => {
          const bal = Number(ledgerModal.balance || 0);
          const statusLine = bal > 0.0005
            ? `Balance Due: ${formatMoney(bal)}`
            : bal < -0.0005
            ? `Advance Paid: ${formatMoney(Math.abs(bal))}`
            : `Balance: Settled (${formatMoney(0)})`;
          const lines = [
            `*${vendor?.company_name || 'VanSales'} — Customer Statement*`,
            `Customer: ${ledgerModal.customer?.customer_name}`,
            `Mobile: ${ledgerModal.customer?.mobile_no}`,
            `Total Billed: ${formatMoney(ledgerModal.total_debit)}`,
            `Total Paid: ${formatMoney(ledgerModal.total_credit)}`,
            `*${statusLine}*`,
          ];
          const latestBill = [...filteredEntries].reverse().find((en) => en.invoice_id)
            || [...(ledgerModal.entries || [])].reverse().find((en) => en.invoice_id);
          if (latestBill?.invoice_id) {
            try {
              const shareRes = await api.post('/api/share-links', {
                share_type: 'invoice',
                invoice_id: latestBill.invoice_id,
              });
              const billUrl = `${window.location.origin}${shareRes.share_path}`;
              lines.push(`Purchase Bill (${latestBill.ref_no || 'Latest'}): ${billUrl}`);
            } catch {
              // Keep statement WhatsApp message working even if share link creation fails
            }
          }
          const text = lines.join('\n');
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => {});
          }
          const digits = toWhatsAppDigits(ledgerModal.customer?.mobile_no, countryCode);
          const waUrl = digits
            ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
            : `https://wa.me/?text=${encodeURIComponent(text)}`;
          window.open(waUrl, '_blank', 'noopener,noreferrer');
          setMsg('WhatsApp statement & Purchase Bill link ready!');
        };

        return (
        <div className="modal-overlay" onClick={() => setLedgerModal(null)}>
          <div className="modal-card" style={{ maxWidth: 1020, width: '96%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                  Customer Ledger: {ledgerModal.customer?.customer_name}
                </h3>
                <div className="mono" style={{ fontSize: 12, color: '#64748b' }}>
                  Mobile: {ledgerModal.customer?.mobile_no}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={handlePrintCustomerStatement}>
                  <Printer size={14} /> Print Statement
                </button>
                <button type="button" className="btn btn-sm" style={{ background: '#16a34a', color: '#fff', border: 'none' }} onClick={handleWhatsAppCustomer}>
                  <Share2 size={14} /> WhatsApp
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setLedgerModal(null)}>
                  <X size={14} /> Close
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, padding: '8px 12px', background: '#f1f5f9', borderRadius: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>
                <Calendar size={14} /> Date Between:
              </span>
              <input type="date" className="input" style={{ width: 145, padding: '4px 8px', fontSize: 12 }} value={modalFromDate} onChange={e => setModalFromDate(e.target.value)} />
              <span style={{ fontSize: 12, color: '#64748b' }}>to</span>
              <input type="date" className="input" style={{ width: 145, padding: '4px 8px', fontSize: 12 }} value={modalToDate} onChange={e => setModalToDate(e.target.value)} />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { const t = new Date().toLocaleDateString('en-CA'); setModalFromDate(t); setModalToDate(t); }}>Today</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { const n = new Date(); const p = new Date(n); p.setDate(n.getDate() - 6); setModalFromDate(p.toLocaleDateString('en-CA')); setModalToDate(n.toLocaleDateString('en-CA')); }}>7D</button>
              {(modalFromDate || modalToDate) && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setModalFromDate(''); setModalToDate(''); }}>Clear</button>
              )}
            </div>

            <div className="grid-3" style={{ marginBottom: 12 }}>
              <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Total Billed (Debit)</div>
                <div className="mono" style={{ fontWeight: 800, fontSize: 14 }}>{formatMoney(ledgerModal.total_debit)}</div>
              </div>
              <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>Total Paid (Credit)</div>
                <div className="mono" style={{ fontWeight: 800, fontSize: 14, color: '#059669' }}>{formatMoney(ledgerModal.total_credit)}</div>
              </div>
              <div style={{ padding: 10, borderRadius: 8, background: ledgerModal.balance > 0.0005 ? '#fff1f2' : '#ecfdf5', border: `1px solid ${ledgerModal.balance > 0.0005 ? '#fecdd3' : '#a7f3d0'}` }}>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {ledgerModal.balance > 0.0005 ? 'Balance Due (Debit)' : ledgerModal.balance < -0.0005 ? 'Advance Paid (Credit)' : 'Balance'}
                </div>
                <div className="mono" style={{ fontWeight: 800, fontSize: 14, color: ledgerModal.balance > 0.0005 ? '#dc2626' : '#059669' }}>
                  {formatMoney(Math.abs(ledgerModal.balance || 0))}
                </div>
              </div>
            </div>

            <form onSubmit={submitLedgerCollection} style={{ padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800 }}>Record Advance / Credit Payment</span>
                {ledgerModal.balance > 0.0005 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setCollectForm({ ...collectForm, entry_type: 'payment', amount: Number(ledgerModal.balance).toFixed(3) })}
                  >
                    Fill Full Due ({formatMoney(ledgerModal.balance)})
                  </button>
                )}
              </div>
              <div className="grid-4">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-control" value={collectForm.entry_type} onChange={e => setCollectForm({ ...collectForm, entry_type: e.target.value })}>
                    <option value="payment">Credit Collection</option>
                    <option value="advance">Advance Payment</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Method</label>
                  <select className="form-control" value={collectForm.payment_method} onChange={e => setCollectForm({ ...collectForm, payment_method: e.target.value })}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="qr_pay">QR Pay</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input className="form-control mono" type="number" step="0.001" min="0.001" required placeholder="0.000" value={collectForm.amount} onChange={e => setCollectForm({ ...collectForm, amount: e.target.value })} />
                </div>
                <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-emerald btn-sm">Save Entry</button>
                </div>
              </div>
              <input className="form-control" style={{ marginTop: 6 }} placeholder="Notes (optional)" value={collectForm.notes} onChange={e => setCollectForm({ ...collectForm, notes: e.target.value })} />

              {Number(collectForm.amount || 0) > 0 && (() => {
                const curBal = Number(ledgerModal.balance || 0);
                const entered = Number(collectForm.amount || 0);
                const projected = curBal - entered;
                const isSettled = Math.abs(projected) <= 0.0005;
                const isAdvanceAfter = projected < -0.0005;
                return (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: isSettled || isAdvanceAfter ? '#ecfdf5' : '#fff1f2',
                      border: `1.5px solid ${isSettled || isAdvanceAfter ? '#6ee7b7' : '#fda4af'}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ color: '#1d4ed8' }}>
                      Current: <strong className="mono">{formatMoney(Math.abs(curBal))}</strong> {curBal > 0 ? 'Due' : curBal < 0 ? 'Adv' : ''} &minus; Entered: <strong className="mono">{formatMoney(entered)}</strong>
                    </span>
                    {isSettled ? (
                      <span className="badge badge-emerald mono">New Balance: {formatMoney(0)} &bull; Settled!</span>
                    ) : isAdvanceAfter ? (
                      <span className="badge badge-emerald mono">New Advance Credit: {formatMoney(Math.abs(projected))}</span>
                    ) : (
                      <span className="badge badge-rose mono">Remaining Due After Save: {formatMoney(projected)}</span>
                    )}
                  </div>
                );
              })()}
            </form>

            <DataTable
              data={filteredEntries}
              searchPlaceholder="Search ref #, notes, method..."
              exportFilename={`customer-ledger-${ledgerModal.customer?.mobile_no || 'statement'}.csv`}
              emptyText="No ledger entries yet."
              compact
              columns={[
                {
                  key: 'created_at',
                  label: 'Date',
                  sortValue: (en) => en.created_at || '',
                  render: (en) => <span className="mono" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(en.created_at)}</span>,
                },
                {
                  key: 'ref_no',
                  label: 'Ref #',
                  sortValue: (en) => en.ref_no || '',
                  render: (en) => <span className="mono" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{en.ref_no || '-'}</span>,
                },
                {
                  key: 'notes',
                  label: 'Type / Notes',
                  sortValue: (en) => en.notes || en.entry_type || '',
                  render: (en) => <span>{en.notes || en.entry_type}</span>,
                },
                {
                  key: 'debit',
                  label: 'Debit',
                  align: 'right',
                  sortValue: (en) => Number(en.debit || 0),
                  render: (en) => (
                    <span className="mono" style={{ whiteSpace: 'nowrap', color: Number(en.debit) > 0 ? '#dc2626' : '#94a3b8', fontWeight: Number(en.debit) > 0 ? 700 : 400 }}>
                      {Number(en.debit) > 0 ? formatMoney(en.debit) : '-'}
                    </span>
                  ),
                },
                {
                  key: 'credit',
                  label: 'Credit',
                  align: 'right',
                  sortValue: (en) => Number(en.credit || 0),
                  render: (en) => (
                    <span className="mono" style={{ whiteSpace: 'nowrap', color: Number(en.credit) > 0 ? '#059669' : '#94a3b8', fontWeight: Number(en.credit) > 0 ? 700 : 400 }}>
                      {Number(en.credit) > 0 ? formatMoney(en.credit) : '-'}
                    </span>
                  ),
                },
                {
                  key: 'running_balance',
                  label: 'Balance',
                  align: 'right',
                  sortValue: (en) => Number(en.running_balance || 0),
                  render: (en) => (
                    <span className="mono" style={{ whiteSpace: 'nowrap', fontWeight: 800, color: Number(en.running_balance) > 0.0005 ? '#dc2626' : Number(en.running_balance) < -0.0005 ? '#059669' : '#0f172a' }}>
                      {formatMoney(en.running_balance)}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </div>
        );
      })()}

      {mergeModal && (() => {
        const targetCust = customerLedgers.find(c => String(c.id) === String(mergeTargetId)) || null;
        const selectedSources = customerLedgers.filter(c => mergeSourceIds.includes(c.id) && String(c.id) !== String(mergeTargetId));
        const q = mergeSearch.trim().toLowerCase();
        const candidateSources = customerLedgers.filter(c =>
          String(c.id) !== String(mergeTargetId) &&
          (!q || String(c.customer_name || '').toLowerCase().includes(q) || String(c.mobile_no || '').toLowerCase().includes(q))
        );

        const combinedList = [...(targetCust ? [targetCust] : []), ...selectedSources];
        const combinedDr = combinedList.reduce((s, c) => s + Number(c.total_debit || 0), 0);
        const combinedCr = combinedList.reduce((s, c) => s + Number(c.total_credit || 0), 0);
        const combinedBal = combinedDr - combinedCr;

        const submitMerge = async (e) => {
          e.preventDefault();
          if (!targetCust || selectedSources.length === 0) return;
          setMerging(true);
          setErr('');
          setMsg('');
          try {
            const res = await api.post('/api/customer-ledgers/merge', {
              target_id: targetCust.id,
              source_ids: selectedSources.map(s => s.id),
              merged_name: mergeName.trim() || targetCust.customer_name,
              merged_mobile: mergeMobile.trim() || targetCust.mobile_no,
            });
            setMsg(res?.message || `Merged ${selectedSources.length} duplicate ledger(s) into ${mergeName || targetCust.customer_name}!`);
            setMergeModal(false);
            load();
          } catch (ex) {
            setErr(ex.message);
          } finally {
            setMerging(false);
          }
        };

        return (
          <div className="modal-overlay" onClick={() => setMergeModal(false)}>
            <div className="modal-card" style={{ maxWidth: 680, width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GitMerge size={17} style={{ color: '#4338ca' }} /> Merge Duplicate Customer Ledgers
                </h3>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setMergeModal(false)}>
                  <X size={14} /> Close
                </button>
              </div>

              <form onSubmit={submitMerge} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">1. Primary Customer Ledger to Keep (Target)</label>
                  <SearchableSelect
                    required
                    value={mergeTargetId}
                    onChange={(val) => {
                      setMergeTargetId(val);
                      const found = customerLedgers.find(c => String(c.id) === String(val));
                      setMergeName(found?.customer_name || '');
                      setMergeMobile(found?.mobile_no || '');
                      setMergeSourceIds(prev => prev.filter(id => String(id) !== String(val)));
                    }}
                    placeholder="Select primary customer ledger..."
                    searchPlaceholder="Search name or mobile #..."
                    options={customerLedgers.map(c => ({
                      value: c.id,
                      label: `${c.customer_name} (${c.mobile_no})`,
                      sublabel: `Dr: ${formatMoney(c.total_debit)} • Cr: ${formatMoney(c.total_credit)} • Bal: ${formatMoney(c.balance)}`,
                    }))}
                  />
                </div>

                {targetCust && (
                  <div className="grid-2">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Final Customer Name (Keep/Fix Spelling)</label>
                      <input className="form-control" required value={mergeName} onChange={e => setMergeName(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Final Mobile Number (Keep)</label>
                      <input className="form-control mono" required value={mergeMobile} onChange={e => setMergeMobile(e.target.value)} />
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>2. Select Duplicate Ledgers to Merge Into Primary</label>
                    <input
                      className="input"
                      style={{ width: 220, padding: '4px 8px', fontSize: 12 }}
                      placeholder="Filter name or mobile..."
                      value={mergeSearch}
                      onChange={e => setMergeSearch(e.target.value)}
                    />
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 6, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {candidateSources.length === 0 ? (
                      <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                        No other customer ledgers match your search.
                      </div>
                    ) : candidateSources.map(c => {
                      const checked = mergeSourceIds.includes(c.id);
                      const bal = Number(c.balance || 0);
                      return (
                        <label
                          key={c.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '7px 10px',
                            borderRadius: 6,
                            background: checked ? '#eef2ff' : '#ffffff',
                            border: `1px solid ${checked ? '#818cf8' : '#e2e8f0'}`,
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setMergeSourceIds(prev => checked ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                            />
                            <div>
                              <strong>{c.customer_name}</strong>
                              <span className="mono" style={{ marginLeft: 8, color: '#475569' }}>{c.mobile_no}</span>
                            </div>
                          </div>
                          <span className={`badge mono ${bal > 0.0005 ? 'badge-rose' : bal < -0.0005 ? 'badge-emerald' : 'badge-slate'}`}>
                            {bal > 0.0005 ? `Due: ${formatMoney(bal)}` : bal < -0.0005 ? `Adv: ${formatMoney(Math.abs(bal))}` : 'Settled'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {targetCust && selectedSources.length > 0 && (
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: '#eef2ff', border: '1px solid #c7d2fe', fontSize: 12 }}>
                    <div style={{ fontWeight: 800, color: '#3730a3', marginBottom: 4 }}>
                      Combined Single Ledger Preview ({1 + selectedSources.length} ledgers → 1)
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span>Total Billed: <strong className="mono">{formatMoney(combinedDr)}</strong></span>
                      <span>Total Paid: <strong className="mono" style={{ color: '#059669' }}>{formatMoney(combinedCr)}</strong></span>
                      <span>
                        Net Balance:{' '}
                        <strong className="mono" style={{ color: combinedBal > 0.0005 ? '#be123c' : '#059669' }}>
                          {combinedBal > 0.0005 ? `Due ${formatMoney(combinedBal)}` : combinedBal < -0.0005 ? `Adv ${formatMoney(Math.abs(combinedBal))}` : formatMoney(0)}
                        </strong>
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setMergeModal(false)}>Cancel</button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={merging || !targetCust || selectedSources.length === 0}
                  >
                    <GitMerge size={14} /> {merging ? 'Merging...' : `Merge ${selectedSources.length} Into Primary`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {storePettyOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setStorePettyOpen(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 760,
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              margin: 0,
              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>Main Store Petty Cash (Expense &amp; Other Income)</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12 }}>
                  <span>Other Income: <strong className="mono" style={{ color: '#059669' }}>+{formatMoney(storePettyData.summary?.total_income)}</strong></span>
                  <span>Expenses: <strong className="mono" style={{ color: '#be123c' }}>-{formatMoney(storePettyData.summary?.total_expense)}</strong></span>
                  <span>Net: <strong className="mono">{formatMoney(storePettyData.summary?.net_petty)}</strong></span>
                </div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setStorePettyOpen(false)}>
                <X size={14} /> Close
              </button>
            </div>

            <form onSubmit={submitStorePettyCash} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, padding: '12px 0', borderBottom: '1px solid #e2e8f0', alignItems: 'end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Type</label>
                <select
                  className="form-control"
                  value={storePettyForm.entry_type}
                  onChange={(e) => setStorePettyForm({
                    ...storePettyForm,
                    entry_type: e.target.value,
                    category: e.target.value === 'income' ? 'Other Income' : 'Store Expense',
                  })}
                >
                  <option value="expense">Expense (-)</option>
                  <option value="income">Other Income (+)</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Category</label>
                <input
                  className="form-control"
                  value={storePettyForm.category}
                  onChange={(e) => setStorePettyForm({ ...storePettyForm, category: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Amount ({vendor?.currency || 'BHD'})</label>
                <input
                  type="number"
                  step="0.001"
                  className="form-control mono"
                  placeholder="0.000"
                  value={storePettyForm.amount}
                  onChange={(e) => setStorePettyForm({ ...storePettyForm, amount: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes</label>
                <input
                  className="form-control"
                  placeholder="Description..."
                  value={storePettyForm.notes}
                  onChange={(e) => setStorePettyForm({ ...storePettyForm, notes: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={savingStorePetty}>
                {savingStorePetty ? 'Saving...' : 'Book Entry'}
              </button>
            </form>

            <div style={{ overflowY: 'auto', marginTop: 10 }}>
              <DataTable
                data={storePettyData.entries || []}
                compact
                searchPlaceholder="Search category, notes, user..."
                exportFilename="store-petty-cash.csv"
                columns={[
                  { key: 'entry_date', label: 'Date', sortValue: (p) => p.entry_date || '', render: (p) => <span className="mono">{p.entry_date}</span> },
                  {
                    key: 'entry_type',
                    label: 'Type',
                    sortValue: (p) => p.entry_type || '',
                    render: (p) => (
                      <span className={`badge ${p.entry_type === 'income' ? 'badge-emerald' : 'badge-rose'}`}>
                        {p.entry_type === 'income' ? 'Income (+)' : 'Expense (-)'}
                      </span>
                    ),
                  },
                  { key: 'category', label: 'Category', sortValue: (p) => p.category || '' },
                  { key: 'amount', label: 'Amount', sortValue: (p) => Number(p.amount || 0), render: (p) => <span className="mono" style={{ fontWeight: 700 }}>{formatMoney(p.amount)}</span> },
                  { key: 'notes', label: 'Notes', sortValue: (p) => p.notes || '' },
                  { key: 'created_by_name', label: 'By', sortValue: (p) => p.created_by_name || '' },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

