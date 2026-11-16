import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePersistedState } from '../hooks/usePersistedState';
import AttachmentUploader from '../components/AttachmentUploader';
import DataTable from '../components/DataTable';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import { shareViaWhatsApp } from '../utils/shareWhatsApp';
import { getVendorShifts, getCurrentShift, isTimeInShift } from '../utils/shiftTimings';
import { calculateFifoLineBreakdown } from '../utils/batchPricing';
import { GULF_INDIA_COUNTRY_CODES, getDefaultCountryCode, buildFullMobile, toWhatsAppDigits } from '../utils/phoneCodes';
import {
  Menu, X, Truck, MapPin, ShoppingBag, Package, ArrowRightLeft,
  AlertTriangle, Clock, LogOut, Printer, CheckCircle2, QrCode, CreditCard, Banknote, Plus, Minus, Trash2, BookOpen, Search, ShoppingCart, BarChart3, History, Share2,
  LayoutDashboard, Calendar, Landmark, FileCheck2, ChevronRight, ChevronDown, Pencil
} from 'lucide-react';

const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function VanDriverMobileApp() {
  const { user, vendor, van, logout, formatMoney, formatDateTime } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = usePersistedState('van_active_tab', 'route');

  const [shiftData, setShiftData] = useState({ shift: null, collections: {} });
  const [shops, setShops] = useState([]);
  const [vanStock, setVanStock] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [allVans, setAllVans] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const todayStr = localDateStr();
  const [dashFromDate, setDashFromDate] = usePersistedState('van_dash_from', todayStr);
  const [dashToDate, setDashToDate] = usePersistedState('van_dash_to', todayStr);
  const [vanDash, setVanDash] = useState(null);
  const [expandedDashShops, setExpandedDashShops] = useState({});
  const [expandedDashTx, setExpandedDashTx] = useState({});

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [toast, setToast] = useState(null);
  const [priceModal, setPriceModal] = useState(null);
  const [priceInput, setPriceInput] = useState('');
  const [priceErr, setPriceErr] = useState('');
  const [changeShiftOpen, setChangeShiftOpen] = useState(false);
  const [editShiftName, setEditShiftName] = useState('Morning Shift');
  const [editShiftType, setEditShiftType] = useState('same_day');
  const [changingShift, setChangingShift] = useState(false);

  const showToast = (type, text) => {
    if (!text) return;
    setToast({ id: Date.now() + Math.random(), type, text });
  };

  useEffect(() => {
    if (err) {
      showToast('error', err);
    } else if (msg) {
      showToast('success', msg);
    }
  }, [msg, err]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast?.id]);

  // Shift Open form
  const [shiftName, setShiftName] = useState('Morning Shift');
  const [shiftType, setShiftType] = useState('same_day');

  // POS State
  const [posSubTab, setPosSubTab] = usePersistedState('van_pos_subtab', 'items');
  const [itemSearch, setItemSearch] = useState('');
  const [selectedShop, setSelectedShop] = usePersistedState('van_selected_shop', null);
  const [invoiceType, setInvoiceType] = usePersistedState('van_invoice_type', 'sale');
  const [vatMode, setVatMode] = useState('inclusive');
  const [cart, setCart] = usePersistedState('van_pos_cart', []);
  const [payCash, setPayCash] = useState('');
  const [payCard, setPayCard] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [payQr, setPayQr] = useState('');
  const [qrRef, setQrRef] = useState('');
  const [payCredit, setPayCredit] = useState('');
  const [payBank, setPayBank] = useState('');
  const [payCheque, setPayCheque] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [printReceipt, setPrintReceipt] = useState(null);

  // Shop Ledgers & On-Account Collection + Today Shop Report + History Modal
  const [shopLedgers, setShopLedgers] = useState([]);
  const [ledgerStatement, setLedgerStatement] = useState(null);
  const [stmtFromDate, setStmtFromDate] = useState('');
  const [stmtToDate, setStmtToDate] = useState('');
  const [todayShopReport, setTodayShopReport] = useState({ shops: [], totals: {} });
  const [reportShiftId, setReportShiftId] = useState('all');
  const [reportShopTab, setReportShopTab] = useState('collected');
  const [selectedReportShop, setSelectedReportShop] = useState(null);
  const [addShopModal, setAddShopModal] = useState(false);
  const [vanCountryCode, setVanCountryCode] = useState(() => getDefaultCountryCode(vendor));
  const [addShopForm, setAddShopForm] = useState({ shop_name: '', owner_name: '', phone: '', address: '', latitude: '', longitude: '' });
  const [lastShopLink, setLastShopLink] = useState(null);
  const [correctingInvoice, setCorrectingInvoice] = useState(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [shopHistoryModal, setShopHistoryModal] = useState(null);
  const [ledgerFromDate, setLedgerFromDate] = useState('');
  const [ledgerToDate, setLedgerToDate] = useState('');
  const [historyTab, setHistoryTab] = useState('ledger');
  const emptyCollectForm = { shop_id: '', shop_name: '', balance: 0, cash: '', card: '', qr_pay: '', bank_transfer: '', cheque: '', bank_name: '', cheque_no: '', cheque_date: '', notes: '' };
  const [collectForm, setCollectForm] = useState(emptyCollectForm);
  const [collectAttachments, setCollectAttachments] = useState([]);

  // Request / V2V / Damage State
  const [reqItemId, setReqItemId] = useState('');
  const [reqQty, setReqQty] = useState(10);
  const [myRequests, setMyRequests] = useState([]);
  const [reqStatusFilter, setReqStatusFilter] = useState('all');
  const [confirmPopup, setConfirmPopup] = useState(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [v2vToVan, setV2vToVan] = useState('');
  const [v2vItemId, setV2vItemId] = useState('');
  const [v2vQty, setV2vQty] = useState(5);
  const [otpInputs, setOtpInputs] = useState({});
  const [dmgForm, setDmgForm] = useState({ item_id: '', qty: 1, return_type: 'damaged', reason_code: 'Transit Damage', notes: '' });

  // Closing form
  const [declCash, setDeclCash] = useState('');
  const [declCard, setDeclCard] = useState('');
  const [declQr, setDeclQr] = useState('');
  const [declBank, setDeclBank] = useState('');
  const [declCheque, setDeclCheque] = useState('');
  const [driverNotes, setDriverNotes] = useState('');

  const load = async () => {
    try {
      const [sh, sp, vs, it, vn, tr, inv, sl, rep, vdash, reqs] = await Promise.all([
        api.get('/api/shifts/current'),
        api.get('/api/shops'),
        api.get('/api/inventory/van-stock'),
        api.get('/api/items'),
        api.get('/api/vans'),
        api.get('/api/transfers'),
        api.get('/api/invoices'),
        api.get('/api/shop-ledgers'),
        api.get('/api/reports/van-today-shops'),
        api.get(`/api/dashboard/van?from_date=${dashFromDate}&to_date=${dashToDate}`),
        api.get('/api/requests'),
      ]);
      setShiftData(sh);
      setShops(sp);
      setVanStock(vs);
      setAllItems(it);
      setAllVans(vn.filter(v => v.id !== van?.id));
      setTransfers(tr);
      setInvoices(inv);
      setShopLedgers(sl);
      setTodayShopReport(rep);
      setVanDash(vdash);
      setMyRequests(Array.isArray(reqs) ? reqs : []);
    } catch (e) {
      setErr(e.message);
    }
  };

  const loadVanDash = async (f = dashFromDate, t = dashToDate) => {
    try {
      const qs = new URLSearchParams();
      if (f) qs.set('from_date', f);
      if (t) qs.set('to_date', t);
      const res = await api.get(`/api/dashboard/van?${qs.toString()}`);
      setVanDash(res);
    } catch (e) {
      setErr(e.message);
    }
  };

  const applyDashPreset = (days) => {
    const end = new Date();
    const start = new Date();
    if (days === 'month') {
      start.setDate(1);
    } else if (days > 0) {
      start.setDate(end.getDate() - days);
    }
    const f = localDateStr(start);
    const t = localDateStr(end);
    setDashFromDate(f);
    setDashToDate(t);
    loadVanDash(f, t);
  };

  useEffect(() => { load(); }, []);

  const switchTab = (t) => {
    setActiveTab(t);
    setDrawerOpen(false);
    setMsg('');
    setErr('');
  };

  const handleOpenShift = async () => {
    setErr(''); setMsg('');
    try {
      await api.post('/api/shifts/open', { shift_name: shiftName, shift_type: shiftType });
      setMsg(`${shiftName} opened!`);
      load();
    } catch (e) { setErr(e.message); }
  };

  const handleCheckin = async (shop) => {
    setErr(''); setMsg('');
    const maxRadius = Number(vendor?.geofence_radius_m || 250);
    if (!window.isSecureContext) {
      const m = `Browser GPS is blocked on HTTP (${window.location.origin}). Open via HTTPS (or localhost) so Chrome can ask for Location permission.`;
      setErr(m);
      showToast('error', m);
      return;
    }
    if (!navigator.geolocation) {
      const m = `GPS location is required to verify arrival within ${maxRadius}m of ${shop.shop_name}.`;
      setErr(m);
      showToast('error', m);
      return;
    }
    const verifyingMsg = `Verifying your GPS location (must be within ${maxRadius}m)...`;
    setMsg(verifyingMsg);
    showToast('success', verifyingMsg);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await api.post(`/api/shops/${shop.id}/checkin`, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          const okMsg = `Arrived & checked in at ${shop.shop_name} (${res?.distance_m ?? 0}m away)! Billing unlocked.`;
          setMsg(okMsg);
          showToast('success', okMsg);
          setSelectedShop({ ...shop, checked_in_today: 1 });
          setShops(prev => prev.map(x => x.id === shop.id ? { ...x, checked_in_today: 1 } : x));
          load();
        } catch (e) {
          setMsg('');
          setErr(e.message);
          showToast('error', e.message);
        }
      },
      (geoErr) => {
        setMsg('');
        const errMsg = geoErr.code === 1
          ? `Location permission denied. Enable GPS to check in within ${maxRadius}m of ${shop.shop_name}.`
          : `Unable to read live GPS. Turn on GPS and try Check-In again.`;
        setErr(errMsg);
        showToast('error', errMsg);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const openAddShopModal = () => {
    setAddShopForm({ shop_name: '', owner_name: '', phone: '', address: '', latitude: '', longitude: '' });
    setAddShopModal(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setAddShopForm(prev => ({
            ...prev,
            latitude: pos.coords.latitude.toFixed(6),
            longitude: pos.coords.longitude.toFixed(6),
          }));
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  const submitVanShop = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    try {
      const fullPhone = buildFullMobile(vanCountryCode, addShopForm.phone);
      const res = await api.post('/api/shops', {
        ...addShopForm,
        phone: fullPhone,
      });
      const confirmUrl = res?.confirm_path ? `${window.location.origin}${res.confirm_path}` : '';
      if (confirmUrl) {
        setLastShopLink({ shop_name: addShopForm.shop_name, owner_name: addShopForm.owner_name, phone: fullPhone, url: confirmUrl });
      }
      setMsg(`Shop "${addShopForm.shop_name}" added to your Van! Send the location confirmation link to the shopkeeper.`);
      setAddShopModal(false);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const sendShopConfirmLink = async (shop) => {
    setErr('');
    try {
      const res = await api.post(`/api/shops/${shop.id}/confirm-link`, {});
      const url = `${window.location.origin}${res.confirm_path}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).catch(() => {});
      }
      const companyName = vendor?.company_name || 'Our Company';
      const clientName = (shop.owner_name || shop.shop_name || '').trim();
      const text = `*Hello ${clientName},*\nThis message is from *${companyName}*.\n\nPlease confirm your store location (*${shop.shop_name}*) by opening this link:\n${url}`;
      const digits = toWhatsAppDigits(shop.phone, vanCountryCode);
      const waUrl = digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setMsg(`Location confirmation link ready for ${shop.shop_name}!`);
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const addToCart = (item) => {
    const baseSelling = Number(item.selling_price);
    const exist = cart.find(c => c.item_id === item.item_id);
    if (exist) {
      setCart(cart.map(c => c.item_id === item.item_id ? { ...c, qty: c.qty + 1, batches: item.van_batches || c.batches, min_price: c.min_price ?? baseSelling } : c));
    } else {
      setCart([...cart, { item_id: item.item_id, name: item.name, sku: item.sku, unit_price: baseSelling, min_price: baseSelling, price_overridden: false, batches: item.van_batches || [], qty: 1, return_condition: 'good' }]);
    }
  };

  const openPriceModal = (cartItem) => {
    const firstBatchPrice = Array.isArray(cartItem.batches) && cartItem.batches.length > 0 && cartItem.batches[0].selling_price != null
      ? Number(cartItem.batches[0].selling_price)
      : null;
    const minAllowed = Number(cartItem.min_price ?? firstBatchPrice ?? cartItem.unit_price ?? 0);
    setPriceModal({
      item_id: cartItem.item_id,
      name: cartItem.name,
      sku: cartItem.sku,
      qty: cartItem.qty,
      min_price: minAllowed,
      current_price: Number(cartItem.unit_price || minAllowed),
    });
    setPriceInput(Number(cartItem.unit_price || minAllowed).toFixed(3));
    setPriceErr('');
  };

  const savePriceModal = (e) => {
    e.preventDefault();
    if (!priceModal) return;
    const parsed = Number(priceInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPriceErr('Please enter a valid selling price.');
      return;
    }
    if (parsed < priceModal.min_price - 0.0001) {
      setPriceErr(`Price cannot be less than selling price (${formatMoney(priceModal.min_price)}). You can only increase the price.`);
      return;
    }
    setCart(cart.map(c => c.item_id === priceModal.item_id ? {
      ...c,
      unit_price: Number(parsed.toFixed(3)),
      min_price: priceModal.min_price,
      price_overridden: parsed > priceModal.min_price + 0.0005,
    } : c));
    setPriceModal(null);
    setPriceErr('');
  };

  const vatRate = Number(vendor?.vat_percent || 10) / 100;
  const grossSum = cart.reduce((s, c) => (
    invoiceType === 'sale' && !c.price_overridden
      ? s + calculateFifoLineBreakdown(c.qty, c.batches, c.unit_price).totalGross
      : s + c.qty * c.unit_price
  ), 0);
  const netSum = vatMode === 'inclusive' ? grossSum / (1 + vatRate) : grossSum;
  const vatSum = vatMode === 'inclusive' ? grossSum - netSum : grossSum * vatRate;
  const grandTotal = vatMode === 'inclusive' ? grossSum : grossSum + vatSum;

  const submitInvoice = async () => {
    setErr(''); setMsg('');
    if (!selectedShop || cart.length === 0) return;

    const payments = [];
    if (invoiceType === 'sale') {
      if (Number(payCheque) > 0 && !chequeNo.trim()) {
        setErr('Cheque Number is required when Cheque Amount is entered.');
        return;
      }
      if (Number(payCash) > 0) payments.push({ payment_method: 'cash', amount: Number(payCash) });
      if (Number(payCard) > 0) payments.push({ payment_method: 'card', amount: Number(payCard), reference_no: cardRef || 'POS-CARD' });
      if (Number(payQr) > 0) payments.push({ payment_method: 'qr_pay', amount: Number(payQr), reference_no: qrRef || 'BPAY-QR' });
      if (Number(payBank) > 0) payments.push({ payment_method: 'bank_transfer', amount: Number(payBank), bank_name: bankName || 'Bank Transfer', reference_no: 'VAN-TRF' });
      if (Number(payCheque) > 0) payments.push({ payment_method: 'cheque', amount: Number(payCheque), cheque_no: chequeNo.trim(), bank_name: bankName, cheque_date: chequeDate || null });
      if (Number(payCredit) > 0) payments.push({ payment_method: 'credit', amount: Number(payCredit) });

      const enteredTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const balanceDiff = Number((grandTotal - enteredTotal).toFixed(3));
      if (balanceDiff > 0.001) {
        // Any remaining unpaid balance automatically goes to Credit
        payments.push({ payment_method: 'credit', amount: balanceDiff });
      }
    }

    try {
      const endpoint = correctingInvoice ? `/api/invoices/${correctingInvoice.id}/correct` : '/api/invoices';
      const payload = correctingInvoice
        ? {
            vat_mode: vatMode,
            lines: cart,
            payments,
            attachments,
            correction_reason: correctionReason || 'Corrected from Van App',
          }
        : {
            source_type: 'van',
            shop_id: selectedShop.id,
            invoice_type: invoiceType,
            vat_mode: vatMode,
            lines: cart,
            payments,
            attachments,
          };

      const res = await api.post(endpoint, payload);
      setMsg(correctingInvoice
        ? `Bill Corrected! Updated Bill # ${res.invoice_no} (Old archived)`
        : `${invoiceType === 'sale' ? 'Invoice' : 'Return'} ${res.invoice_no} created!`
      );
      setPrintReceipt({
        invoice_id: res.invoice_id,
        invoice_no: res.invoice_no,
        shop_name: selectedShop.shop_name,
        shop_phone: selectedShop.phone,
        vat_mode: vatMode,
        invoice_type: invoiceType,
        lines: cart,
        vat_amount: res.vat_amount,
        total_amount: res.total_amount,
        payments,
        attachments: res.attachments || [],
      });
      setCart([]); setPayCash(''); setPayCard(''); setPayQr(''); setPayCredit(''); setPayBank(''); setPayCheque(''); setBankName(''); setChequeNo(''); setChequeDate(''); setCardRef(''); setQrRef(''); setAttachments([]); setCorrectingInvoice(null); setCorrectionReason(''); setPosSubTab('items'); setItemSearch('');
      load();
    } catch (e) { setErr(e.message); }
  };

  const startBillCorrection = (inv, shopReport) => {
    const shopObj = shops.find(s => Number(s.id) === Number(shopReport.shop_id)) || { id: shopReport.shop_id, shop_name: shopReport.shop_name };
    setSelectedShop(shopObj);
    setInvoiceType(inv.invoice_type || 'sale');
    setVatMode(inv.vat_mode || 'exclusive');
    setCart((inv.lines || []).map(l => ({
      item_id: l.item_id,
      name: l.item_name,
      sku: l.sku,
      unit_price: Number(l.unit_price),
      qty: Number(l.qty),
      return_condition: 'good',
    })));
    const pMap = { cash: '', card: '', qr_pay: '', bank_transfer: '', cheque: '', credit: '' };
    let bName = '', cNo = '', cDate = '';
    (inv.payments || []).forEach(p => {
      const m = p.payment_method;
      if (m in pMap) {
        pMap[m] = String((Number(pMap[m] || 0) + Number(p.amount)).toFixed(3));
      }
      if (p.bank_name) bName = p.bank_name;
      if (p.cheque_no) cNo = p.cheque_no;
      if (p.cheque_date) cDate = p.cheque_date;
    });
    setPayCash(pMap.cash);
    setPayCard(pMap.card);
    setPayQr(pMap.qr_pay);
    setPayBank(pMap.bank_transfer);
    setPayCheque(pMap.cheque);
    setPayCredit(pMap.credit);
    setBankName(bName);
    setChequeNo(cNo);
    setChequeDate(cDate);
    setCorrectingInvoice(inv);
    setCorrectionReason('');
    setSelectedReportShop(null);
    setActiveTab('pos');
    setPosSubTab('wallet');
  };

  const submitItemRequest = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      const res = await api.post('/api/requests', { items: [{ item_id: Number(reqItemId), qty: Number(reqQty) }] });
      setMsg(`Item Request ${res.request_no} sent to Main Store!`);
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const cancelItemRequest = (id, requestNo) => {
    setConfirmPopup({
      title: 'Cancel Stock Request',
      message: `Are you sure you want to cancel request ${requestNo}? It will move to the Cancelled list.`,
      confirmText: 'Yes, Cancel',
      variant: 'warning',
      action: async () => {
        setErr(''); setMsg('');
        await api.post(`/api/requests/${id}/cancel`, {});
        setMsg(`Request ${requestNo} cancelled and moved to Cancelled list.`);
        load();
      },
    });
  };

  const cancelItemRequestBalance = (id, requestNo, itemId = null, itemLabel = '') => {
    const scopeLabel = itemId ? `${itemLabel} in ${requestNo}` : `all remaining balance in ${requestNo}`;
    setConfirmPopup({
      title: 'Cancel Remaining Balance & Finish',
      message: `Close the remaining pending balance for ${scopeLabel}? Already delivered/accepted quantities will be kept.`,
      confirmText: 'Cancel Balance & Finish',
      variant: 'warning',
      action: async () => {
        setErr(''); setMsg('');
        await api.post(`/api/requests/${id}/cancel-balance`, itemId ? { item_id: itemId } : {});
        setMsg(`Remaining balance closed for ${scopeLabel}.`);
        load();
      },
    });
  };

  const deleteCancelledRequest = (id, requestNo) => {
    setConfirmPopup({
      title: 'Delete Cancelled Request',
      message: `Permanently delete cancelled request ${requestNo}? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      action: async () => {
        setErr(''); setMsg('');
        await api.post(`/api/requests/${id}/delete`, {});
        setMsg(`Cancelled request ${requestNo} deleted.`);
        load();
      },
    });
  };

  const submitV2V = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      const res = await api.post('/api/transfers/van-to-van', {
        to_van_id: Number(v2vToVan),
        lines: [{ item_id: Number(v2vItemId), qty: Number(v2vQty) }],
      });
      setMsg(`Van-to-Van Transfer ${res.transfer_no} initiated! OTP: ${res.otp_code}`);
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const confirmTransfer = async (id) => {
    setErr(''); setMsg('');
    try {
      await api.post(`/api/transfers/${id}/confirm`, { otp_code: otpInputs[id] || '' });
      setMsg(`Transfer #${id} confirmed and added to your Van Stock!`);
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const submitDamage = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api.post('/api/returns-damages', dmgForm);
      setMsg('Return / Damage logged and sent for Main Store QC.');
      setDmgForm({ ...dmgForm, qty: 1, notes: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const submitClosing = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    const col = shiftData.collections || {};
    try {
      await api.post('/api/shifts/close', {
        declared_cash: declCash !== '' ? Number(declCash) : (col.cash || 0),
        declared_card: declCard !== '' ? Number(declCard) : (col.card || 0),
        declared_qr: declQr !== '' ? Number(declQr) : (col.qr_pay || 0),
        declared_bank_transfer: declBank !== '' ? Number(declBank) : (col.bank_transfer || 0),
        declared_cheque: declCheque !== '' ? Number(declCheque) : (col.cheque || 0),
        driver_notes: driverNotes,
      });
      setMsg('Closing request submitted to Admin App for approval!');
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const openShopStatement = async (shopId) => {
    setErr('');
    try {
      const st = await api.get(`/api/shop-ledgers/${shopId}`);
      setLedgerStatement(st);
    } catch (e) { setErr(e.message); }
  };

  const openShopHistory = async (shopId, fDate = ledgerFromDate, tDate = ledgerToDate) => {
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (fDate) qs.set('from_date', fDate);
      if (tDate) qs.set('to_date', tDate);
      const qStr = qs.toString() ? `?${qs.toString()}` : '';
      const st = await api.get(`/api/shop-ledgers/${shopId}${qStr}`);
      setHistoryTab('ledger');
      setShopHistoryModal(st);
    } catch (e) { setErr(e.message); }
  };

  const submitLedgerCollect = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    const payments = [];
    if (Number(collectForm.cash) > 0) payments.push({ payment_method: 'cash', amount: Number(collectForm.cash) });
    if (Number(collectForm.card) > 0) payments.push({ payment_method: 'card', amount: Number(collectForm.card) });
    if (Number(collectForm.qr_pay) > 0) payments.push({ payment_method: 'qr_pay', amount: Number(collectForm.qr_pay) });
    if (Number(collectForm.bank_transfer) > 0) {
      payments.push({ payment_method: 'bank_transfer', amount: Number(collectForm.bank_transfer), bank_name: collectForm.bank_name });
    }
    if (Number(collectForm.cheque) > 0) {
      if (!String(collectForm.cheque_no || '').trim()) {
        setErr('Cheque # is required when Cheque amount is entered.');
        return;
      }
      payments.push({
        payment_method: 'cheque',
        amount: Number(collectForm.cheque),
        bank_name: collectForm.bank_name,
        cheque_no: collectForm.cheque_no,
        cheque_date: collectForm.cheque_date,
      });
    }
    if (payments.length === 0) {
      setErr('Enter an amount in at least one payment method (Cash, Card, QR Pay, Bank Transfer, or Cheque).');
      return;
    }
    try {
      const res = await api.post(`/api/shop-ledgers/${collectForm.shop_id}/collect`, {
        payments,
        notes: collectForm.notes,
        attachments: collectAttachments,
      });
      setMsg(res.message || 'Collection recorded!');
      setCollectForm(emptyCollectForm);
      setCollectAttachments([]);
      load();
      if (ledgerStatement?.shop?.id) openShopStatement(ledgerStatement.shop.id);
    } catch (e2) { setErr(e2.message); }
  };

  const shift = shiftData.shift;
  const col = shiftData.collections || {};
  const pendingIncoming = transfers.filter(t => t.to_van_id === van?.id && t.status === 'pending_confirm');

  const menuItems = [
    { id: 'dashboard', label: 'Van Dashboard & Insights', icon: LayoutDashboard },
    { id: 'route', label: 'Route & Shop Check-In', icon: MapPin },
    { id: 'pos', label: 'Shop Billing & Returns', icon: ShoppingBag },
    { id: 'today_report', label: "Today's Shop Sales & Collections", icon: BarChart3 },
    { id: 'ledgers', label: 'Shop Ledgers & Collect', icon: BookOpen },
    { id: 'stock', label: 'My Van Stock (FIFO/FEFO)', icon: Package },
    { id: 'request', label: 'Request Stock (Main Store)', icon: Plus },
    { id: 'v2v', label: `Van-to-Van & Receipts (${pendingIncoming.length})`, icon: ArrowRightLeft },
    { id: 'damages', label: 'Van Returns & Damages', icon: AlertTriangle },
    { id: 'closing', label: 'Collections & Shift Closing', icon: Clock },
  ];

  return (
    <div style={{ background: '#e2e8f0', minHeight: '100vh' }}>
      <div className="mobile-shell-wrap">
        {/* Customizable Mobile App Header */}
        <header style={{
          backgroundColor: 'var(--header-bg)',
          color: 'var(--header-text)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setDrawerOpen(true)}
              style={{ background: 'rgba(255,255,255,0.14)', border: 'none', color: 'inherit', padding: 7, borderRadius: 8, cursor: 'pointer', display: 'flex' }}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>{van?.van_name || 'Van Driver App'}</div>
              <div style={{ fontSize: 10.5, opacity: 0.8 }}>{vendor?.company_name}</div>
            </div>
          </div>
          {shift?.status === 'open' ? (
            <button
              type="button"
              onClick={() => {
                setEditShiftName(shift.shift_name || 'Morning Shift');
                setEditShiftType(shift.shift_type || 'same_day');
                setChangeShiftOpen(true);
              }}
              className="badge badge-emerald"
              style={{ fontSize: 10, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title="Tap to change active shift"
            >
              <span>{shift.shift_name}</span>
              <Pencil size={10} />
            </button>
          ) : (
            <span className="badge badge-amber" style={{ fontSize: 10 }}>
              {shift?.status || 'Closed'}
            </span>
          )}
        </header>

        {/* Left Slider Drawer */}
        {drawerOpen && (
          <>
            <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
            <aside className="drawer-panel">
              <div style={{ background: 'var(--header-bg)', color: 'var(--header-text)', padding: '18px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{user.full_name}</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{van?.van_code} &bull; Driver Mobile App</div>
                </div>
                <button onClick={() => setDrawerOpen(false)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>
              <div style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
                {menuItems.map(m => {
                  const Icon = m.icon;
                  return (
                    <button key={m.id} className={`drawer-item ${activeTab === m.id ? 'active' : ''}`} onClick={() => switchTab(m.id)}>
                      <Icon size={17} /> {m.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ padding: 14, borderTop: '1px solid #e2e8f0' }}>
                <button className="btn btn-rose" style={{ width: '100%' }} onClick={logout}>
                  <LogOut size={15} /> Logout (Revoke Token)
                </button>
              </div>
            </aside>
          </>
        )}

        {/* Mobile Body */}
        <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {msg && <div className="badge badge-emerald" style={{ padding: '9px 12px', borderRadius: 8, whiteSpace: 'normal' }}>{msg}</div>}
          {err && <div className="badge badge-rose" style={{ padding: '9px 12px', borderRadius: 8, whiteSpace: 'normal' }}>{err}</div>}

          {/* Shift Status / Open Shift Prompt */}
          {(!shift || shift.status !== 'open') && activeTab !== 'closing' && (
            <div className="card" style={{ borderColor: '#f59e0b', background: '#fffbeb' }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: '#92400e', marginBottom: 6 }}>
                {shift?.status === 'closing_pending' ? 'Closing Approval Pending from Admin' : 'Start Your Shift to Enable Shop Billing'}
              </div>
              {shift?.status === 'closing_pending' ? (
                <p style={{ fontSize: 12, color: '#78350f' }}>Your previous shift closing is awaiting Admin approval. Next-day billing is locked until approved.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <SearchableSelect
                      value={shiftName}
                      onChange={val => setShiftName(val)}
                      searchPlaceholder="Search shift..."
                      options={[
                        { value: 'Morning Shift', label: 'Morning Shift' },
                        { value: 'Evening Shift', label: 'Evening Shift' },
                        { value: 'Multi-Day Route', label: 'Multi-Day Route' },
                      ]}
                    />
                    <SearchableSelect
                      value={shiftType}
                      onChange={val => setShiftType(val)}
                      searchPlaceholder="Search type..."
                      options={[
                        { value: 'same_day', label: 'Same-Day' },
                        { value: 'multi_day', label: 'Multi-Day' },
                      ]}
                    />
                  </div>
                  <button className="btn btn-amber" onClick={handleOpenShift}>Open Shift Now</button>
                </div>
              )}
            </div>
          )}

          {/* TAB: VAN DASHBOARD & INSIGHTS */}
          {activeTab === 'dashboard' && (() => {
            const tk = vanDash?.today_kpis || {};
            const pk = vanDash?.period_kpis || {};
            const ps = vanDash?.period_split || {};
            const pc = vanDash?.period_pay_counts || {};
            const chqSum = vanDash?.cheque_summary || {};
            const agTot = vanDash?.aging_totals || {};
            const agShops = vanDash?.aging_shops || [];
            const outChqs = vanDash?.outstanding_cheques || [];
            const daily = vanDash?.daily_breakdown || [];
            const isTodayRange = dashFromDate === todayStr && dashToDate === todayStr;
            const rangeLabel = isTodayRange ? 'Today' : `${dashFromDate} → ${dashToDate}`;
            const collRate = Number(pk.sales_total || 0) > 0
              ? Math.min(100, Math.round((Number(pk.collected_total || 0) / Number(pk.sales_total || 1)) * 100))
              : 0;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15.5 }}>Van Dashboard &amp; Collection Insights</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Today&apos;s KPIs, Date-Range Insights, Cheque Status &amp; Aging</div>
                  </div>
                </div>

                {/* Today's Transaction KPIs */}
                <div className="card" style={{ padding: 12 }}>
                  <div className="card-title" style={{ marginBottom: 8 }}>
                    <span>Today&apos;s Transaction KPIs</span>
                    <span className="badge badge-emerald">Live Today</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ padding: 10, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#1e40af' }}>Today&apos;s Sales</div>
                      <div className="mono" style={{ fontSize: 16, fontWeight: 800, color: '#1e3a8a', marginTop: 2 }}>{formatMoney(tk.sales_total)}</div>
                      <div style={{ fontSize: 10.5, color: '#475569' }}>{tk.bill_count || 0} bills &bull; {tk.return_count || 0} returns</div>
                    </div>
                    <div style={{ padding: 10, borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#065f46' }}>Today&apos;s Collected</div>
                      <div className="mono" style={{ fontSize: 16, fontWeight: 800, color: '#064e3b', marginTop: 2 }}>{formatMoney(tk.collected_total)}</div>
                      <div style={{ fontSize: 10.5, color: '#475569' }}>Cash + Card + QR + Bank</div>
                    </div>
                    <div style={{ padding: 10, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e' }}>Today&apos;s Credit</div>
                      <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: '#78350f', marginTop: 2 }}>{formatMoney(tk.credit_total)}</div>
                      <div style={{ fontSize: 10.5, color: '#475569' }}>Added to Shop Ledgers</div>
                    </div>
                    <div style={{ padding: 10, borderRadius: 8, background: '#fdf2f8', border: '1px solid #fbcfe8' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9d174d' }}>Today&apos;s Cheques</div>
                      <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: '#831843', marginTop: 2 }}>{formatMoney(tk.cheque_total)}</div>
                      <div style={{ fontSize: 10.5, color: '#475569' }}>Pending Clearance</div>
                    </div>
                  </div>
                </div>

                {/* Date Between Search Filter */}
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
                    <Calendar size={15} style={{ color: '#2563eb' }} /> Date Between Search
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 600, color: '#475569' }}>From Date</label>
                      <input type="date" className="form-control" value={dashFromDate} onChange={e => setDashFromDate(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 600, color: '#475569' }}>To Date</label>
                      <input type="date" className="form-control" value={dashToDate} onChange={e => setDashToDate(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => loadVanDash(dashFromDate, dashToDate)}>Search Range</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => applyDashPreset(0)}>Today</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => applyDashPreset(6)}>7 Days</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => applyDashPreset(29)}>30 Days</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => applyDashPreset('month')}>This Month</button>
                  </div>
                </div>

                {/* Van Collection Insight (Selected Date Range) */}
                <div className="card" style={{ padding: 12 }}>
                  <div className="card-title" style={{ marginBottom: 8 }}>
                    <span>Van Collection Insight ({rangeLabel})</span>
                    <span className="badge badge-blue">{pk.bill_count || 0} Bills</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div style={{ padding: 8, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>Sales</div>
                      <div className="mono" style={{ fontSize: 13.5, fontWeight: 800 }}>{formatMoney(pk.sales_total)}</div>
                    </div>
                    <div style={{ padding: 8, borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                      <div style={{ fontSize: 10, color: '#065f46', fontWeight: 700 }}>Collected ({collRate}%)</div>
                      <div className="mono" style={{ fontSize: 13.5, fontWeight: 800, color: '#059669' }}>{formatMoney(pk.collected_total)}</div>
                    </div>
                    <div style={{ padding: 8, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>Avg Bill</div>
                      <div className="mono" style={{ fontSize: 13.5, fontWeight: 800 }}>{formatMoney(pk.avg_bill)}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      { k: 'cash', label: 'Cash', bg: '#ecfdf5', color: '#065f46' },
                      { k: 'card', label: 'Card', bg: '#eff6ff', color: '#1e40af' },
                      { k: 'qr_pay', label: 'QR Pay', bg: '#f5f3ff', color: '#5b21b6' },
                      { k: 'bank_transfer', label: 'Bank Transfer', bg: '#ecfeff', color: '#155e75' },
                      { k: 'cheque', label: 'Cheques', bg: '#fdf2f8', color: '#9d174d' },
                      { k: 'credit', label: 'Credit', bg: '#fffbeb', color: '#92400e' },
                    ].map(m => (
                      <div key={m.k} style={{ padding: '7px 9px', borderRadius: 7, background: m.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.label}</div>
                          <div style={{ fontSize: 9.5, color: '#64748b' }}>{pc[m.k] || 0} txns</div>
                        </div>
                        <div className="mono" style={{ fontSize: 12.5, fontWeight: 800, color: m.color }}>{formatMoney(ps[m.k])}</div>
                      </div>
                    ))}
                  </div>

                  {daily.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Daily Sales vs Collection</div>
                      <DataTable
                        data={daily}
                        compact
                        defaultPageSize={10}
                        searchPlaceholder="Search date..."
                        exportFilename={`van-daily-collections-${dashFromDate}-to-${dashToDate}.csv`}
                        columns={[
                          { key: 'tx_date', label: 'Date', sortValue: (d) => d.tx_date, render: (d) => <span className="mono">{d.tx_date}</span> },
                          { key: 'bills', label: 'Bills', sortValue: (d) => Number(d.bills), render: (d) => <span className="mono">{d.bills}</span> },
                          {
                            key: 'sales_total',
                            label: 'Sales',
                            sortValue: (d) => Number(d.sales_total),
                            render: (d) => (
                              <div>
                                <div className="mono" style={{ fontWeight: 700 }}>{formatMoney(d.sales_total)}</div>
                                {Number(d.markup_total || 0) > 0.0005 && (
                                  <div className="mono" style={{ fontSize: 10, color: '#059669', fontWeight: 700 }}>
                                    +{formatMoney(d.markup_total)} Extra
                                  </div>
                                )}
                              </div>
                            ),
                          },
                          {
                            key: 'markup_total',
                            label: 'Markup (+)',
                            sortValue: (d) => Number(d.markup_total || 0),
                            render: (d) => Number(d.markup_total || 0) > 0.0005
                              ? <span className="badge badge-emerald mono">+{formatMoney(d.markup_total)}</span>
                              : <span className="mono" style={{ color: '#94a3b8' }}>-</span>,
                          },
                          { key: 'collected_total', label: 'Collected', sortValue: (d) => Number(d.collected_total), render: (d) => <span className="mono" style={{ color: '#059669', fontWeight: 700 }}>{formatMoney(d.collected_total)}</span> },
                        ]}
                      />
                    </div>
                  )}
                </div>

                {/* Outstanding Cheque Status */}
                <div className="card" style={{ padding: 12 }}>
                  <div className="card-title" style={{ marginBottom: 8 }}>
                    <span><FileCheck2 size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />Outstanding Cheque Status</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                    <div style={{ padding: 8, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e' }}>Pending ({chqSum.pending_count || 0})</div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: '#b45309' }}>{formatMoney(chqSum.pending_amount)}</div>
                    </div>
                    <div style={{ padding: 8, borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#065f46' }}>Cleared ({chqSum.cleared_count || 0})</div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>{formatMoney(chqSum.cleared_amount)}</div>
                    </div>
                    <div style={{ padding: 8, borderRadius: 8, background: '#fff1f2', border: '1px solid #fecdd3' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9f1239' }}>Bounced ({chqSum.bounced_count || 0})</div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: '#e11d48' }}>{formatMoney(chqSum.bounced_amount)}</div>
                    </div>
                  </div>

                  <DataTable
                    data={outChqs}
                    compact
                    defaultPageSize={10}
                    emptyText="No pending or bounced cheques."
                    searchPlaceholder="Search cheque #, shop, bank..."
                    exportFilename="van-outstanding-cheques.csv"
                    columns={[
                      { key: 'shop_name', label: 'Shop', sortValue: (c) => c.shop_name || '' },
                      { key: 'cheque_no', label: 'Cheque #', sortValue: (c) => c.cheque_no || c.reference_no || c.id, searchValue: (c) => `${c.cheque_no || c.reference_no || c.id} ${c.bank_name || ''}` },
                      { key: 'days_pending', label: 'Age', sortValue: (c) => Number(c.days_pending || 0) },
                      { key: 'amount', label: 'Amount', sortValue: (c) => Number(c.amount || 0) },
                      { key: 'cheque_status', label: 'Status', sortValue: (c) => c.cheque_status || '' },
                    ]}
                    renderParentChild={(c) => (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 9, overflow: 'hidden', background: '#fff' }}>
                        <div style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 12.5, color: '#0f172a' }}>{c.shop_name || 'Walk-in'}</div>
                            <div className="mono" style={{ fontSize: 10.5, color: '#64748b' }}>
                              Cheque #{c.cheque_no || c.reference_no || c.id} &bull; {c.bank_name || 'Bank'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div className="mono" style={{ fontWeight: 800, fontSize: 12.5 }}>{formatMoney(c.amount)}</div>
                            <span className={`badge ${c.cheque_status === 'bounced' ? 'badge-rose' : 'badge-amber'}`} style={{ fontSize: 9.5 }}>
                              {c.cheque_status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                          <span>Cheque Date: <strong className="mono">{c.cheque_date || '-'}</strong></span>
                          <span>Inv: <strong className="mono">{c.invoice_no || 'On-Account'}</strong></span>
                          <span style={{ color: Number(c.days_pending) > 7 ? '#dc2626' : '#64748b', fontWeight: 700 }}>
                            {Math.max(0, Number(c.days_pending || 0))}d pending
                          </span>
                        </div>
                      </div>
                    )}
                  />
                </div>

                {/* Outstanding Amount Aging */}
                <div className="card" style={{ padding: 12 }}>
                  <div className="card-title" style={{ marginBottom: 8 }}>
                    <span>Outstanding Amount Aging</span>
                    <span className="badge badge-rose mono">{formatMoney(agTot.total_outstanding)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                    <div style={{ padding: 8, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>0–7 Days</div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 800 }}>{formatMoney(agTot.bucket_0_7)}</div>
                    </div>
                    <div style={{ padding: 8, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e' }}>8–15 Days</div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: '#b45309' }}>{formatMoney(agTot.bucket_8_15)}</div>
                    </div>
                    <div style={{ padding: 8, borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9a3412' }}>16–30 Days</div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: '#c2410c' }}>{formatMoney(agTot.bucket_16_30)}</div>
                    </div>
                    <div style={{ padding: 8, borderRadius: 8, background: '#fff1f2', border: '1px solid #fecdd3' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9f1239' }}>31+ Days</div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: '#dc2626' }}>{formatMoney(agTot.bucket_31_plus)}</div>
                    </div>
                  </div>

                  <DataTable
                    data={agShops}
                    compact
                    defaultPageSize={10}
                    emptyText="No outstanding shop balances."
                    searchPlaceholder="Search shop or ref #..."
                    exportFilename="van-outstanding-aging.csv"
                    columns={[
                      {
                        key: 'shop_name',
                        label: 'Shop',
                        sortValue: (s) => s.shop_name || '',
                        searchValue: (s) => `${s.shop_name} ${s.shop_code} ${(s.transactions || []).map((t) => `${t.ref_no} ${t.entry_type}`).join(' ')}`,
                      },
                      { key: 'bucket_0_7', label: '0-7d', sortValue: (s) => Number(s.bucket_0_7) },
                      { key: 'bucket_8_15', label: '8-15d', sortValue: (s) => Number(s.bucket_8_15) },
                      { key: 'bucket_16_30', label: '16-30d', sortValue: (s) => Number(s.bucket_16_30) },
                      { key: 'bucket_31_plus', label: '31+d', sortValue: (s) => Number(s.bucket_31_plus) },
                      { key: 'total_outstanding', label: 'Total', sortValue: (s) => Number(s.total_outstanding) },
                    ]}
                    renderParentChild={(s) => {
                      const isShopOpen = !!expandedDashShops[s.shop_id];
                      return (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                          {/* Parent Row: Shop Name On Top (Collapsed by default; click to expand) */}
                          <button
                            type="button"
                            onClick={() => setExpandedDashShops((prev) => ({ ...prev, [s.shop_id]: !prev[s.shop_id] }))}
                            style={{
                              width: '100%',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                              padding: '9px 11px',
                              background: isShopOpen ? '#eff6ff' : '#f8fafc',
                              borderBottom: isShopOpen ? '1px solid #bfdbfe' : 'none',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              {isShopOpen ? <ChevronDown size={16} style={{ color: '#2563eb', flexShrink: 0 }} /> : <ChevronRight size={16} style={{ color: '#64748b', flexShrink: 0 }} />}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{s.shop_name}</div>
                                <div style={{ fontSize: 10.5, color: '#64748b' }}>
                                  <span className="mono">{s.shop_code}</span> &bull; {(s.transactions || []).length} txns &bull; Oldest: <strong>{s.oldest_days}d</strong>
                                  {Number(s.pending_cheques) > 0 && <> &bull; Pending Chq: <strong className="mono">{formatMoney(s.pending_cheques)}</strong></>}
                                </div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div className="mono" style={{ fontWeight: 800, fontSize: 13.5, color: '#dc2626' }}>{formatMoney(s.total_outstanding)}</div>
                              <div style={{ fontSize: 9.5, color: '#64748b' }}>Outstanding</div>
                            </div>
                          </button>

                          {isShopOpen && (
                            <>
                              {/* Aging Buckets Strip */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, padding: '6px 10px', background: '#fff', borderBottom: '1px solid #f1f5f9', fontSize: 10.5 }}>
                                <div><span style={{ color: '#64748b' }}>0-7d:</span> <strong className="mono">{Number(s.bucket_0_7).toFixed(3)}</strong></div>
                                <div><span style={{ color: '#92400e' }}>8-15d:</span> <strong className="mono">{Number(s.bucket_8_15).toFixed(3)}</strong></div>
                                <div><span style={{ color: '#c2410c' }}>16-30d:</span> <strong className="mono">{Number(s.bucket_16_30).toFixed(3)}</strong></div>
                                <div><span style={{ color: '#dc2626' }}>31+d:</span> <strong className="mono">{Number(s.bucket_31_plus).toFixed(3)}</strong></div>
                              </div>

                              {/* Child Rows: Shop Transactions Below (Click any transaction to drill down to Items & Payments) */}
                              <div style={{ padding: '6px 10px', background: '#fcfcfd', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                                  Transactions ({(s.transactions || []).length}) &mdash; Tap to view items
                                </div>
                                {(s.transactions || []).map((tx) => {
                                  const isTxOpen = !!expandedDashTx[tx.id];
                                  const hasDetails = (tx.lines || []).length > 0 || (tx.payments || []).length > 0 || !!tx.notes;
                                  return (
                                    <div key={tx.id} style={{ borderRadius: 7, background: '#fff', border: isTxOpen ? '1px solid #93c5fd' : '1px solid #e2e8f0', overflow: 'hidden' }}>
                                      <button
                                        type="button"
                                        onClick={() => hasDetails && setExpandedDashTx((prev) => ({ ...prev, [tx.id]: !prev[tx.id] }))}
                                        style={{
                                          width: '100%',
                                          border: 'none',
                                          background: isTxOpen ? '#f8fafc' : 'transparent',
                                          cursor: hasDetails ? 'pointer' : 'default',
                                          textAlign: 'left',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          padding: '6px 8px',
                                          fontSize: 11,
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                          {hasDetails && (isTxOpen ? <ChevronDown size={13} style={{ color: '#2563eb' }} /> : <ChevronRight size={13} style={{ color: '#64748b' }} />)}
                                          <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                              <span className="mono" style={{ fontWeight: 700 }}>{tx.ref_no || '-'}</span>
                                              <span className={`badge ${tx.entry_type === 'cheque_cleared' ? 'badge-purple' : Number(tx.debit) > 0 ? 'badge-amber' : 'badge-emerald'}`} style={{ fontSize: 9 }}>
                                                {tx.entry_type}
                                              </span>
                                            </div>
                                            <div style={{ fontSize: 10, color: '#64748b' }}>{tx.entry_date} ({tx.age_days}d ago)</div>
                                          </div>
                                        </div>
                                        <div className="mono" style={{ fontWeight: 700, textAlign: 'right' }}>
                                          {Number(tx.debit) > 0 && <span style={{ color: '#dc2626' }}>+{formatMoney(tx.debit)}</span>}
                                          {Number(tx.credit) > 0 && <span style={{ color: '#059669' }}>-{formatMoney(tx.credit)}</span>}
                                        </div>
                                      </button>

                                      {/* Grandchild Drill-Down: Invoice Line Items & Payment Breakdown */}
                                      {isTxOpen && (
                                        <div style={{ padding: '7px 10px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                          {(tx.lines || []).length > 0 && (
                                            <div>
                                              <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 3 }}>
                                                Items ({tx.lines.length})
                                              </div>
                                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                {tx.lines.map((ln) => (
                                                  <div key={ln.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 6px', background: '#fff', borderRadius: 4, border: '1px solid #f1f5f9' }}>
                                                    <div>
                                                      <span style={{ fontWeight: 600 }}>{ln.item_name}</span>
                                                      <div className="mono" style={{ fontSize: 9.5, color: '#64748b' }}>
                                                        {ln.sku} &bull; {Number(ln.qty)} {ln.uom} &times; {formatMoney(ln.unit_price)}
                                                      </div>
                                                    </div>
                                                    <span className="mono" style={{ fontWeight: 700 }}>{formatMoney(ln.line_total)}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {(tx.payments || []).length > 0 && (
                                            <div>
                                              <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', marginBottom: 3 }}>Payment Breakdown</div>
                                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {tx.payments.map((pm) => (
                                                  <span key={pm.id} className="badge badge-blue" style={{ fontSize: 9.5 }}>
                                                    {pm.payment_method.toUpperCase()}: {formatMoney(pm.amount)}
                                                    {pm.cheque_no ? ` (#${pm.cheque_no} ${pm.cheque_status.replace('_', ' ')})` : ''}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          {tx.notes && (
                                            <div style={{ fontSize: 10, color: '#64748b' }}>
                                              <strong>Note:</strong> {tx.notes}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {(s.transactions || []).length === 0 && (
                                  <div style={{ fontSize: 11, color: '#94a3b8' }}>No transactions recorded.</div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    }}
                  />
                </div>
              </div>
            );
          })()}

          {/* TAB: ROUTE & SHOPS */}
          {activeTab === 'route' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Assigned Route Shops ({shops.length})</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-emerald btn-sm" onClick={openAddShopModal}>
                    <Plus size={14} /> Add Shop
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => switchTab('today_report')}>
                    <BarChart3 size={14} /> Today&apos;s Report
                  </button>
                </div>
              </div>
              {lastShopLink && (
                <div className="card" style={{ padding: 10, background: '#eff6ff', borderColor: '#bfdbfe' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e3a8a', marginBottom: 4 }}>
                    Shopkeeper Location Link ({lastShopLink.shop_name})
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ background: '#16a34a', color: '#fff', border: 'none' }}
                      onClick={() => {
                        const companyName = vendor?.company_name || 'Our Company';
                        const clientName = (lastShopLink.owner_name || lastShopLink.shop_name || '').trim();
                        const text = `*Hello ${clientName},*\nThis message is from *${companyName}*.\n\nPlease confirm your store GPS location (*${lastShopLink.shop_name}*) using this link:\n${lastShopLink.url}`;
                        const digits = toWhatsAppDigits(lastShopLink.phone, vanCountryCode);
                        window.open(digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <Share2 size={13} /> Send on WhatsApp
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setLastShopLink(null)}>Dismiss</button>
                  </div>
                </div>
              )}
              {shops.map(s => (
                <div key={s.id} className="card" style={{ padding: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => sendShopConfirmLink(s)}
                          title="Send Store Location Confirmation Link to Shopkeeper"
                          aria-label={`Send location link for ${s.shop_name}`}
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            borderRadius: 6,
                            padding: 4,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <Share2 size={13} />
                        </button>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{s.shop_name}</div>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b' }}>{s.shop_code} &bull; {s.route_name}</div>
                      <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>{s.address}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {s.checked_in_today ? (
                        <span className="badge badge-emerald"><CheckCircle2 size={12} /> Checked In</span>
                      ) : (
                        <span className="badge badge-slate">Not Arrived</span>
                      )}
                      <span className={`badge ${Number(s.location_confirmed) ? 'badge-blue' : 'badge-amber'}`} style={{ fontSize: 10 }}>
                        {Number(s.location_confirmed) ? 'GPS Confirmed' : 'GPS Unconfirmed'}
                      </span>
                    </div>
                  </div>

                  {/* Pending Details Strip */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10, padding: 8, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Pending Balance</div>
                      <div className="mono" style={{ fontSize: 12, fontWeight: 800, color: Number(s.pending_balance) > 0 ? '#be123c' : '#059669' }}>
                        {formatMoney(s.pending_balance)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Pending Chq ({s.pending_cheque_count || 0})</div>
                      <div className="mono" style={{ fontSize: 12, fontWeight: 800, color: Number(s.pending_cheques) > 0 ? '#b45309' : '#475569' }}>
                        {formatMoney(s.pending_cheques)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Today Sales</div>
                      <div className="mono" style={{ fontSize: 12, fontWeight: 800, color: '#2563eb' }}>
                        {formatMoney(s.today_sales)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-blue btn-sm" style={{ flex: 1 }} onClick={() => handleCheckin(s)}>
                      <MapPin size={14} /> Check-In ({vendor?.geofence_radius_m || 250}m)
                    </button>
                    <button
                      className="btn btn-emerald btn-sm"
                      style={{ flex: 1 }}
                      disabled={!s.checked_in_today || shift?.status !== 'open'}
                      onClick={() => { setSelectedShop(s); switchTab('pos'); }}
                    >
                      <ShoppingBag size={14} /> Bill
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => openShopHistory(s.id)}
                    >
                      <History size={14} /> History
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB: TODAY'S SHOP-WISE SALES & COLLECTION REPORT */}
          {activeTab === 'today_report' && (() => {
            const vendorShifts = getVendorShifts(vendor);
            const activeShiftNow = getCurrentShift(vendorShifts);
            const selectedShift = vendorShifts.find(s => s.id === reportShiftId) || null;

            const rawShops = todayShopReport.shops || [];
            const displayedShops = selectedShift
              ? rawShops.map(sr => {
                  const shiftInvoices = (sr.invoices || []).filter(inv =>
                    isTimeInShift(String(inv.created_at || '').slice(11, 16), selectedShift.from, selectedShift.to)
                  );
                  const salesTotal = shiftInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
                  return {
                    ...sr,
                    invoices: shiftInvoices,
                    bill_count: shiftInvoices.length,
                    sales_total: salesTotal,
                  };
                }).filter(sr => sr.bill_count > 0)
              : rawShops;

            const displayedBillCount = selectedShift
              ? displayedShops.reduce((sum, sr) => sum + Number(sr.bill_count || 0), 0)
              : (todayShopReport.totals?.bill_count || 0);
            const displayedSalesTotal = selectedShift
              ? displayedShops.reduce((sum, sr) => sum + Number(sr.sales_total || 0), 0)
              : (todayShopReport.totals?.sales_total || 0);

            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="card" style={{ padding: 12 }}>
                <div className="card-title" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <span><BarChart3 size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />Today&apos;s Shop Sales &amp; Collections</span>
                  <span className="badge badge-blue">{displayedBillCount} Bills</span>
                </div>

                {/* Shift Timing Filter from Settings */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', marginBottom: 10, padding: '8px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={12} /> Shift:
                  </span>
                  <button
                    type="button"
                    className={`btn btn-sm ${reportShiftId === 'all' ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '3px 8px', fontSize: 11 }}
                    onClick={() => setReportShiftId('all')}
                  >
                    All Shifts
                  </button>
                  {vendorShifts.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={`btn btn-sm ${reportShiftId === s.id ? 'btn-emerald' : 'btn-outline'}`}
                      style={{ padding: '3px 8px', fontSize: 11 }}
                      onClick={() => setReportShiftId(s.id)}
                    >
                      {s.name} ({s.from}–{s.to})
                    </button>
                  ))}
                  {activeShiftNow && (
                    <span className="badge badge-blue" style={{ marginLeft: 'auto', fontSize: 10 }}>
                      Active: {activeShiftNow.name}
                    </span>
                  )}
                </div>

                <div className="grid-2" style={{ gap: 8 }}>
                  <div style={{ padding: 8, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#1e40af' }}>{selectedShift ? `${selectedShift.name} Sales` : 'Total Sales Today'}</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: '#1e3a8a' }}>{formatMoney(displayedSalesTotal)}</div>
                  </div>
                  <div style={{ padding: 8, borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#065f46' }}>Total Collected Today</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: '#064e3b' }}>{formatMoney(todayShopReport.totals?.total_collected)}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8, fontSize: 11 }}>
                  <div style={{ padding: 6, background: '#f8fafc', borderRadius: 6 }}>Cash: <strong className="mono">{formatMoney(todayShopReport.totals?.cash_collected)}</strong></div>
                  <div style={{ padding: 6, background: '#f8fafc', borderRadius: 6 }}>Card: <strong className="mono">{formatMoney(todayShopReport.totals?.card_collected)}</strong></div>
                  <div style={{ padding: 6, background: '#f5f3ff', borderRadius: 6 }}>QR: <strong className="mono">{formatMoney(todayShopReport.totals?.qr_collected)}</strong></div>
                  <div style={{ padding: 6, background: '#ecfeff', borderRadius: 6 }}>Bank: <strong className="mono">{formatMoney(todayShopReport.totals?.bank_transfer_collected)}</strong></div>
                  <div style={{ padding: 6, background: '#fdf2f8', borderRadius: 6 }}>Chq: <strong className="mono">{formatMoney(todayShopReport.totals?.cheque_collected)}</strong></div>
                  <div style={{ padding: 6, background: '#fffbeb', borderRadius: 6 }}>Credit: <strong className="mono">{formatMoney(todayShopReport.totals?.credit_billed)}</strong></div>
                </div>
              </div>

              {(() => {
                const collectedShops = displayedShops.filter(sr => Number(sr.total_collected || 0) > 0);
                const nonCollectedShops = displayedShops.filter(sr => Number(sr.total_collected || 0) <= 0);
                const tabShops = reportShopTab === 'collected' ? collectedShops : nonCollectedShops;
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${reportShopTab === 'collected' ? 'btn-emerald' : 'btn-outline'}`}
                        onClick={() => setReportShopTab('collected')}
                      >
                        Collected Shops ({collectedShops.length})
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${reportShopTab === 'non_collected' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setReportShopTab('non_collected')}
                      >
                        Non-Collected Shops ({nonCollectedShops.length})
                      </button>
                    </div>
                    {tabShops.length === 0 ? (
                      <div className="card" style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                        {reportShopTab === 'collected' ? 'No collected shops today.' : 'All shops have collections today.'}
                      </div>
                    ) : tabShops.map(sr => (
                <div
                  key={sr.shop_id}
                  className="card"
                  style={{ padding: 11, cursor: 'pointer', borderColor: (sr.invoices || []).length > 0 ? '#cbd5e1' : '#e2e8f0' }}
                  onClick={() => setSelectedReportShop(sr)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{sr.shop_name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{sr.shop_code} &bull; {sr.bill_count} Bill(s) &bull; <span style={{ color: '#2563eb', fontWeight: 600 }}>Tap for Bills &amp; Correction</span></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontWeight: 800, color: '#2563eb', fontSize: 13 }}>{formatMoney(sr.sales_total)}</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>Collected: {formatMoney(sr.total_collected)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, fontSize: 10.5, color: '#475569' }}>
                    {Number(sr.cash_collected) > 0 && <span className="badge badge-emerald">Cash: {formatMoney(sr.cash_collected)}</span>}
                    {Number(sr.card_collected) > 0 && <span className="badge badge-blue">Card: {formatMoney(sr.card_collected)}</span>}
                    {Number(sr.qr_collected) > 0 && <span className="badge badge-purple">QR: {formatMoney(sr.qr_collected)}</span>}
                    {Number(sr.bank_transfer_collected) > 0 && <span className="badge badge-slate">Bank: {formatMoney(sr.bank_transfer_collected)}</span>}
                    {Number(sr.cheque_collected) > 0 && <span className="badge badge-amber">Chq: {formatMoney(sr.cheque_collected)}</span>}
                    {Number(sr.credit_billed) > 0 && <span className="badge badge-rose">Credit: {formatMoney(sr.credit_billed)}</span>}
                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: Number(sr.pending_balance) > 0 ? '#be123c' : '#059669' }}>
                      Owed: {formatMoney(sr.pending_balance)}
                    </span>
                  </div>
                </div>
                    ))}
                  </>
                );
              })()}
              {displayedShops.length === 0 && (
                <div className="card" style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                  No shop bills found for this shift.
                </div>
              )}
            </div>
            );
          })()}

          {/* TAB: SHOP POS BILLING & RETURNS */}
          {activeTab === 'pos' && (() => {
            const q = itemSearch.trim().toLowerCase();
            const filteredStock = vanStock.filter(it =>
              !q || (it.name || '').toLowerCase().includes(q) || (it.sku || '').toLowerCase().includes(q)
            );
            const totalQtyInCart = cart.reduce((s, c) => s + Number(c.qty || 0), 0);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Compact Shop & Mode Header + 2 POS Tabs */}
                <div className="card" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <SearchableSelect
                      style={{ flex: 1 }}
                      value={selectedShop?.id || ''}
                      onChange={val => setSelectedShop(shops.find(x => String(x.id) === String(val)))}
                      placeholder="Select Checked-In Shop..."
                      searchPlaceholder="Search shop name..."
                      options={shops.filter(s => s.checked_in_today).map(s => ({ value: s.id, label: s.shop_name, sublabel: s.shop_code }))}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className={`btn btn-sm ${invoiceType === 'sale' ? 'btn-blue' : 'btn-outline'}`} onClick={() => setInvoiceType('sale')}>Sale</button>
                      <button type="button" className={`btn btn-sm ${invoiceType === 'return' ? 'btn-rose' : 'btn-outline'}`} onClick={() => setInvoiceType('return')}>Return</button>
                    </div>
                  </div>

                  {/* 2 POS Tabs: Tap Items vs Wallet/Basket */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${posSubTab === 'items' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setPosSubTab('items')}
                    >
                      <Package size={14} /> Items ({filteredStock.length})
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${posSubTab === 'wallet' ? 'btn-emerald' : 'btn-outline'}`}
                      onClick={() => setPosSubTab('wallet')}
                    >
                      <ShoppingCart size={14} /> Wallet ({totalQtyInCart}) &bull; {formatMoney(grandTotal)}
                    </button>
                  </div>
                </div>

                {/* POS SUB-TAB 1: TAP ITEMS (FULL SPACE + SEARCH + ITEM ICONS) */}
                {posSubTab === 'items' && (
                  <div className="card" style={{ padding: 10 }}>
                    <div style={{ position: 'relative', marginBottom: 10 }}>
                      <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#64748b' }} />
                      <input
                        className="form-control"
                        style={{ paddingLeft: 32, paddingRight: itemSearch ? 30 : 10 }}
                        placeholder="Search item name or SKU..."
                        value={itemSearch}
                        onChange={e => setItemSearch(e.target.value)}
                      />
                      {itemSearch && (
                        <button
                          type="button"
                          onClick={() => setItemSearch('')}
                          style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {filteredStock.map(it => {
                        const inCart = cart.find(c => c.item_id === it.item_id);
                        return (
                          <button
                            key={it.item_id}
                            type="button"
                            onClick={() => addToCart(it)}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'stretch',
                              gap: 6,
                              padding: 10,
                              borderRadius: 10,
                              border: inCart ? '1.5px solid #059669' : '1px solid #e2e8f0',
                              background: inCart ? '#ecfdf5' : '#ffffff',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ width: 28, height: 28, borderRadius: 7, background: inCart ? '#d1fae5' : '#eff6ff', color: inCart ? '#059669' : '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Package size={15} />
                              </div>
                              {inCart ? (
                                <span className="badge badge-emerald" style={{ fontSize: 10 }}>x{inCart.qty}</span>
                              ) : (
                                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{it.uom || 'PCS'}</span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', lineHeight: 1.25 }}>{it.name}</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{it.sku}{it.nearest_expiry ? ` • Exp ${it.nearest_expiry}` : ''}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>
                              <span className="mono" style={{ fontSize: 11.5, fontWeight: 800, color: '#2563eb' }}>{formatMoney(it.selling_price)}</span>
                              <span className="mono" style={{ fontSize: 10.5, color: '#475569' }}>Stk: {Number(it.qty_available)}</span>
                            </div>
                          </button>
                        );
                      })}
                      {filteredStock.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 20, color: '#64748b', fontSize: 12 }}>
                          No matching items in Van Stock.
                        </div>
                      )}
                    </div>

                    {cart.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-emerald"
                        style={{ width: '100%', marginTop: 12 }}
                        onClick={() => setPosSubTab('wallet')}
                      >
                        <ShoppingCart size={15} /> Go to Wallet / Basket ({totalQtyInCart} items &bull; {formatMoney(grandTotal)})
                      </button>
                    )}
                  </div>
                )}

                {/* POS SUB-TAB 2: WALLET / BASKET (VAT INCLUDE/EXCLUDE + SPLIT PAY + ATTACHMENTS) */}
                {posSubTab === 'wallet' && (
                  <div className="card" style={{ padding: 12 }}>
                    {correctingInvoice && (
                      <div style={{ marginBottom: 10, padding: 9, borderRadius: 8, background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800 }}>
                          <span>Correcting Bill: {correctingInvoice.invoice_no}</span>
                          <button type="button" className="btn btn-outline btn-sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => { setCorrectingInvoice(null); setCart([]); setPayCash(''); setPayCard(''); setPayQr(''); setPayBank(''); setPayCheque(''); setPayCredit(''); }}>
                            Cancel
                          </button>
                        </div>
                        <input
                          className="form-control"
                          style={{ marginTop: 6, fontSize: 11.5, padding: '5px 8px' }}
                          placeholder="Correction reason (e.g. Qty changed / Split payment adjusted)"
                          value={correctionReason}
                          onChange={e => setCorrectionReason(e.target.value)}
                        />
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e2e8f0' }}>
                      <span style={{ fontWeight: 800, fontSize: 13 }}>Wallet / Basket ({totalQtyInCart})</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className={`btn btn-sm ${vatMode === 'exclusive' ? 'btn-blue' : 'btn-outline'}`} onClick={() => setVatMode('exclusive')}>VAT Exclude</button>
                        <button type="button" className={`btn btn-sm ${vatMode === 'inclusive' ? 'btn-blue' : 'btn-outline'}`} onClick={() => setVatMode('inclusive')}>VAT Include</button>
                      </div>
                    </div>

                    {cart.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 24, color: '#64748b', fontSize: 12.5 }}>
                        Your Wallet / Basket is empty.
                        <div style={{ marginTop: 10 }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => setPosSubTab('items')}>
                            <Plus size={14} /> Browse &amp; Add Items
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {cart.map(c => {
                          const bd = invoiceType === 'sale' && !c.price_overridden
                            ? calculateFifoLineBreakdown(c.qty, c.batches, c.unit_price)
                            : { totalGross: c.qty * c.unit_price, hasMultiplePrices: false, slices: [] };
                          const baseMinPrice = Number(c.min_price ?? c.unit_price);
                          const hasMarkup = c.price_overridden && Number(c.unit_price) > baseMinPrice + 0.0005;
                          return (
                          <div key={c.item_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9', gap: 6 }}>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => openPriceModal(c)}
                              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') openPriceModal(c); }}
                              style={{ flex: 1, minWidth: 0, cursor: 'pointer', padding: '2px 4px', borderRadius: 6 }}
                              title="Tap to increase selling price"
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                <span>{c.name}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#2563eb', fontWeight: 600 }}>
                                  <Pencil size={10} /> Price
                                </span>
                                {hasMarkup && (
                                  <span className="badge badge-emerald mono" style={{ fontSize: 9.5 }}>
                                    +{formatMoney(Number(c.unit_price) - baseMinPrice)}
                                  </span>
                                )}
                              </div>
                              <div className="mono" style={{ fontSize: 10.5, color: '#64748b' }}>
                                {bd.hasMultiplePrices
                                  ? <>Batch Split = <strong>{formatMoney(bd.totalGross)}</strong></>
                                  : <>{formatMoney(c.unit_price)} x {c.qty} = <strong>{formatMoney(bd.totalGross)}</strong></>
                                }
                              </div>
                              {bd.hasMultiplePrices && (
                                <div className="mono" style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 700 }}>
                                  {bd.slices.map(sl => `${sl.qty}×${Number(sl.unit_price).toFixed(3)}`).join(' + ')}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button type="button" className="btn btn-outline btn-sm" style={{ padding: '4px 6px' }} onClick={() => setCart(c.qty <= 1 ? cart.filter(x => x.item_id !== c.item_id) : cart.map(x => x.item_id === c.item_id ? { ...x, qty: x.qty - 1 } : x))}><Minus size={12} /></button>
                              <input type="number" min="1" className="form-control mono" style={{ width: 48, padding: '3px 4px', textAlign: 'center' }} value={c.qty} onChange={e => setCart(cart.map(x => x.item_id === c.item_id ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x))} />
                              <button type="button" className="btn btn-outline btn-sm" style={{ padding: '4px 6px' }} onClick={() => setCart(cart.map(x => x.item_id === c.item_id ? { ...x, qty: x.qty + 1 } : x))}><Plus size={12} /></button>
                              <button type="button" className="btn btn-outline btn-sm" style={{ padding: '4px 6px' }} onClick={() => setCart(cart.filter(x => x.item_id !== c.item_id))}><Trash2 size={12} /></button>
                            </div>
                          </div>
                          );
                        })}

                        <div style={{ marginTop: 10, padding: 8, background: '#f8fafc', borderRadius: 6, fontSize: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal:</span><span className="mono">{formatMoney(netSum)}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>VAT ({vendor?.vat_percent}% - {vatMode}):</span><span className="mono">{formatMoney(vatSum)}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14, marginTop: 3 }}><span>Total:</span><span className="mono">{formatMoney(grandTotal)}</span></div>
                        </div>

                        {invoiceType === 'sale' && (() => {
                          const enteredPaid = (Number(payCash) || 0) + (Number(payCard) || 0) + (Number(payQr) || 0) + (Number(payBank) || 0) + (Number(payCheque) || 0) + (Number(payCredit) || 0);
                          const balanceDiff = Number((grandTotal - enteredPaid).toFixed(3));
                          return (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>Split Payment Breakdown (2 Columns)</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div>
                                  <label style={{ fontSize: 10.5, fontWeight: 600, color: '#475569' }}>Cash ({vendor?.currency || 'BHD'})</label>
                                  <input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payCash} onChange={e => setPayCash(e.target.value)} />
                                </div>
                                <div>
                                  <label style={{ fontSize: 10.5, fontWeight: 600, color: '#475569' }}>Card ({vendor?.currency || 'BHD'})</label>
                                  <input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payCard} onChange={e => setPayCard(e.target.value)} />
                                </div>
                                <div>
                                  <label style={{ fontSize: 10.5, fontWeight: 600, color: '#475569' }}>QR Pay ({vendor?.currency || 'BHD'})</label>
                                  <input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payQr} onChange={e => setPayQr(e.target.value)} />
                                </div>
                                <div>
                                  <label style={{ fontSize: 10.5, fontWeight: 600, color: '#475569' }}>Bank Transfer ({vendor?.currency || 'BHD'})</label>
                                  <input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payBank} onChange={e => setPayBank(e.target.value)} />
                                </div>
                                <div>
                                  <label style={{ fontSize: 10.5, fontWeight: 600, color: '#9d174d' }}>Cheque Amount ({vendor?.currency || 'BHD'})</label>
                                  <input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payCheque} onChange={e => setPayCheque(e.target.value)} />
                                </div>
                                <div>
                                  <label style={{ fontSize: 10.5, fontWeight: 600, color: '#9d174d' }}>Cheque Number {Number(payCheque) > 0 ? '*' : ''}</label>
                                  <input className="form-control mono" placeholder="Cheque #" value={chequeNo} onChange={e => setChequeNo(e.target.value)} />
                                </div>
                              </div>

                              {(Number(payBank) > 0 || Number(payCheque) > 0) && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                  <div>
                                    <label style={{ fontSize: 10.5, fontWeight: 600, color: '#475569' }}>Bank Name</label>
                                    <input className="form-control" placeholder="e.g. NBB / BBK" value={bankName} onChange={e => setBankName(e.target.value)} />
                                  </div>
                                  {Number(payCheque) > 0 ? (
                                    <div>
                                      <label style={{ fontSize: 10.5, fontWeight: 600, color: '#475569' }}>Cheque Date</label>
                                      <input className="form-control" type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} />
                                    </div>
                                  ) : (
                                    <div>
                                      <label style={{ fontSize: 10.5, fontWeight: 600, color: '#475569' }}>Credit ({vendor?.currency || 'BHD'})</label>
                                      <input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payCredit} onChange={e => setPayCredit(e.target.value)} />
                                    </div>
                                  )}
                                </div>
                              )}

                              {!(Number(payBank) > 0 && Number(payCheque) === 0) && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                                  <div>
                                    <label style={{ fontSize: 10.5, fontWeight: 600, color: '#475569' }}>Credit ({vendor?.currency || 'BHD'})</label>
                                    <input className="form-control mono" type="number" step="0.001" placeholder="0.000" value={payCredit} onChange={e => setPayCredit(e.target.value)} />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                    <div style={{ padding: '7px 10px', borderRadius: 6, background: '#f1f5f9', fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                                      <span>Entered:</span>
                                      <strong className="mono">{formatMoney(enteredPaid)}</strong>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Balance / Credit / Advance Indicator Above Attachment */}
                              {balanceDiff > 0.001 ? (
                                <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: 12 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                                    <span>Balance Amount Needed:</span>
                                    <span className="mono">{formatMoney(balanceDiff)}</span>
                                  </div>
                                  <div style={{ fontSize: 11, marginTop: 2 }}>
                                    If not entered, <strong>{formatMoney(balanceDiff)}</strong> will automatically go to <strong>Credit</strong> (Shop Ledger).
                                  </div>
                                </div>
                              ) : balanceDiff < -0.001 ? (
                                <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 8, background: '#eff6ff', border: '1px solid #93c5fd', color: '#1e40af', fontSize: 12 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                                    <span>Overpaid / Advance Amount:</span>
                                    <span className="mono">{formatMoney(Math.abs(balanceDiff))}</span>
                                  </div>
                                  <div style={{ fontSize: 11, marginTop: 2 }}>
                                    Extra <strong>{formatMoney(Math.abs(balanceDiff))}</strong> will go to <strong>Advance</strong> on the Shop Ledger.
                                  </div>
                                </div>
                              ) : (
                                <div style={{ marginTop: 10, padding: '8px 11px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Payment Balanced:</span>
                                  <span className="mono">0.000 {vendor?.currency || 'BHD'} Remaining</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <AttachmentUploader attachments={attachments} setAttachments={setAttachments} />

                        <button type="button" className="btn btn-emerald" style={{ width: '100%', marginTop: 10 }} disabled={!selectedShop} onClick={submitInvoice}>
                          <Printer size={15} /> {correctingInvoice ? 'Complete Correction & Print Updated Receipt' : 'Complete & Print 80mm Receipt'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* TAB: MY VAN STOCK */}
          {activeTab === 'stock' && (
            <div className="card">
              <div className="card-title">My Van Stock (FIFO/FEFO)</div>
              {vanStock.map(it => (
                <div key={it.item_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12.5 }}>{it.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{it.sku} &bull; Nearest Exp: {it.nearest_expiry || 'N/A'}</div>
                  </div>
                  <div className="mono" style={{ fontWeight: 800, color: '#2563eb' }}>{Number(it.qty_available)} {it.uom}</div>
                </div>
              ))}
            </div>
          )}

          {/* TAB: ITEM REQUEST TO MAIN STORE */}
          {activeTab === 'request' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <form onSubmit={submitItemRequest} className="card">
                <div className="card-title">Request Stock from Main Store</div>
                <div className="form-group">
                  <label className="form-label">Select Item</label>
                  <SearchableSelect
                    required
                    value={reqItemId}
                    onChange={val => setReqItemId(val)}
                    placeholder="Choose item..."
                    searchPlaceholder="Search SKU or item name..."
                    options={allItems.map(i => ({ value: i.id, label: `${i.sku} - ${i.name}`, sublabel: i.category }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity Needed</label>
                  <input className="form-control mono" type="number" min="1" required value={reqQty} onChange={e => setReqQty(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-blue" style={{ width: '100%' }}>Send Request to Main Store</button>
              </form>

              <div className="card">
                <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span>Pending &amp; Recent Request List</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: `All (${myRequests.filter(r => r.status !== 'cancelled').length})` },
                      { id: 'pending', label: `Pending (${myRequests.filter(r => r.status !== 'cancelled' && ((r.items || []).some(it => Number(it.pending_qty ?? it.qty ?? 0) > 0) || r.status === 'pending')).length})` },
                      { id: 'received', label: `Received (${myRequests.filter(r => r.status !== 'cancelled' && (r.items || []).length > 0 && (r.items || []).every(it => it.item_status === 'received' || Number(it.pending_qty ?? 1) === 0)).length})` },
                      { id: 'cancelled', label: `Cancelled (${myRequests.filter(r => r.status === 'cancelled').length})` },
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        className={`btn btn-sm ${reqStatusFilter === f.id ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setReqStatusFilter(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const filteredReqs = myRequests.filter((r) => {
                    if (reqStatusFilter === 'cancelled') return r.status === 'cancelled';
                    if (r.status === 'cancelled') return false;
                    const itemsList = r.items || [];
                    const hasPending = itemsList.some((it) => Number(it.pending_qty ?? it.qty ?? 0) > 0) || r.status === 'pending';
                    if (reqStatusFilter === 'pending') return hasPending;
                    if (reqStatusFilter === 'received') return !hasPending;
                    return true;
                  });

                  if (filteredReqs.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: 16, fontSize: 12, color: '#64748b' }}>
                        No stock requests found.
                      </div>
                    );
                  }

                  const statusMeta = (st) => {
                    if (st === 'cancelled') return { cls: 'badge-rose', text: 'Cancelled' };
                    if (st === 'received') return { cls: 'badge-emerald', text: 'Received' };
                    if (st === 'partial') return { cls: 'badge-amber', text: 'Partially Received' };
                    if (st === 'ready_pickup') return { cls: 'badge-blue', text: 'Ready to Pickup' };
                    if (st === 'dispatched') return { cls: 'badge-blue', text: 'Dispatched' };
                    return { cls: 'badge-amber', text: 'Pending' };
                  };

                  return filteredReqs.map((r) => (
                    <div key={r.id} style={{ padding: '10px 12px', marginBottom: 8, background: r.status === 'cancelled' ? '#fff5f5' : '#f8fafc', borderRadius: 8, border: `1px solid ${r.status === 'cancelled' ? '#fecaca' : '#e2e8f0'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                        <div>
                          <div className="mono" style={{ fontWeight: 800, fontSize: 12.5, color: '#0f172a' }}>{r.request_no}</div>
                          {r.created_at && (
                            <div className="mono" style={{ fontSize: 10.5, color: '#64748b' }}>
                              {formatDateTime(r.created_at)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className={`badge ${(r.status === 'dispatched' || r.status === 'completed') ? 'badge-emerald' : r.status === 'cancelled' ? 'badge-rose' : 'badge-amber'}`} style={{ fontSize: 10.5 }}>
                            {r.status}
                          </span>
                          {r.status === 'pending' && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ color: '#dc2626', borderColor: '#fecaca', padding: '2px 8px', fontSize: 11 }}
                              onClick={() => cancelItemRequest(r.id, r.request_no)}
                            >
                              Cancel
                            </button>
                          )}
                          {r.status === 'partial' && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ color: '#dc2626', borderColor: '#fecaca', padding: '2px 8px', fontSize: 11 }}
                              onClick={() => cancelItemRequestBalance(r.id, r.request_no)}
                            >
                              Cancel Bal &amp; Finish
                            </button>
                          )}
                          {r.status === 'cancelled' && (
                            <button
                              type="button"
                              className="btn btn-rose btn-sm"
                              style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={() => deleteCancelledRequest(r.id, r.request_no)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(r.items || []).map((it, idx) => {
                          const matched = allItems.find(x => Number(x.id) === Number(it.item_id));
                          const sku = it.sku || matched?.sku || `#${it.item_id}`;
                          const name = it.item_name || matched?.name || `Item #${it.item_id}`;
                          const uom = it.uom || matched?.uom || 'PCS';
                          const reqQ = Number(it.requested_qty ?? it.qty ?? 0);
                          const delQ = Number(it.delivered_qty ?? it.dispatched_qty ?? 0);
                          const recQ = Number(it.accepted_qty ?? it.received_qty ?? 0);
                          const readyQ = Number(it.ready_pickup_qty ?? 0);
                          const canQ = Number(it.cancelled_qty ?? 0);
                          const balQ = Number(it.balance_qty ?? Math.max(0, reqQ - delQ - canQ));
                          const meta = statusMeta(it.item_status || r.status);

                          return (
                            <div key={`${r.id}_${it.item_id}_${idx}`} style={{ padding: '8px 10px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                                  {sku} &mdash; {name}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span className={`badge ${meta.cls}`} style={{ fontSize: 10 }}>{meta.text}</span>
                                  {balQ > 0 && delQ > 0 && r.status !== 'cancelled' && (
                                    <button
                                      type="button"
                                      className="btn btn-outline btn-sm"
                                      style={{ color: '#dc2626', borderColor: '#fecaca', padding: '1px 6px', fontSize: 10 }}
                                      onClick={() => cancelItemRequestBalance(r.id, r.request_no, it.item_id, sku)}
                                    >
                                      Cancel Bal
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
                                <span className="badge badge-slate mono">Requested: {reqQ} {uom}</span>
                                <span className="badge badge-blue mono">Delivered: {delQ} {uom}</span>
                                <span className="badge badge-emerald mono">Accepted: {recQ} {uom}</span>
                                {readyQ > 0 && (
                                  <span className="badge badge-amber mono">Ready Pickup: {readyQ} {uom}</span>
                                )}
                                {canQ > 0 && (
                                  <span className="badge badge-slate mono">Closed: {canQ} {uom}</span>
                                )}
                                <span className={`badge ${balQ > 0 ? 'badge-rose' : 'badge-emerald'} mono`}>
                                  Balance: {balQ} {uom}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* TAB: VAN-TO-VAN & INCOMING TRANSFERS */}
          {activeTab === 'v2v' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingIncoming.length > 0 && (
                <div className="card" style={{ borderColor: '#2563eb', background: '#eff6ff' }}>
                  <div className="card-title">
                    <span>Ready to Pickup / Incoming Transfers</span>
                    <span className="badge badge-amber">{pendingIncoming.length} Ready</span>
                  </div>
                  {pendingIncoming.map(t => (
                    <div key={t.id} style={{ padding: '9px 10px', marginBottom: 8, background: '#fff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ fontWeight: 800, fontSize: 12.5 }}>{t.transfer_no}</div>
                        <span className="badge badge-blue" style={{ fontSize: 10 }}>
                          {t.from_van_name ? `From ${t.from_van_name}` : 'Main Store Pickup'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>
                        {(t.lines || []).map(l => (
                          <div key={l.id}><strong>{l.item_name}</strong> &times; <span className="mono">{Number(l.qty)}</span></div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="form-control mono" placeholder={`OTP (${t.otp_code})`} value={otpInputs[t.id] || ''} onChange={e => setOtpInputs({ ...otpInputs, [t.id]: e.target.value })} />
                        <button className="btn btn-emerald btn-sm" onClick={() => confirmTransfer(t.id)}>Confirm Pickup</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={submitV2V} className="card">
                <div className="card-title">Initiate Van-to-Van Field Transfer</div>
                <div className="form-group">
                  <label className="form-label">Transfer To Van</label>
                  <SearchableSelect
                    required
                    value={v2vToVan}
                    onChange={val => setV2vToVan(val)}
                    placeholder="Select destination van..."
                    searchPlaceholder="Search van..."
                    options={allVans.map(v => ({ value: v.id, label: v.van_name, sublabel: v.van_code }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Item from Your Van</label>
                  <SearchableSelect
                    required
                    value={v2vItemId}
                    onChange={val => setV2vItemId(val)}
                    placeholder="Select item..."
                    searchPlaceholder="Search item..."
                    options={vanStock.map(i => ({ value: i.item_id, label: i.name, sublabel: `Avail: ${Number(i.qty_available)}` }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Quantity</label>
                  <input className="form-control mono" type="number" min="1" required value={v2vQty} onChange={e => setV2vQty(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-amber" style={{ width: '100%' }}>Send Van-to-Van Transfer</button>
              </form>
            </div>
          )}

          {/* TAB: RETURNS & DAMAGES */}
          {activeTab === 'damages' && (
            <form onSubmit={submitDamage} className="card">
              <div className="card-title">Log Van Return / Damaged Stock</div>
              <div className="form-group">
                <label className="form-label">Item</label>
                <SearchableSelect
                  required
                  value={dmgForm.item_id}
                  onChange={val => setDmgForm({ ...dmgForm, item_id: val })}
                  placeholder="Select item..."
                  searchPlaceholder="Search item..."
                  options={vanStock.map(i => ({ value: i.item_id, label: i.name, sublabel: `Avail: ${Number(i.qty_available)}` }))}
                />
              </div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Qty</label><input className="form-control mono" type="number" min="1" required value={dmgForm.qty} onChange={e => setDmgForm({ ...dmgForm, qty: e.target.value })} /></div>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <SearchableSelect
                    value={dmgForm.return_type}
                    onChange={val => setDmgForm({ ...dmgForm, return_type: val })}
                    searchPlaceholder="Search type..."
                    options={[
                      { value: 'damaged', label: 'Damaged' },
                      { value: 'expired', label: 'Expired' },
                      { value: 'good_return', label: 'Good Return' },
                    ]}
                  />
                </div>
              </div>
              <div className="form-group"><label className="form-label">Reason</label><input className="form-control" value={dmgForm.reason_code} onChange={e => setDmgForm({ ...dmgForm, reason_code: e.target.value })} /></div>
              <button type="submit" className="btn btn-rose" style={{ width: '100%' }}>Submit Return / Damage</button>
            </form>
          )}

          {/* TAB: DAILY COLLECTIONS & COMPULSORY CLOSING */}
          {activeTab === 'closing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card">
                <div className="card-title" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <span>Current Shift Split Collections</span>
                  {(() => {
                    const curShift = getCurrentShift(getVendorShifts(vendor));
                    return curShift ? (
                      <span className="badge badge-blue">{curShift.name} ({curShift.from}–{curShift.to})</span>
                    ) : null;
                  })()}
                </div>
                <div className="grid-2" style={{ gap: 8 }}>
                  <div style={{ padding: 8, background: '#ecfdf5', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#065f46', fontWeight: 700 }}><Banknote size={13} /> Cash</div>
                    <div className="mono" style={{ fontWeight: 800 }}>{formatMoney(col.cash)}</div>
                  </div>
                  <div style={{ padding: 8, background: '#eff6ff', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 700 }}><CreditCard size={13} /> Card</div>
                    <div className="mono" style={{ fontWeight: 800 }}>{formatMoney(col.card)}</div>
                  </div>
                  <div style={{ padding: 8, background: '#f5f3ff', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#5b21b6', fontWeight: 700 }}><QrCode size={13} /> QR Pay</div>
                    <div className="mono" style={{ fontWeight: 800 }}>{formatMoney(col.qr_pay)}</div>
                  </div>
                  <div style={{ padding: 8, background: '#fffbeb', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#92400e', fontWeight: 700 }}>Credit</div>
                    <div className="mono" style={{ fontWeight: 800 }}>{formatMoney(col.credit)}</div>
                  </div>
                  <div style={{ padding: 8, background: '#ecfeff', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#155e75', fontWeight: 700 }}>Bank Transfer</div>
                    <div className="mono" style={{ fontWeight: 800 }}>{formatMoney(col.bank_transfer)}</div>
                  </div>
                  <div style={{ padding: 8, background: '#fdf2f8', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: '#9d174d', fontWeight: 700 }}>Cheque (Collected)</div>
                    <div className="mono" style={{ fontWeight: 800 }}>{formatMoney(col.cheque)}</div>
                  </div>
                </div>
              </div>

              {shift?.status === 'open' && (
                <form onSubmit={submitClosing} className="card">
                  <div className="card-title">Submit Compulsory Shift Closing</div>
                  {shift && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                      <span>Active: <strong>{shift.shift_name}</strong> ({shift.shift_type === 'multi_day' ? 'Multi-Day' : 'Same-Day'})</span>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          setEditShiftName(shift.shift_name || 'Morning Shift');
                          setEditShiftType(shift.shift_type || 'same_day');
                          setChangeShiftOpen(true);
                        }}
                      >
                        <Pencil size={12} /> Change Shift
                      </button>
                    </div>
                  )}
                  <div className="form-group"><label className="form-label">Declared Cash (Exp: {Number(col.cash || 0).toFixed(3)})</label><input className="form-control mono" type="number" step="0.001" placeholder={Number(col.cash || 0).toFixed(3)} value={declCash} onChange={e => setDeclCash(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Declared Card (Exp: {Number(col.card || 0).toFixed(3)})</label><input className="form-control mono" type="number" step="0.001" placeholder={Number(col.card || 0).toFixed(3)} value={declCard} onChange={e => setDeclCard(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Declared QR Pay (Exp: {Number(col.qr_pay || 0).toFixed(3)})</label><input className="form-control mono" type="number" step="0.001" placeholder={Number(col.qr_pay || 0).toFixed(3)} value={declQr} onChange={e => setDeclQr(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Declared Bank Transfer (Exp: {Number(col.bank_transfer || 0).toFixed(3)})</label><input className="form-control mono" type="number" step="0.001" placeholder={Number(col.bank_transfer || 0).toFixed(3)} value={declBank} onChange={e => setDeclBank(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Declared Cheque (Exp: {Number(col.cheque || 0).toFixed(3)})</label><input className="form-control mono" type="number" step="0.001" placeholder={Number(col.cheque || 0).toFixed(3)} value={declCheque} onChange={e => setDeclCheque(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Notes</label><input className="form-control" value={driverNotes} onChange={e => setDriverNotes(e.target.value)} placeholder="End of shift remarks" /></div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Submit Closing to Admin App</button>
                </form>
              )}
            </div>
          )}

          {/* TAB: SHOP LEDGERS & ON-ACCOUNT COLLECTION */}
          {activeTab === 'ledgers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="card">
                <div className="card-title">My Route Shop Ledgers</div>
                {shopLedgers.map(s => (
                  <div key={s.shop_id} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{s.shop_name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {s.shop_code} &bull; Pending Chq: {formatMoney(s.pending_cheques)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="mono" style={{ fontWeight: 800, color: Number(s.balance) > 0 ? '#be123c' : '#059669' }}>
                          {formatMoney(s.balance)}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>Balance Owed</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => openShopStatement(s.shop_id)}>Statement</button>
                      <button
                        className="btn btn-emerald btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => setCollectForm({ ...emptyCollectForm, shop_id: s.shop_id, shop_name: s.shop_name, balance: Number(s.balance || 0) })}
                      >
                        Collect Payment
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {collectForm.shop_id && (() => {
                const splitTotal =
                  Number(collectForm.cash || 0) +
                  Number(collectForm.card || 0) +
                  Number(collectForm.qr_pay || 0) +
                  Number(collectForm.bank_transfer || 0) +
                  Number(collectForm.cheque || 0);
                const balOwed = Number(collectForm.balance || 0);
                return (
                <form onSubmit={submitLedgerCollect} className="card" style={{ borderColor: '#059669' }}>
                  <div className="card-title" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <span>Collect On-Account Payment</span>
                    {collectForm.shop_name && (
                      <span className="badge badge-blue" style={{ fontSize: 11 }}>{collectForm.shop_name}</span>
                    )}
                  </div>
                  {balOwed > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10, padding: '6px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: 12 }}>
                        Balance Owed: <strong className="mono" style={{ color: '#be123c' }}>{formatMoney(balOwed)}</strong>
                      </span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => setCollectForm({ ...collectForm, cash: balOwed.toFixed(3), card: '', qr_pay: '', bank_transfer: '', cheque: '' })}>Full Cash</button>
                        <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => setCollectForm({ ...collectForm, cash: '', card: '', qr_pay: balOwed.toFixed(3), bank_transfer: '', cheque: '' })}>Full QR</button>
                        <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => setCollectForm({ ...collectForm, cash: '', card: balOwed.toFixed(3), qr_pay: '', bank_transfer: '', cheque: '' })}>Full Card</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Cash</label>
                      <input className="form-control mono" type="number" step="0.001" min="0" placeholder="0.000" value={collectForm.cash} onChange={e => setCollectForm({ ...collectForm, cash: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Card</label>
                      <input className="form-control mono" type="number" step="0.001" min="0" placeholder="0.000" value={collectForm.card} onChange={e => setCollectForm({ ...collectForm, card: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">QR Pay</label>
                      <input className="form-control mono" type="number" step="0.001" min="0" placeholder="0.000" value={collectForm.qr_pay} onChange={e => setCollectForm({ ...collectForm, qr_pay: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Bank Transfer</label>
                      <input className="form-control mono" type="number" step="0.001" min="0" placeholder="0.000" value={collectForm.bank_transfer} onChange={e => setCollectForm({ ...collectForm, bank_transfer: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                      <label className="form-label">Cheque (Pending Clearance)</label>
                      <input className="form-control mono" type="number" step="0.001" min="0" placeholder="0.000" value={collectForm.cheque} onChange={e => setCollectForm({ ...collectForm, cheque: e.target.value })} />
                    </div>
                  </div>
                  {(Number(collectForm.bank_transfer) > 0 || Number(collectForm.cheque) > 0) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                      <input className="form-control" placeholder="Bank Name" value={collectForm.bank_name} onChange={e => setCollectForm({ ...collectForm, bank_name: e.target.value })} />
                      {Number(collectForm.cheque) > 0 && (
                        <>
                          <input className="form-control mono" placeholder="Cheque #" required value={collectForm.cheque_no} onChange={e => setCollectForm({ ...collectForm, cheque_no: e.target.value })} />
                          <input className="form-control" type="date" value={collectForm.cheque_date} onChange={e => setCollectForm({ ...collectForm, cheque_date: e.target.value })} />
                        </>
                      )}
                    </div>
                  )}
                  <div style={{ padding: '7px 10px', marginBottom: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                    <span style={{ fontWeight: 700, color: '#065f46' }}>Total Collection:</span>
                    <strong className="mono" style={{ color: '#065f46', fontSize: 14 }}>{formatMoney(splitTotal)}</strong>
                  </div>
                  <AttachmentUploader attachments={collectAttachments} setAttachments={setCollectAttachments} label="Attach Cheque Photo / Payment Screenshot" />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button type="submit" className="btn btn-emerald btn-sm" style={{ flex: 1 }}>Save Collection</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { setCollectForm(emptyCollectForm); setCollectAttachments([]); }}>Cancel</button>
                  </div>
                </form>
                );
              })()}

              {ledgerStatement && (() => {
                const allEntries = ledgerStatement.entries || [];
                const openingBal = stmtFromDate
                  ? allEntries
                      .filter(e => String(e.created_at || '').slice(0, 10) < stmtFromDate)
                      .reduce((sum, e) => sum + (Number(e.debit || 0) - Number(e.credit || 0)), 0)
                  : 0;
                const filteredEntries = allEntries
                  .filter(e => {
                    const d = String(e.created_at || '').slice(0, 10);
                    if (stmtFromDate && d < stmtFromDate) return false;
                    if (stmtToDate && d > stmtToDate) return false;
                    return true;
                  })
                  .sort((a, b) => {
                    const da = String(a.created_at || '');
                    const db = String(b.created_at || '');
                    if (db !== da) return db.localeCompare(da);
                    return Number(b.id || 0) - Number(a.id || 0);
                  });

                return (
                <div className="card">
                  <div className="card-title">
                    <span>Statement: {ledgerStatement.shop.shop_name}</span>
                    <button className="btn btn-outline btn-sm" onClick={() => { setLedgerStatement(null); setStmtFromDate(''); setStmtToDate(''); }}>Close</button>
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    Net Owed: <strong className="mono">{formatMoney(ledgerStatement.balance)}</strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10, padding: 8, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%' }}>
                      <input type="date" className="form-control" style={{ fontSize: 11.5, padding: '4px 6px' }} value={stmtFromDate} onChange={e => setStmtFromDate(e.target.value)} />
                      <input type="date" className="form-control" style={{ fontSize: 11.5, padding: '4px 6px' }} value={stmtToDate} onChange={e => setStmtToDate(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { const t = localDateStr(); setStmtFromDate(t); setStmtToDate(t); }}>Today</button>
                      <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { const n = new Date(); const p = new Date(n); p.setDate(n.getDate() - 6); setStmtFromDate(localDateStr(p)); setStmtToDate(localDateStr(n)); }}>7D</button>
                      {(stmtFromDate || stmtToDate) && (
                        <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setStmtFromDate(''); setStmtToDate(''); }}>Clear</button>
                      )}
                    </div>
                  </div>
                  {stmtFromDate && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', marginBottom: 8, borderRadius: 8, background: openingBal > 0 ? '#fff1f2' : openingBal < 0 ? '#ecfdf5' : '#f8fafc', border: `1px solid ${openingBal > 0 ? '#fecdd3' : openingBal < 0 ? '#a7f3d0' : '#e2e8f0'}`, fontSize: 11.5 }}>
                      <span style={{ fontWeight: 700, color: '#334155' }}>
                        Opening Balance ({openingBal > 0 ? 'Debit / Dr' : openingBal < 0 ? 'Credit / Cr' : 'Settled'})
                      </span>
                      <strong className="mono" style={{ color: openingBal > 0 ? '#be123c' : openingBal < 0 ? '#059669' : '#475569' }}>
                        {openingBal > 0 ? '+' : openingBal < 0 ? '-' : ''}{formatMoney(Math.abs(openingBal))}
                      </strong>
                    </div>
                  )}
                  {filteredEntries.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 14, fontSize: 12, color: '#64748b' }}>
                      No statement entries in selected date range.
                    </div>
                  ) : filteredEntries.map(e => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 11.5, gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{e.entry_type.replace(/_/g, ' ').toUpperCase()}</div>
                        <div className="mono" style={{ fontSize: 10.5, color: '#475569' }}>{formatDateTime(e.created_at)}</div>
                        <div style={{ color: '#64748b' }}>{e.notes}</div>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {Number(e.debit) > 0 && <div className="mono" style={{ color: '#be123c', fontWeight: 700 }}>+{Number(e.debit).toFixed(3)}</div>}
                        {Number(e.credit) > 0 && <div className="mono" style={{ color: '#059669', fontWeight: 700 }}>-{Number(e.credit).toFixed(3)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="mobile-bottom-nav">
          <button className={`mobile-bottom-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => switchTab('dashboard')}><LayoutDashboard size={18} />Dash</button>
          <button className={`mobile-bottom-btn ${activeTab === 'route' ? 'active' : ''}`} onClick={() => switchTab('route')}><MapPin size={18} />Route</button>
          <button className={`mobile-bottom-btn ${activeTab === 'pos' ? 'active' : ''}`} onClick={() => switchTab('pos')}><ShoppingBag size={18} />Billing</button>
          <button className={`mobile-bottom-btn ${activeTab === 'v2v' ? 'active' : ''}`} onClick={() => switchTab('v2v')}>
            <ArrowRightLeft size={18} />
            <span>Transfers{pendingIncoming.length > 0 ? ` (${pendingIncoming.length})` : ''}</span>
          </button>
          <button className={`mobile-bottom-btn ${activeTab === 'closing' ? 'active' : ''}`} onClick={() => switchTab('closing')}><Clock size={18} />Closing</button>
        </nav>
      </div>

      {/* 80mm Thermal Print Modal */}
      {printReceipt && (
        <div className="modal-overlay" onClick={() => setPrintReceipt(null)}>
          <div className="modal-card" style={{ maxWidth: 350 }} onClick={e => e.stopPropagation()}>
            <div className="thermal-receipt-80mm">
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 13 }}>{vendor?.company_name}</div>
              <div style={{ textAlign: 'center', fontSize: 10, marginBottom: 6 }}>
                {printReceipt.invoice_type === 'return' ? 'CREDIT NOTE / RETURN' : 'TAX INVOICE'} ({printReceipt.vat_mode.toUpperCase()})
              </div>
              <div>Inv: {printReceipt.invoice_no}</div>
              <div>Shop: {printReceipt.shop_name}</div>
              <div>Van: {van?.van_name}</div>
              <hr style={{ margin: '6px 0', borderStyle: 'dashed' }} />
              {printReceipt.lines.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{l.name} x{l.qty}</span>
                  <span>{(l.qty * l.unit_price).toFixed(3)}</span>
                </div>
              ))}
              <hr style={{ margin: '6px 0', borderStyle: 'dashed' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>VAT:</span><span>{Number(printReceipt.vat_amount).toFixed(3)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 12 }}><span>TOTAL:</span><span>{formatMoney(printReceipt.total_amount)}</span></div>
              {(printReceipt.payments || []).length > 0 && (
                <div style={{ marginTop: 6, fontSize: 10 }}>
                  {printReceipt.payments.map((p, idx) => (
                    <div key={idx}>{p.payment_method.toUpperCase()}: {Number(p.amount).toFixed(3)}</div>
                  ))}
                </div>
              )}
              {(printReceipt.attachments || []).length > 0 && (
                <div style={{ marginTop: 6, fontSize: 10, borderTop: '1px dashed #cbd5e1', paddingTop: 4 }}>
                  Attachments Saved: {printReceipt.attachments.length} file(s)
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={() => window.print()}><Printer size={14} /> Print 80mm</button>
              {printReceipt.invoice_id && (
                <button
                  type="button"
                  className="btn btn-emerald btn-sm"
                  onClick={() => shareViaWhatsApp({
                    share_type: 'invoice',
                    invoice_id: printReceipt.invoice_id,
                    phone: printReceipt.shop_phone,
                    label: `Bill ${printReceipt.invoice_no} (${printReceipt.shop_name})`,
                  }).catch(e => setErr(e.message))}
                >
                  <Share2 size={14} /> WhatsApp Bill
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={() => setPrintReceipt(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Today's Shop Card -> Bills, Items, Collection & Correction Modal */}
      {selectedReportShop && (
        <div className="modal-overlay" onClick={() => setSelectedReportShop(null)}>
          <div className="modal-card" style={{ maxWidth: 460, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{selectedReportShop.shop_name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Today&apos;s Bills &amp; Collections ({(selectedReportShop.invoices || []).length})</div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedReportShop(null)}><X size={14} /></button>
            </div>

            {(selectedReportShop.invoices || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 12.5 }}>
                No bills generated for this shop today.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedReportShop.invoices.map(inv => (
                  <div key={inv.id} style={{ padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <span className="mono" style={{ fontWeight: 800, fontSize: 12.5 }}>{inv.invoice_no}</span>
                        {Number(inv.is_corrected) === 1 && (
                          <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 9.5 }}>Corrected</span>
                        )}
                      </div>
                      <span className="mono" style={{ fontWeight: 800, color: '#2563eb' }}>{formatMoney(inv.total_amount)}</span>
                    </div>

                    <div style={{ background: '#ffffff', padding: 6, borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>BILL ITEMS</div>
                      {(inv.lines || []).map((l, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '2px 0' }}>
                          <span>{l.item_name} x{Number(l.qty)}</span>
                          <span className="mono">{Number(l.line_total).toFixed(3)}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {(inv.payments || []).map((p, idx) => (
                        <span key={idx} className="badge badge-emerald" style={{ fontSize: 10 }}>
                          {p.payment_method.replace('_', ' ').toUpperCase()}: {Number(p.amount).toFixed(3)}
                        </span>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-amber btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => startBillCorrection(inv, selectedReportShop)}
                      >
                        Correct Bill
                      </button>
                      <button
                        type="button"
                        className="btn btn-emerald btn-sm"
                        onClick={() => shareViaWhatsApp({
                          share_type: 'invoice',
                          invoice_id: inv.id,
                          phone: selectedReportShop.phone,
                          label: `Bill ${inv.invoice_no} (${selectedReportShop.shop_name})`,
                        }).catch(e => setErr(e.message))}
                      >
                        <Share2 size={13} /> WhatsApp
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shop All Transactions History & Ledger Modal */}
      {shopHistoryModal && (
        <div className="modal-overlay" onClick={() => setShopHistoryModal(null)}>
          <div className="modal-card" style={{ maxWidth: 460, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{shopHistoryModal.shop.shop_name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{shopHistoryModal.shop.shop_code} &bull; {shopHistoryModal.shop.route_name}</div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShopHistoryModal(null)}><X size={14} /></button>
            </div>

            <div className="grid-2" style={{ gap: 8, marginBottom: 10 }}>
              <div style={{ padding: 8, background: '#fff1f2', borderRadius: 8, border: '1px solid #fecdd3' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#be123c' }}>Closing Balance Owed</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: '#9f1239' }}>{formatMoney(shopHistoryModal.balance)}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>Opening: {formatMoney(shopHistoryModal.opening_balance)}</div>
              </div>
              <div style={{ padding: 8, background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e' }}>Pending Cheques</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: '#78350f' }}>{formatMoney(shopHistoryModal.pending_cheques)}</div>
              </div>
            </div>

            {/* Date Between Filter + Print + WhatsApp Share */}
            <div style={{ padding: 8, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>From Date</label>
                  <input type="date" className="form-control" style={{ padding: '4px 6px', fontSize: 11.5 }} value={ledgerFromDate} onChange={e => setLedgerFromDate(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>To Date</label>
                  <input type="date" className="form-control" style={{ padding: '4px 6px', fontSize: 11.5 }} value={ledgerToDate} onChange={e => setLedgerToDate(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openShopHistory(shopHistoryModal.shop.id, ledgerFromDate, ledgerToDate)}>Filter</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={async () => {
                  try {
                    const res = await api.post('/api/share-links', {
                      share_type: 'ledger',
                      shop_id: shopHistoryModal.shop.id,
                      from_date: ledgerFromDate || null,
                      to_date: ledgerToDate || null,
                    });
                    window.open(`${window.location.origin}${res.share_path}`, '_blank', 'noopener,noreferrer');
                  } catch (e) { setErr(e.message); }
                }}><Printer size={13} /> Print</button>
                <button type="button" className="btn btn-emerald btn-sm" style={{ marginLeft: 'auto' }} onClick={() => {
                  const latestInv = (shopHistoryModal.invoices || [])[0];
                  return shareViaWhatsApp({
                    share_type: 'ledger',
                    shop_id: shopHistoryModal.shop.id,
                    bill_invoice_id: latestInv?.id || null,
                    bill_label: latestInv ? `Purchase Bill (${latestInv.invoice_no})` : 'Purchase Bill',
                    from_date: ledgerFromDate || null,
                    to_date: ledgerToDate || null,
                    phone: shopHistoryModal.shop.phone,
                    label: `Ledger Statement for ${shopHistoryModal.shop.shop_name}`,
                  }).catch(e => setErr(e.message));
                }}><Share2 size={13} /> WhatsApp</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
              <button type="button" className={`btn btn-sm ${historyTab === 'ledger' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setHistoryTab('ledger')}>
                Ledger ({(shopHistoryModal.entries || []).length})
              </button>
              <button type="button" className={`btn btn-sm ${historyTab === 'invoices' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setHistoryTab('invoices')}>
                Invoices ({(shopHistoryModal.invoices || []).length})
              </button>
              <button type="button" className={`btn btn-sm ${historyTab === 'cheques' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setHistoryTab('cheques')}>
                Cheques ({(shopHistoryModal.cheques || []).length})
              </button>
            </div>

            {historyTab === 'ledger' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(shopHistoryModal.entries || []).map(e => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 11.5 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{e.entry_type.replace(/_/g, ' ').toUpperCase()} {e.ref_no ? `• ${e.ref_no}` : ''}</div>
                      <div style={{ color: '#64748b', fontSize: 10.5 }}>{e.notes}</div>
                      <div style={{ color: '#94a3b8', fontSize: 10 }}>{formatDateTime(e.created_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {Number(e.debit) > 0 && <div className="mono" style={{ color: '#be123c', fontWeight: 700 }}>+{Number(e.debit).toFixed(3)}</div>}
                      {Number(e.credit) > 0 && <div className="mono" style={{ color: '#059669', fontWeight: 700 }}>-{Number(e.credit).toFixed(3)}</div>}
                      <div className="mono" style={{ fontSize: 10, color: '#475569' }}>Bal: {Number(e.running_balance).toFixed(3)}</div>
                    </div>
                  </div>
                ))}
                {(shopHistoryModal.entries || []).length === 0 && <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 12 }}>No ledger entries yet.</div>}
              </div>
            )}

            {historyTab === 'invoices' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(shopHistoryModal.invoices || []).map(inv => (
                  <div key={inv.id} style={{ padding: 8, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                      <span className="mono">{inv.invoice_no} ({inv.invoice_type.toUpperCase()})</span>
                      <span className="mono" style={{ color: '#2563eb' }}>{formatMoney(inv.total_amount)}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>{formatDateTime(inv.created_at)}</div>
                    {(inv.lines || []).map((l, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#475569', marginTop: 2 }}>
                        <span>{l.item_name} x{Number(l.qty)}</span>
                        <span className="mono">{Number(l.line_total).toFixed(3)}</span>
                      </div>
                    ))}
                    {(inv.payments || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {inv.payments.map((p, idx) => (
                          <span key={idx} className="badge badge-slate" style={{ fontSize: 9.5 }}>
                            {p.payment_method.replace('_', ' ').toUpperCase()}: {Number(p.amount).toFixed(3)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {(shopHistoryModal.invoices || []).length === 0 && <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 12 }}>No invoices yet.</div>}
              </div>
            )}

            {historyTab === 'cheques' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(shopHistoryModal.cheques || []).map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 11.5 }}>
                    <div>
                      <div className="mono" style={{ fontWeight: 700 }}>#{c.cheque_no || c.reference_no || c.id} ({c.bank_name || 'Bank'})</div>
                      <div style={{ fontSize: 10.5, color: '#64748b' }}>Date: {c.cheque_date || '-'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontWeight: 700 }}>{formatMoney(c.amount)}</div>
                      <span className={`badge ${c.cheque_status === 'cleared' ? 'badge-emerald' : c.cheque_status === 'bounced' ? 'badge-rose' : 'badge-amber'}`} style={{ fontSize: 9.5 }}>
                        {c.cheque_status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
                {(shopHistoryModal.cheques || []).length === 0 && <div style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 12 }}>No cheques recorded for this shop.</div>}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmPopup}
        title={confirmPopup?.title}
        message={confirmPopup?.message}
        confirmText={confirmPopup?.confirmText}
        variant={confirmPopup?.variant || 'danger'}
        loading={popupLoading}
        onCancel={() => !popupLoading && setConfirmPopup(null)}
        onConfirm={async () => {
          if (!confirmPopup?.action) return;
          setPopupLoading(true);
          try {
            await confirmPopup.action();
          } catch (e2) {
            setErr(e2.message);
          } finally {
            setPopupLoading(false);
            setConfirmPopup(null);
          }
        }}
      />
      {addShopModal && (
        <div className="modal-overlay" onClick={() => setAddShopModal(false)}>
          <div className="modal-card" style={{ maxWidth: 440, width: '95%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>Add Shop to My Van</h3>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setAddShopModal(false)}><X size={14} /></button>
            </div>
            <form onSubmit={submitVanShop} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Shop Name</label>
                <input className="form-control" required value={addShopForm.shop_name} onChange={e => setAddShopForm({ ...addShopForm, shop_name: e.target.value })} placeholder="e.g. Al-Noor Cold Store" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Owner / Shopkeeper Name</label>
                <input className="form-control" value={addShopForm.owner_name} onChange={e => setAddShopForm({ ...addShopForm, owner_name: e.target.value })} placeholder="Contact person" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Shopkeeper Mobile # (For Location Link)</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <select className="form-control" style={{ width: 96, padding: '4px 6px', fontSize: 12 }} value={vanCountryCode} onChange={e => setVanCountryCode(e.target.value)}>
                    {GULF_INDIA_COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.short} {c.code}</option>)}
                  </select>
                  <input className="form-control mono" required value={addShopForm.phone} onChange={e => setAddShopForm({ ...addShopForm, phone: e.target.value })} placeholder="33112233" />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Address / Area</label>
                <input className="form-control" value={addShopForm.address} onChange={e => setAddShopForm({ ...addShopForm, address: e.target.value })} placeholder="Area, building, road" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setAddShopModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-emerald btn-sm"><Plus size={14} /> Save Shop &amp; Get Link</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {changeShiftOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !changingShift && setChangeShiftOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setErr('');
              setMsg('');
              setChangingShift(true);
              try {
                const res = await api.post('/api/shifts/change', {
                  shift_name: editShiftName,
                  shift_type: editShiftType,
                });
                setShiftData((prev) => ({
                  ...prev,
                  shift: prev?.shift ? { ...prev.shift, shift_name: res.shift_name, shift_type: res.shift_type } : prev?.shift,
                }));
                setMsg(`Active shift changed to ${res.shift_name} (${res.shift_type === 'multi_day' ? 'Multi-Day' : 'Same-Day'})`);
                setChangeShiftOpen(false);
                load();
              } catch (e2) {
                setErr(e2.message);
              } finally {
                setChangingShift(false);
              }
            }}
            className="card"
            style={{
              width: '100%',
              maxWidth: 380,
              margin: 0,
              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.28)',
              borderTop: '4px solid #059669',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Change Active Shift</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => !changingShift && setChangeShiftOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Shift Name</label>
              <select
                className="form-control"
                value={editShiftName}
                onChange={(e) => setEditShiftName(e.target.value)}
              >
                {Array.from(new Set([
                  'Morning Shift',
                  'Evening Shift',
                  'Multi-Day Route',
                  ...getVendorShifts(vendor).map((s) => s.name),
                  editShiftName,
                ].filter(Boolean))).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Shift Mode</label>
              <select
                className="form-control"
                value={editShiftType}
                onChange={(e) => setEditShiftType(e.target.value)}
              >
                <option value="same_day">Same-Day</option>
                <option value="multi_day">Multi-Day</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-outline btn-sm" disabled={changingShift} onClick={() => setChangeShiftOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-emerald btn-sm" disabled={changingShift}>
                {changingShift ? 'Updating...' : 'Save Shift'}
              </button>
            </div>
          </form>
        </div>
      )}

      {priceModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setPriceModal(null)}
        >
          <form
            onSubmit={savePriceModal}
            className="card"
            style={{
              width: '100%',
              maxWidth: 380,
              margin: 0,
              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.28)',
              borderTop: '4px solid #2563eb',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Adjust Selling Price</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1e40af', marginTop: 2 }}>{priceModal.name}</div>
                <div className="mono" style={{ fontSize: 11, color: '#64748b' }}>{priceModal.sku} &bull; Qty: {priceModal.qty}</div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setPriceModal(null)}>
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '8px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 10, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#475569' }}>Minimum Selling Price:</span>
                <strong className="mono" style={{ color: '#0f172a' }}>{formatMoney(priceModal.min_price)}</strong>
              </div>
              {Number(priceInput) > priceModal.min_price + 0.0005 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ color: '#065f46', fontWeight: 600 }}>Extra Markup / Unit:</span>
                  <strong className="mono" style={{ color: '#059669' }}>+{formatMoney(Number(priceInput) - priceModal.min_price)}</strong>
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">New Selling Price ({vendor?.currency || 'BHD'})</label>
              <input
                type="number"
                step="0.001"
                min={priceModal.min_price}
                className="form-control mono"
                autoFocus
                value={priceInput}
                onChange={(e) => {
                  setPriceInput(e.target.value);
                  setPriceErr('');
                }}
              />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                Cannot be less than {formatMoney(priceModal.min_price)}. You can increase the price and sell.
              </div>
            </div>

            {priceErr && (
              <div style={{ padding: '7px 10px', borderRadius: 7, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
                {priceErr}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 12.5 }}>
              <span style={{ color: '#475569' }}>Updated Line Total:</span>
              <strong className="mono" style={{ fontSize: 14, color: '#0f172a' }}>
                {formatMoney((Number(priceInput) || 0) * Number(priceModal.qty || 1))}
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setPriceModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm">Apply Price</button>
            </div>
          </form>
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 76,
            transform: 'translateX(-50%)',
            zIndex: 9999,
            maxWidth: 'calc(100vw - 28px)',
            width: 'max-content',
            minWidth: 240,
            background: toast.type === 'error' ? '#991b1b' : '#065f46',
            color: '#ffffff',
            padding: '10px 14px',
            borderRadius: 10,
            boxShadow: '0 10px 25px rgba(15, 23, 42, 0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1.35,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {toast.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            <span>{toast.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
            style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.85 }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

