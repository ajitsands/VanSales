import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePersistedState } from '../hooks/usePersistedState';
import DataTable from '../components/DataTable';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import { ArrowRightLeft, CheckCircle2, AlertTriangle, Layers, Plus, Trash2, Send, Calendar, ChevronRight, ChevronDown } from 'lucide-react';

export default function InventoryTransfersPage() {
  const { formatMoney, formatDate, formatDateTime } = useAuth();
  const [tab, setTab] = usePersistedState('inv_tab', 'batches');
  const [dispatchSubTab, setDispatchSubTab] = usePersistedState('inv_dispatch_subtab', 'requests');
  const [fromDate, setFromDate] = usePersistedState('inv_from_date', '');
  const [toDate, setToDate] = usePersistedState('inv_to_date', '');
  const [expandedTransferVans, setExpandedTransferVans] = useState({});
  const [expandedRequestVans, setExpandedRequestVans] = useState({});
  const [expandedCancelledVans, setExpandedCancelledVans] = useState({});
  const [stockReportSubTab, setStockReportSubTab] = usePersistedState('inv_stock_report_subtab', 'store');
  const [expandedStockVans, setExpandedStockVans] = useState({});
  const [storeMoveVanId, setStoreMoveVanId] = usePersistedState('inv_store_move_van', '');
  const [storeMoveQtys, setStoreMoveQtys] = useState({});
  const [vanActionQtys, setVanActionQtys] = useState({});
  const [batches, setBatches] = useState([]);
  const [requests, setRequests] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [damages, setDamages] = useState([]);
  const [vans, setVans] = useState([]);
  const [items, setItems] = useState([]);
  const [dispatchForm, setDispatchForm] = usePersistedState('inv_dispatch_form', { to_van_id: '', item_id: '', qty: 10, notes: '' });
  const [stagedLines, setStagedLines] = usePersistedState('inv_staged_lines', []);
  const [reqTransferQtys, setReqTransferQtys] = usePersistedState('inv_req_qtys', {});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [confirmPopup, setConfirmPopup] = useState(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [transferItemsModal, setTransferItemsModal] = useState(null);
  const [transferStatusTab, setTransferStatusTab] = useState('waiting');

  const load = async () => {
    try {
      const [b, r, t, d, v, i] = await Promise.all([
        api.get('/api/inventory/batches'),
        api.get('/api/requests'),
        api.get('/api/transfers'),
        api.get('/api/returns-damages'),
        api.get('/api/vans'),
        api.get('/api/items'),
      ]);
      setBatches(b); setRequests(r); setTransfers(t); setDamages(d); setVans(v); setItems(i);
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    const onOpenRequests = () => {
      setTab('dispatch');
      setDispatchSubTab('requests');
      setFromDate('');
      setToDate('');
      load();
    };
    window.addEventListener('vansales:open-requests', onOpenRequests);
    return () => {
      clearInterval(timer);
      window.removeEventListener('vansales:open-requests', onOpenRequests);
    };
  }, []);

  const getMainAvail = (itemId) => {
    const fromBatches = batches
      .filter(b => b.location_type === 'main_store' && String(b.item_id) === String(itemId))
      .reduce((acc, b) => acc + Number(b.qty_available || 0), 0);
    if (fromBatches > 0) return fromBatches;
    const it = items.find(x => String(x.id) === String(itemId));
    return Number(it?.main_store_qty || 0);
  };

  const getVanAvail = (vanId, itemId) => {
    if (!vanId) return 0;
    return batches
      .filter(b => b.location_type === 'van' && String(b.van_id) === String(vanId) && String(b.item_id) === String(itemId))
      .reduce((acc, b) => acc + Number(b.qty_available || 0), 0);
  };

  const addToTransferList = (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    if (!dispatchForm.item_id || Number(dispatchForm.qty) <= 0) {
      setErr('Please select an item and enter a valid quantity.');
      return;
    }
    const it = items.find(x => String(x.id) === String(dispatchForm.item_id));
    if (!it) return;
    setStagedLines(prev => {
      const existing = prev.find(l => String(l.item_id) === String(it.id));
      if (existing) {
        return prev.map(l => String(l.item_id) === String(it.id) ? { ...l, qty: Number(l.qty) + Number(dispatchForm.qty) } : l);
      }
      return [...prev, { item_id: it.id, sku: it.sku, name: it.name, uom: it.uom || 'PCS', qty: Number(dispatchForm.qty) }];
    });
  };

  const handleBulkDispatchStaged = async () => {
    setErr(''); setMsg('');
    if (!dispatchForm.to_van_id || stagedLines.length === 0) {
      setErr('Select a Destination Van and add at least one item to the Transfer List.');
      return;
    }
    try {
      const res = await api.post('/api/transfers/store-to-van', {
        to_van_id: Number(dispatchForm.to_van_id),
        notes: dispatchForm.notes || 'Bulk Store-to-Van Dispatch',
        lines: stagedLines.map(l => ({ item_id: Number(l.item_id), qty: Number(l.qty) })),
      });
      setMsg(`Bulk Transfer ${res.transfer_no} (OTP: ${res.otp_code}) created & Ready for Pickup in Van Mobile App!`);
      setStagedLines([]);
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const handleDispatch = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      const res = await api.post('/api/transfers/store-to-van', {
        to_van_id: Number(dispatchForm.to_van_id),
        notes: dispatchForm.notes,
        lines: [{ item_id: Number(dispatchForm.item_id), qty: Number(dispatchForm.qty) }],
      });
      setMsg(`Dispatched ${res.transfer_no} (OTP: ${res.otp_code}) — Ready for Pickup in Van Mobile App!`);
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const handleBulkTransferFromRequests = async () => {
    setErr(''); setMsg('');
    const filledByReq = {};
    const usedKeys = [];

    requests.forEach(r => {
      if (r.status !== 'pending' && r.status !== 'partial') return;
      (r.items || []).forEach((x, idx) => {
        const key = `${r.id}_${x.item_id}_${idx}`;
        const tQty = Number(reqTransferQtys[key] || 0);
        if (tQty > 0) {
          const targetVanId = dispatchForm.to_van_id ? Number(dispatchForm.to_van_id) : Number(r.van_id);
          const groupKey = `${targetVanId}`;
          if (!filledByReq[groupKey]) {
            filledByReq[groupKey] = { vanId: targetVanId, requestId: r.id, requestNos: [r.request_no || `#${r.id}`], lines: [] };
          } else if (r.request_no && !filledByReq[groupKey].requestNos.includes(r.request_no)) {
            filledByReq[groupKey].requestNos.push(r.request_no);
          }
          const existingLine = filledByReq[groupKey].lines.find(l => l.item_id === Number(x.item_id));
          if (existingLine) {
            existingLine.qty += tQty;
          } else {
            filledByReq[groupKey].lines.push({ item_id: Number(x.item_id), qty: tQty });
          }
          usedKeys.push(key);
        }
      });
    });

    const groupKeys = Object.keys(filledByReq);
    if (groupKeys.length === 0) {
      setErr('Enter Transfer Qty (> 0) for at least one item in the Request List.');
      return;
    }

    try {
      const createdTransfers = [];
      for (const gk of groupKeys) {
        const group = filledByReq[gk];
        const res = await api.post('/api/transfers/store-to-van', {
          to_van_id: Number(group.vanId),
          request_id: group.requestId,
          notes: `Request Fulfillment (${(group.requestNos || []).join(', ')})`,
          lines: group.lines,
        });
        createdTransfers.push(`${res.transfer_no} (OTP: ${res.otp_code})`);
      }
      setReqTransferQtys(prev => {
        const next = { ...prev };
        usedKeys.forEach(k => delete next[k]);
        return next;
      });
      setMsg(`Transfer Ready for Pickup: ${createdTransfers.join(' | ')}. Van driver can now confirm in the Mobile App.`);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const approveRequest = async (reqRow) => {
    setErr(''); setMsg('');
    try {
      const res = await api.post('/api/transfers/store-to-van', {
        to_van_id: reqRow.van_id,
        request_id: reqRow.id,
        notes: `Fulfilling ${reqRow.request_no}`,
        lines: reqRow.items,
      });
      setMsg(`Request ${reqRow.request_no} dispatched as ${res.transfer_no} (OTP: ${res.otp_code})`);
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const qcDamage = async (id, action) => {
    setErr(''); setMsg('');
    try {
      await api.post(`/api/returns-damages/${id}/qc`, { action });
      setMsg(`Return/Damage #${id} marked as ${action}`);
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const inDateRange = (ts) => {
    if (!fromDate && !toDate) return true;
    const d = String(ts || '').slice(0, 10);
    if (!d) return false;
    return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
  };
  const setTodayRange = () => {
    const t = new Date().toLocaleDateString('en-CA');
    setFromDate(t);
    setToDate(t);
  };
  const setLast7DaysRange = () => {
    const now = new Date();
    const prev = new Date(now);
    prev.setDate(now.getDate() - 6);
    setFromDate(prev.toLocaleDateString('en-CA'));
    setToDate(now.toLocaleDateString('en-CA'));
  };

  const cancelRequest = (reqId, reqNo) => {
    setConfirmPopup({
      title: 'Cancel Stock Request',
      message: `Are you sure you want to cancel request ${reqNo}? It will move to the Cancel List.`,
      confirmText: 'Yes, Cancel Request',
      variant: 'warning',
      action: async () => {
        setErr(''); setMsg('');
        await api.post(`/api/requests/${reqId}/cancel`, {});
        setMsg(`Request ${reqNo} cancelled and moved to Cancel List.`);
        load();
      },
    });
  };

  const cancelRequestBalance = (reqId, reqNo, itemId = null, itemLabel = '') => {
    const scopeLabel = itemId ? `${itemLabel} in ${reqNo}` : `all remaining items in ${reqNo}`;
    setConfirmPopup({
      title: 'Cancel Remaining Balance & Finish',
      message: `Close the remaining pending balance for ${scopeLabel}? Already delivered/accepted quantities will be preserved and the request item will be marked finished.`,
      confirmText: 'Cancel Balance & Finish',
      variant: 'warning',
      action: async () => {
        setErr(''); setMsg('');
        await api.post(`/api/requests/${reqId}/cancel-balance`, itemId ? { item_id: itemId } : {});
        setMsg(`Remaining balance closed for ${scopeLabel}.`);
        load();
      },
    });
  };

  const deleteCancelledRequest = (reqId, reqNo) => {
    setConfirmPopup({
      title: 'Delete Cancelled Request',
      message: `Permanently delete cancelled request ${reqNo}? This cannot be undone.`,
      confirmText: 'Delete Permanently',
      variant: 'danger',
      action: async () => {
        setErr(''); setMsg('');
        await api.post(`/api/requests/${reqId}/delete`, {});
        setMsg(`Cancelled request ${reqNo} permanently deleted.`);
        load();
      },
    });
  };

  const groupRequestsByVan = (list) => Object.values(
    list.reduce((acc, r) => {
      const key = String(r.van_id || r.van_name || 'unknown');
      if (!acc[key]) {
        acc[key] = {
          id: key,
          van_id: r.van_id,
          van_name: r.van_name || `Van #${r.van_id || '-'}`,
          requestCount: 0,
          pendingCount: 0,
          dispatchedCount: 0,
          totalRequestedQty: 0,
          totalDeliveredQty: 0,
          totalAcceptedQty: 0,
          totalBalanceQty: 0,
          latestDate: '',
          rows: [],
        };
      }
      acc[key].requestCount += 1;
      if (r.status === 'dispatched' || r.status === 'completed') acc[key].dispatchedCount += 1;
      else acc[key].pendingCount += 1;
      const d = String(r.created_at || '');
      if (d > acc[key].latestDate) acc[key].latestDate = d;
      (r.items || []).forEach((x, idx) => {
        const it = items.find(i => Number(i.id) === Number(x.item_id));
        const rowKey = `${r.id}_${x.item_id}_${idx}`;
        const reqQty = Number(x.requested_qty ?? x.qty ?? 0);
        const delQty = Number(x.delivered_qty ?? x.dispatched_qty ?? 0);
        const accQty = Number(x.accepted_qty ?? x.received_qty ?? 0);
        const canQty = Number(x.cancelled_qty ?? 0);
        const balQty = Number(x.balance_qty ?? Math.max(0, reqQty - delQty - canQty));
        acc[key].totalRequestedQty += reqQty;
        acc[key].totalDeliveredQty += delQty;
        acc[key].totalAcceptedQty += accQty;
        acc[key].totalBalanceQty += balQty;
        acc[key].rows.push({
          id: rowKey,
          request_id: r.id,
          request_no: r.request_no,
          created_at: r.created_at,
          van_id: r.van_id,
          van_name: r.van_name,
          status: r.status,
          item_status: x.item_status || r.status,
          item_id: x.item_id,
          sku: x.sku || it?.sku || `#${x.item_id}`,
          item_name: x.item_name || it?.name || `Item #${x.item_id}`,
          uom: x.uom || it?.uom || 'PCS',
          main_avail: getMainAvail(x.item_id),
          van_avail: getVanAvail(r.van_id, x.item_id),
          required_qty: reqQty,
          requested_qty: reqQty,
          delivered_qty: delQty,
          accepted_qty: accQty,
          ready_pickup_qty: Number(x.ready_pickup_qty ?? 0),
          cancelled_qty: canQty,
          balance_qty: balQty,
          row_key: rowKey,
        });
      });
      return acc;
    }, {})
  );

  const filteredRequests = requests.filter((r) => inDateRange(r.created_at));
  const activeRequests = filteredRequests.filter((r) => r.status !== 'cancelled');
  const cancelledRequests = filteredRequests.filter((r) => r.status === 'cancelled');
  const vanRequestGroups = groupRequestsByVan(activeRequests);
  const vanCancelledGroups = groupRequestsByVan(cancelledRequests);
  const toggleRequestVan = (vanKey) => {
    setExpandedRequestVans((prev) => ({ ...prev, [vanKey]: !prev[vanKey] }));
  };
  const toggleCancelledVan = (vanKey) => {
    setExpandedCancelledVans((prev) => ({ ...prev, [vanKey]: !prev[vanKey] }));
  };

  const filteredStoreToVanTransfers = transfers.filter((t) => t.transfer_type === 'store_to_van' && inDateRange(t.created_at));
  const waitingStoreToVan = filteredStoreToVanTransfers.filter((t) => t.status === 'pending_confirm');
  const acceptedStoreToVan = filteredStoreToVanTransfers.filter((t) => t.status === 'completed');
  const activeStoreToVanList = transferStatusTab === 'waiting' ? waitingStoreToVan : acceptedStoreToVan;
  const vanTransferGroups = Object.values(
    activeStoreToVanList.reduce((acc, t) => {
      const key = String(t.to_van_id || t.to_van_name || 'unknown');
      if (!acc[key]) {
        acc[key] = {
          id: key,
          van_id: t.to_van_id,
          van_name: t.to_van_name || `Van #${t.to_van_id || '-'}`,
          transfers: [],
          pendingCount: 0,
          confirmedCount: 0,
          totalQty: 0,
          latestDate: '',
        };
      }
      acc[key].transfers.push(t);
      if (t.status === 'completed') acc[key].confirmedCount += 1;
      else acc[key].pendingCount += 1;
      acc[key].totalQty += (t.lines || []).reduce((s, l) => s + Number(l.qty || 0), 0);
      const d = String(t.created_at || '');
      if (d > acc[key].latestDate) acc[key].latestDate = d;
      return acc;
    }, {})
  );
  const toggleTransferVan = (vanKey) => {
    setExpandedTransferVans((prev) => ({ ...prev, [vanKey]: !prev[vanKey] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>FIFO/FEFO Inventory, Transfers &amp; Damage QC</h2>
          <p style={{ fontSize: 12.5, color: '#64748b' }}>Real-time batch layers, Store-to-Van dispatches, Van-to-Van transfers, and return inspections.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${tab === 'batches' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('batches')}>FIFO/FEFO Batches ({batches.length})</button>
          <button className={`btn btn-sm ${tab === 'stock_report' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('stock_report')}>Stock &amp; Valuation Report</button>
          <button className={`btn btn-sm ${tab === 'dispatch' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('dispatch')}>Requests &amp; Dispatch ({requests.filter(r => r.status === 'pending').length})</button>
          <button className={`btn btn-sm ${tab === 'transfers' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('transfers')}>All Transfers ({transfers.length})</button>
          <button className={`btn btn-sm ${tab === 'damages' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('damages')}>Returns &amp; Damages ({damages.filter(d => d.qc_status === 'pending_qc').length})</button>
        </div>
      </div>

      {msg && <div className="badge badge-emerald" style={{ padding: '9px 14px', borderRadius: 8 }}>{msg}</div>}
      {err && <div className="badge badge-rose" style={{ padding: '9px 14px', borderRadius: 8 }}>{err}</div>}

      {tab === 'batches' && (
        <div className="card">
          <div className="card-title"><span><Layers size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Active Stock Batches (Sorted by FEFO/FIFO Consumption Order)</span></div>
          <DataTable
            data={batches}
            searchPlaceholder="Search location, SKU, item, batch #..."
            exportFilename="stock-batches.csv"
            columns={[
              {
                key: 'location_type',
                label: 'Location',
                sortValue: (b) => b.location_type === 'main_store' ? 'Main Store' : (b.van_name || ''),
                searchValue: (b) => b.location_type === 'main_store' ? 'Main Store' : (b.van_name || ''),
                render: (b) => (
                  <span className={`badge ${b.location_type === 'main_store' ? 'badge-blue' : 'badge-amber'}`}>
                    {b.location_type === 'main_store' ? 'Main Store' : b.van_name}
                  </span>
                ),
              },
              {
                key: 'sku',
                label: 'SKU & Item',
                sortValue: (b) => `${b.sku} ${b.item_name}`,
                searchValue: (b) => `${b.sku || ''} ${b.item_name || ''}`,
                render: (b) => <><strong>{b.sku}</strong> &mdash; {b.item_name}</>,
              },
              {
                key: 'batch_no',
                label: 'Batch #',
                sortValue: (b) => b.batch_no || '',
                render: (b) => <span className="mono">{b.batch_no}</span>,
              },
              {
                key: 'expiry_date',
                label: 'Expiry Date',
                sortValue: (b) => b.expiry_date || '9999-12-31',
                searchValue: (b) => b.expiry_date ? formatDate(b.expiry_date) : 'No Expiry (FIFO)',
                render: (b) => <span className="mono">{b.expiry_date ? formatDate(b.expiry_date) : 'No Expiry (FIFO)'}</span>,
              },
              {
                key: 'unit_cost',
                label: 'Unit Cost',
                sortValue: (b) => Number(b.unit_cost || 0),
                render: (b) => <span className="mono">{formatMoney(b.unit_cost)}</span>,
              },
              {
                key: 'selling_price',
                label: 'Selling Price',
                sortValue: (b) => Number(b.selling_price || 0),
                render: (b) => <span className="mono" style={{ fontWeight: 700, color: '#059669' }}>{formatMoney(b.selling_price)}</span>,
              },
              {
                key: 'qty_available',
                label: 'Avail Qty',
                sortValue: (b) => Number(b.qty_available || 0),
                render: (b) => <span className="mono" style={{ fontWeight: 800 }}>{Number(b.qty_available)} {b.uom}</span>,
              },
            ]}
          />
        </div>
      )}

      {tab === 'stock_report' && (() => {
        const storeBatches = batches.filter(b => b.location_type === 'main_store' && Number(b.qty_available) > 0);
        const vanBatches = batches.filter(b => b.location_type === 'van' && Number(b.qty_available) > 0);

        const storeItemsMap = {};
        let storeTotalQty = 0;
        let storeBuyingValue = 0;
        let storeSellingValue = 0;

        storeBatches.forEach(b => {
          const qty = Number(b.qty_available || 0);
          const cost = Number(b.unit_cost || 0);
          const sell = Number(b.selling_price || 0);
          const buyVal = qty * cost;
          const sellVal = qty * sell;
          storeTotalQty += qty;
          storeBuyingValue += buyVal;
          storeSellingValue += sellVal;

          const k = String(b.item_id);
          if (!storeItemsMap[k]) {
            storeItemsMap[k] = {
              id: k,
              item_id: b.item_id,
              sku: b.sku,
              item_name: b.item_name,
              uom: b.uom || 'PCS',
              batchCount: 0,
              totalQty: 0,
              buyingValue: 0,
              sellingValue: 0,
            };
          }
          storeItemsMap[k].batchCount += 1;
          storeItemsMap[k].totalQty += qty;
          storeItemsMap[k].buyingValue += buyVal;
          storeItemsMap[k].sellingValue += sellVal;
        });

        const storeItems = Object.values(storeItemsMap).sort((a, b) => String(a.sku).localeCompare(String(b.sku)));

        const vanMap = {};
        let vanTotalQty = 0;
        let vanBuyingValue = 0;
        let vanSellingValue = 0;

        vanBatches.forEach(b => {
          const qty = Number(b.qty_available || 0);
          const cost = Number(b.unit_cost || 0);
          const sell = Number(b.selling_price || 0);
          const buyVal = qty * cost;
          const sellVal = qty * sell;
          vanTotalQty += qty;
          vanBuyingValue += buyVal;
          vanSellingValue += sellVal;

          const vKey = String(b.van_id || b.van_name || 'unknown');
          if (!vanMap[vKey]) {
            vanMap[vKey] = {
              id: vKey,
              van_id: b.van_id,
              van_name: b.van_name || `Van #${b.van_id || '-'}`,
              van_code: b.van_code || '',
              totalQty: 0,
              buyingValue: 0,
              sellingValue: 0,
              itemsMap: {},
            };
          }
          vanMap[vKey].totalQty += qty;
          vanMap[vKey].buyingValue += buyVal;
          vanMap[vKey].sellingValue += sellVal;

          const iKey = String(b.item_id);
          if (!vanMap[vKey].itemsMap[iKey]) {
            vanMap[vKey].itemsMap[iKey] = {
              id: iKey,
              item_id: b.item_id,
              sku: b.sku,
              item_name: b.item_name,
              uom: b.uom || 'PCS',
              batchCount: 0,
              totalQty: 0,
              buyingValue: 0,
              sellingValue: 0,
            };
          }
          vanMap[vKey].itemsMap[iKey].batchCount += 1;
          vanMap[vKey].itemsMap[iKey].totalQty += qty;
          vanMap[vKey].itemsMap[iKey].buyingValue += buyVal;
          vanMap[vKey].itemsMap[iKey].sellingValue += sellVal;
        });

        const vanGroups = Object.values(vanMap).map(vg => ({
          ...vg,
          items: Object.values(vg.itemsMap).sort((a, b) => String(a.sku).localeCompare(String(b.sku))),
        }));

        const grandQty = storeTotalQty + vanTotalQty;
        const grandBuying = storeBuyingValue + vanBuyingValue;
        const grandSelling = storeSellingValue + vanSellingValue;

        const moveSingleStoreItemToVan = async (item) => {
          setErr(''); setMsg('');
          if (!storeMoveVanId) {
            setErr('Please select a Target Van first.');
            return;
          }
          const q = Number(storeMoveQtys[item.item_id] || 0);
          if (q <= 0) {
            setErr(`Enter a valid quantity (> 0) for ${item.sku}.`);
            return;
          }
          try {
            const res = await api.post('/api/transfers/store-to-van', {
              to_van_id: Number(storeMoveVanId),
              notes: `Store Stock Transfer (${item.sku})`,
              lines: [{ item_id: Number(item.item_id), qty: q }],
            });
            setStoreMoveQtys(prev => {
              const next = { ...prev };
              delete next[item.item_id];
              return next;
            });
            setMsg(`Moved ${q} ${item.uom} of ${item.sku} to Van (${res.transfer_no}, OTP: ${res.otp_code}) — Ready for Pickup!`);
            load();
          } catch (e2) {
            setErr(e2.message);
          }
        };

        const moveBulkStoreItemsToVan = async () => {
          setErr(''); setMsg('');
          if (!storeMoveVanId) {
            setErr('Please select a Target Van first.');
            return;
          }
          const lines = storeItems
            .map(it => ({ item_id: Number(it.item_id), qty: Number(storeMoveQtys[it.item_id] || 0) }))
            .filter(l => l.qty > 0);
          if (lines.length === 0) {
            setErr('Enter Move Qty (> 0) in at least one row.');
            return;
          }
          try {
            const res = await api.post('/api/transfers/store-to-van', {
              to_van_id: Number(storeMoveVanId),
              notes: `Bulk Store Stock Transfer (${lines.length} items)`,
              lines,
            });
            setStoreMoveQtys({});
            setMsg(`Bulk Transfer ${res.transfer_no} (OTP: ${res.otp_code}) created for ${lines.length} item(s) — Ready for Pickup!`);
            load();
          } catch (e2) {
            setErr(e2.message);
          }
        };

        const reportStoreItemDamage = async (item) => {
          setErr(''); setMsg('');
          const q = Number(storeMoveQtys[item.item_id] || 0);
          if (q <= 0) {
            setErr(`Enter a valid quantity (> 0) for ${item.sku} to move to Damage.`);
            return;
          }
          try {
            const res = await api.post('/api/returns-damages', {
              location_type: 'main_store',
              item_id: Number(item.item_id),
              qty: q,
              return_type: 'damaged',
              reason_code: 'Store Damage',
              notes: `Damaged in Main Store (${item.sku})`,
            });
            setStoreMoveQtys(prev => {
              const next = { ...prev };
              delete next[item.item_id];
              return next;
            });
            setMsg(res?.message || `${q} ${item.uom} of ${item.sku} moved from Store to Damage QC.`);
            load();
          } catch (e2) {
            setErr(e2.message);
          }
        };

        const reportVanItemAction = async (vanGroup, item, returnType) => {
          setErr(''); setMsg('');
          const key = `${vanGroup.van_id}_${item.item_id}`;
          const q = Number(vanActionQtys[key] || 0);
          if (q <= 0) {
            setErr(`Enter a valid quantity (> 0) for ${item.sku} in ${vanGroup.van_name}.`);
            return;
          }
          try {
            const res = await api.post('/api/returns-damages', {
              location_type: 'van',
              van_id: Number(vanGroup.van_id),
              item_id: Number(item.item_id),
              qty: q,
              return_type: returnType,
              reason_code: returnType === 'good_return' ? 'Van Return to Store' : 'Van Damage',
              notes: `${returnType === 'good_return' ? 'Good Return' : 'Damaged'} from ${vanGroup.van_name} (${item.sku})`,
            });
            setVanActionQtys(prev => {
              const next = { ...prev };
              delete next[key];
              return next;
            });
            setMsg(res?.message || `${q} ${item.uom} of ${item.sku} logged as ${returnType.replace('_', ' ')} from ${vanGroup.van_name}.`);
            load();
          } catch (e2) {
            setErr(e2.message);
          }
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Top Summary KPI Cards */}
            <div className="grid-3">
              <div className="card" style={{ borderLeft: '4px solid #2563eb' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>Main Store Stock</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: '#475569' }}>Total Quantity:</span>
                  <strong className="mono">{storeTotalQty.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: '#475569' }}>Buying Value:</span>
                  <strong className="mono" style={{ color: '#0f172a' }}>{formatMoney(storeBuyingValue)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: '#475569' }}>Selling Value:</span>
                  <strong className="mono" style={{ color: '#059669' }}>{formatMoney(storeSellingValue)}</strong>
                </div>
              </div>

              <div className="card" style={{ borderLeft: '4px solid #d97706' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>All Vans Stock ({vanGroups.length} Vans)</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: '#475569' }}>Total Quantity:</span>
                  <strong className="mono">{vanTotalQty.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: '#475569' }}>Buying Value:</span>
                  <strong className="mono" style={{ color: '#0f172a' }}>{formatMoney(vanBuyingValue)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: '#475569' }}>Selling Value:</span>
                  <strong className="mono" style={{ color: '#059669' }}>{formatMoney(vanSellingValue)}</strong>
                </div>
              </div>

              <div className="card" style={{ borderLeft: '4px solid #059669', background: '#f0fdf4' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 6 }}>Total Inventory (Store + Vans)</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: '#334155' }}>Total Quantity:</span>
                  <strong className="mono">{grandQty.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: '#334155' }}>Total Buying Value:</span>
                  <strong className="mono" style={{ color: '#0f172a' }}>{formatMoney(grandBuying)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: '#334155' }}>Total Selling Value:</span>
                  <strong className="mono" style={{ color: '#059669', fontSize: 14 }}>{formatMoney(grandSelling)}</strong>
                </div>
              </div>
            </div>

            {/* Sub-Tabs for Store Stock Report vs Van Stock Report */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${stockReportSubTab === 'store' ? 'btn-blue' : 'btn-outline'}`}
                onClick={() => setStockReportSubTab('store')}
              >
                All Store Stock Report ({storeItems.length} SKUs &bull; Qty: {storeTotalQty.toFixed(2)})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${stockReportSubTab === 'vans' ? 'btn-blue' : 'btn-outline'}`}
                onClick={() => setStockReportSubTab('vans')}
              >
                Van Stock Report ({vanGroups.length} Vans &bull; Qty: {vanTotalQty.toFixed(2)})
              </button>
            </div>

            {stockReportSubTab === 'store' && (
              <div className="card">
                <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span>All Store Stock Report &mdash; Buying &amp; Selling Valuation</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                    <span className="badge badge-blue mono">Total Qty: {storeTotalQty.toFixed(2)}</span>
                    <span className="badge badge-slate mono">Buying: {formatMoney(storeBuyingValue)}</span>
                    <span className="badge badge-emerald mono">Selling: {formatMoney(storeSellingValue)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12, padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>Select Target Van:</span>
                  <div style={{ minWidth: 240, flex: '1 1 240px', maxWidth: 340 }}>
                    <SearchableSelect
                      value={storeMoveVanId}
                      onChange={val => setStoreMoveVanId(val)}
                      placeholder="Choose Van to move stock..."
                      searchPlaceholder="Search van..."
                      options={vans.map(v => ({ value: v.id, label: v.van_name, sublabel: v.van_code }))}
                    />
                  </div>
                  <button type="button" className="btn btn-emerald btn-sm" onClick={moveBulkStoreItemsToVan}>
                    <Send size={13} /> Move All Filled to Van
                  </button>
                </div>
                <DataTable
                  data={storeItems}
                  emptyText="No active stock in Main Store."
                  searchPlaceholder="Search SKU or item name..."
                  exportFilename="main-store-stock-valuation.csv"
                  columns={[
                    {
                      key: 'sku',
                      label: 'SKU & Item',
                      sortValue: (x) => `${x.sku} ${x.item_name}`,
                      searchValue: (x) => `${x.sku} ${x.item_name}`,
                      render: (x) => <><strong>{x.sku}</strong> &mdash; {x.item_name}</>,
                    },
                    { key: 'batchCount', label: 'Batches', sortValue: (x) => x.batchCount, render: (x) => <span className="badge badge-slate mono">{x.batchCount}</span> },
                    { key: 'totalQty', label: 'Total Qty', sortValue: (x) => x.totalQty, render: (x) => <span className="mono" style={{ fontWeight: 800 }}>{x.totalQty.toFixed(2)} {x.uom}</span> },
                    { key: 'avgCost', label: 'Avg Buying Price', sortValue: (x) => x.totalQty > 0 ? x.buyingValue / x.totalQty : 0, render: (x) => <span className="mono">{formatMoney(x.totalQty > 0 ? x.buyingValue / x.totalQty : 0)}</span> },
                    { key: 'avgSell', label: 'Avg Selling Price', sortValue: (x) => x.totalQty > 0 ? x.sellingValue / x.totalQty : 0, render: (x) => <span className="mono" style={{ color: '#059669' }}>{formatMoney(x.totalQty > 0 ? x.sellingValue / x.totalQty : 0)}</span> },
                    { key: 'buyingValue', label: 'Buying Value', sortValue: (x) => x.buyingValue, render: (x) => <span className="mono" style={{ fontWeight: 700 }}>{formatMoney(x.buyingValue)}</span> },
                    { key: 'sellingValue', label: 'Selling Value', sortValue: (x) => x.sellingValue, render: (x) => <span className="mono" style={{ fontWeight: 800, color: '#059669' }}>{formatMoney(x.sellingValue)}</span> },
                    {
                      key: 'move_to_van',
                      label: 'Move to Van',
                      sortable: false,
                      render: (x) => (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                          <input
                            type="number"
                            min="0"
                            max={x.totalQty}
                            step="1"
                            placeholder="Qty"
                            className="form-control mono"
                            style={{ width: 78, padding: '4px 6px', fontSize: 12 }}
                            value={storeMoveQtys[x.item_id] ?? ''}
                            onChange={e => setStoreMoveQtys(prev => ({ ...prev, [x.item_id]: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => moveSingleStoreItemToVan(x)}
                            title="Move entered quantity to selected Van"
                          >
                            <Send size={12} /> Move to Van
                          </button>
                          <button
                            type="button"
                            className="btn btn-rose btn-sm"
                            onClick={() => reportStoreItemDamage(x)}
                            title="Move entered quantity from Main Store to Damage QC"
                          >
                            <AlertTriangle size={12} /> Damage
                          </button>
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            )}

            {stockReportSubTab === 'vans' && (
              <div className="card">
                <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span>Van Stock Report &mdash; Grouped by Van</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                    <span className="badge badge-amber mono">Total Van Qty: {vanTotalQty.toFixed(2)}</span>
                    <span className="badge badge-slate mono">Buying: {formatMoney(vanBuyingValue)}</span>
                    <span className="badge badge-emerald mono">Selling: {formatMoney(vanSellingValue)}</span>
                    {vanGroups.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            const all = {};
                            vanGroups.forEach(vg => { all[vg.id] = true; });
                            setExpandedStockVans(all);
                          }}
                        >
                          Expand All
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setExpandedStockVans({})}>
                          Collapse All
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <DataTable
                  data={vanGroups}
                  emptyText="No active stock in any Van."
                  searchPlaceholder="Search van, SKU, item..."
                  exportFilename="van-stock-valuation.csv"
                  columns={[
                    {
                      key: 'van_name',
                      label: 'Van',
                      sortValue: (vg) => vg.van_name || '',
                      searchValue: (vg) => `${vg.van_name} ${vg.items.map(it => `${it.sku} ${it.item_name}`).join(' ')}`,
                    },
                    { key: 'skuCount', label: 'SKUs', sortValue: (vg) => vg.items.length },
                    { key: 'totalQty', label: 'Total Qty', sortValue: (vg) => vg.totalQty },
                    { key: 'buyingValue', label: 'Buying Value', sortValue: (vg) => vg.buyingValue },
                    { key: 'sellingValue', label: 'Selling Value', sortValue: (vg) => vg.sellingValue },
                  ]}
                  renderParentChild={(vg) => {
                    const isOpen = !!expandedStockVans[vg.id];
                    return (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                        <button
                          type="button"
                          onClick={() => setExpandedStockVans(prev => ({ ...prev, [vg.id]: !prev[vg.id] }))}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 10,
                            padding: '11px 14px',
                            background: isOpen ? '#eff6ff' : '#f8fafc',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#0f172a', fontSize: 13.5 }}>
                            {isOpen ? <ChevronDown size={16} color="#2563eb" /> : <ChevronRight size={16} color="#475569" />}
                            <span>{vg.van_name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                            <span className="badge badge-blue mono">{vg.items.length} SKUs</span>
                            <span className="badge badge-amber mono">Qty: {vg.totalQty.toFixed(2)}</span>
                            <span className="badge badge-slate mono">Buying: {formatMoney(vg.buyingValue)}</span>
                            <span className="badge badge-emerald mono">Selling: {formatMoney(vg.sellingValue)}</span>
                          </div>
                        </button>
                        {isOpen && (
                          <div style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
                                <thead>
                                  <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569', fontSize: 11 }}>
                                    <th style={{ padding: '7px 10px' }}>SKU &amp; Item</th>
                                    <th style={{ padding: '7px 10px' }}>Batches</th>
                                    <th style={{ padding: '7px 10px' }}>Total Qty</th>
                                    <th style={{ padding: '7px 10px' }}>Buying Value</th>
                                    <th style={{ padding: '7px 10px' }}>Selling Value</th>
                                    <th style={{ padding: '7px 10px' }}>Return / Damage from Van</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {vg.items.map(it => {
                                    const vKey = `${vg.van_id}_${it.item_id}`;
                                    return (
                                    <tr key={it.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                      <td style={{ padding: '7px 10px' }}><strong>{it.sku}</strong> &mdash; {it.item_name}</td>
                                      <td style={{ padding: '7px 10px' }}><span className="badge badge-slate mono">{it.batchCount}</span></td>
                                      <td style={{ padding: '7px 10px', fontWeight: 800 }} className="mono">{it.totalQty.toFixed(2)} {it.uom}</td>
                                      <td style={{ padding: '7px 10px', fontWeight: 700 }} className="mono">{formatMoney(it.buyingValue)}</td>
                                      <td style={{ padding: '7px 10px', fontWeight: 800, color: '#059669' }} className="mono">{formatMoney(it.sellingValue)}</td>
                                      <td style={{ padding: '7px 10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                          <input
                                            type="number"
                                            min="0"
                                            max={it.totalQty}
                                            step="1"
                                            placeholder="Qty"
                                            className="form-control mono"
                                            style={{ width: 72, padding: '4px 6px', fontSize: 12 }}
                                            value={vanActionQtys[vKey] ?? ''}
                                            onChange={e => setVanActionQtys(prev => ({ ...prev, [vKey]: e.target.value }))}
                                          />
                                          <button
                                            type="button"
                                            className="btn btn-outline btn-sm"
                                            style={{ color: '#2563eb', borderColor: '#bfdbfe' }}
                                            onClick={() => reportVanItemAction(vg, it, 'good_return')}
                                            title="Return good stock from Van to Store (QC)"
                                          >
                                            Return
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-rose btn-sm"
                                            onClick={() => reportVanItemAction(vg, it, 'damaged')}
                                            title="Move damaged stock from Van to Damage QC"
                                          >
                                            <AlertTriangle size={12} /> Damage
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
              </div>
            )}
          </div>
        );
      })()}

      {tab === 'dispatch' && (
        <>
          <form onSubmit={handleDispatch} className="card">
            <div className="card-title"><span><ArrowRightLeft size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Direct Store-to-Van Dispatch (Auto FIFO/FEFO)</span></div>
            <div className="grid-4">
              <div className="form-group">
                <label className="form-label">Destination Van</label>
                <SearchableSelect
                  required
                  value={dispatchForm.to_van_id}
                  onChange={val => setDispatchForm({ ...dispatchForm, to_van_id: val })}
                  placeholder="Select Van..."
                  searchPlaceholder="Search van..."
                  options={vans.map(v => ({ value: v.id, label: v.van_name, sublabel: v.van_code }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Item</label>
                <SearchableSelect
                  required
                  value={dispatchForm.item_id}
                  onChange={val => setDispatchForm({ ...dispatchForm, item_id: val })}
                  placeholder="Select Item..."
                  searchPlaceholder="Search SKU or item name..."
                  options={items.map(it => ({ value: it.id, label: `${it.sku} - ${it.name}`, sublabel: `Avail: ${it.main_store_qty}` }))}
                />
              </div>
              <div className="form-group"><label className="form-label">Qty</label><input className="form-control mono" type="number" required value={dispatchForm.qty} onChange={e => setDispatchForm({ ...dispatchForm, qty: e.target.value })} /></div>
              <div className="form-group" style={{ justifyContent: 'flex-end', display: 'flex', flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={addToTransferList}><Plus size={14} /> Add to Bulk</button>
                <button type="submit" className="btn btn-blue">Dispatch Now</button>
              </div>
            </div>

            {dispatchForm.item_id && (() => {
              const selItem = items.find(x => String(x.id) === String(dispatchForm.item_id));
              const selVan = vans.find(x => String(x.id) === String(dispatchForm.to_van_id));
              const mainAvail = getMainAvail(dispatchForm.item_id);
              const vanAvail = selVan ? getVanAvail(selVan.id, dispatchForm.item_id) : null;
              const uom = selItem?.uom || 'PCS';
              const isShort = Number(dispatchForm.qty || 0) > mainAvail;

              return (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                    <span className={`badge ${mainAvail > 0 ? 'badge-emerald' : 'badge-rose'}`} style={{ fontSize: 12, padding: '5px 10px' }}>
                      Main Store Available: <strong className="mono" style={{ marginLeft: 4 }}>{mainAvail} {uom}</strong>
                    </span>
                    {selVan ? (
                      <span className="badge badge-blue" style={{ fontSize: 12, padding: '5px 10px' }}>
                        {selVan.van_name} Available: <strong className="mono" style={{ marginLeft: 4 }}>{vanAvail} {uom}</strong>
                      </span>
                    ) : (
                      <span className="badge badge-slate" style={{ fontSize: 11.5, padding: '5px 10px' }}>
                        Select a Van to view Van Available Stock
                      </span>
                    )}
                    <span className="badge badge-amber" style={{ fontSize: 11.5, padding: '5px 10px' }}>
                      All Vans Total: <strong className="mono" style={{ marginLeft: 4 }}>{Number(selItem?.vans_qty || 0)} {uom}</strong>
                    </span>
                  </div>
                  {isShort && (
                    <span style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 700 }}>
                      Requested ({dispatchForm.qty}) exceeds Main Store stock ({mainAvail})!
                    </span>
                  )}
                </div>
              );
            })()}

            {stagedLines.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#1e40af' }}>
                    Bulk Transfer Queue ({stagedLines.length} item{stagedLines.length > 1 ? 's' : ''})
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setStagedLines([])}>Clear</button>
                    <button type="button" className="btn btn-emerald btn-sm" onClick={handleBulkDispatchStaged}>
                      <Send size={13} /> Transfer Bulk to Selected Van (Ready to Pickup)
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {stagedLines.map(sl => (
                    <div key={sl.item_id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 9px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span><strong>{sl.sku}</strong> - {sl.name}</span>
                      <span className="badge badge-blue mono">{sl.qty} {sl.uom}</span>
                      <button type="button" onClick={() => setStagedLines(prev => prev.filter(x => x.item_id !== sl.item_id))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>

          {/* SUB-TABS & DATE BETWEEN SEARCH */}
          <div className="card" style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${dispatchSubTab === 'requests' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDispatchSubTab('requests')}
              >
                Request List ({activeRequests.length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${dispatchSubTab === 'transfers' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDispatchSubTab('transfers')}
              >
                Transfer List ({filteredStoreToVanTransfers.length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${dispatchSubTab === 'cancelled' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setDispatchSubTab('cancelled')}
              >
                Cancel List ({cancelledRequests.length})
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' }}>
                <Calendar size={14} /> Date Between:
              </span>
              <input
                type="date"
                className="input"
                style={{ width: 145, padding: '5px 8px', fontSize: 12 }}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                title="From Date"
              />
              <span style={{ fontSize: 12, color: '#64748b' }}>to</span>
              <input
                type="date"
                className="input"
                style={{ width: 145, padding: '5px 8px', fontSize: 12 }}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                title="To Date"
              />
              <button type="button" className="btn btn-outline btn-sm" onClick={setTodayRange}>Today</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={setLast7DaysRange}>7D</button>
              {(fromDate || toDate) && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate(''); }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* TABLE 1: REQUEST LIST WITH AVAILABLE STOCK, REQUIRED STOCK & MANUAL TRANSFER QTY */}
          {dispatchSubTab === 'requests' && (
          <div className="card">
            <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span>Request List (Available Stock, Required Stock &amp; Manual Transfer Qty)</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {vanRequestGroups.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        const all = {};
                        vanRequestGroups.forEach((g) => { all[g.id] = true; });
                        setExpandedRequestVans(all);
                      }}
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setExpandedRequestVans({})}
                    >
                      Collapse All
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-emerald btn-sm" onClick={handleBulkTransferFromRequests}>
                  <Send size={13} /> Transfer Filled Items in Bulk to Van
                </button>
              </div>
            </div>
            {(fromDate || toDate) && requests.length > filteredRequests.length && (
              <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#92400e' }}>
                <span>
                  Date filter active ({fromDate || '...'} to {toDate || '...'}): showing <strong>{filteredRequests.length}</strong> of <strong>{requests.length}</strong> total requests.
                </span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate(''); }}>
                  Show All Requests
                </button>
              </div>
            )}
            <DataTable
              data={vanRequestGroups}
              emptyText="No van item requests found."
              searchPlaceholder="Search van, request #, SKU, item..."
              exportFilename="van-item-requests-by-van.csv"
              columns={[
                {
                  key: 'van_name',
                  label: 'Van',
                  sortValue: (g) => g.van_name || '',
                  searchValue: (g) => `${g.van_name} ${g.rows.map(r => `${r.request_no} ${r.sku} ${r.item_name}`).join(' ')}`,
                },
                { key: 'requestCount', label: 'Requests', sortValue: (g) => g.requestCount },
                { key: 'pendingCount', label: 'Pending', sortValue: (g) => g.pendingCount },
                { key: 'dispatchedCount', label: 'Dispatched', sortValue: (g) => g.dispatchedCount },
                { key: 'totalRequestedQty', label: 'Required Qty', sortValue: (g) => g.totalRequestedQty },
                { key: 'latestDate', label: 'Latest Request', sortValue: (g) => g.latestDate || '' },
              ]}
              renderParentChild={(g) => {
                const isOpen = !!expandedRequestVans[g.id];
                return (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                    <button
                      type="button"
                      onClick={() => toggleRequestVan(g.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        padding: '11px 14px',
                        background: isOpen ? '#eff6ff' : '#f8fafc',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#0f172a', fontSize: 13.5 }}>
                        {isOpen ? <ChevronDown size={16} color="#2563eb" /> : <ChevronRight size={16} color="#475569" />}
                        <span>{g.van_name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                        <span className="badge badge-blue mono">{g.requestCount} Requests ({g.rows.length} Items)</span>
                        <span className={`badge ${g.pendingCount > 0 ? 'badge-amber' : 'badge-slate'} mono`}>{g.pendingCount} Open/Partial</span>
                        <span className="badge badge-emerald mono">{g.dispatchedCount} Done</span>
                        <span className="badge badge-slate mono">Req: {g.totalRequestedQty}</span>
                        <span className="badge badge-blue mono">Del: {g.totalDeliveredQty}</span>
                        <span className="badge badge-emerald mono">Acc: {g.totalAcceptedQty}</span>
                        <span className={`badge ${g.totalBalanceQty > 0 ? 'badge-rose' : 'badge-slate'} mono`}>Bal: {g.totalBalanceQty}</span>
                        {g.latestDate && (
                          <span className="mono" style={{ fontSize: 11.5, color: '#64748b' }}>
                            Latest: {formatDateTime(g.latestDate)}
                          </span>
                        )}
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff', borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            <thead>
                              <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569', fontSize: 11 }}>
                                <th style={{ padding: '7px 10px' }}>Request #</th>
                                <th style={{ padding: '7px 10px' }}>Date</th>
                                <th style={{ padding: '7px 10px' }}>Item</th>
                                <th style={{ padding: '7px 10px' }}>Main Store Avail</th>
                                <th style={{ padding: '7px 10px' }}>Van Avail</th>
                                <th style={{ padding: '7px 10px' }}>Requested</th>
                                <th style={{ padding: '7px 10px' }}>Delivered / Accepted</th>
                                <th style={{ padding: '7px 10px' }}>Balance</th>
                                <th style={{ padding: '7px 10px' }}>Transfer Qty (Manual)</th>
                                <th style={{ padding: '7px 10px' }}>Status</th>
                                <th style={{ padding: '7px 10px' }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.rows.map((r) => {
                                const isOpenBal = r.balance_qty > 0 && r.status !== 'cancelled';
                                const statusBadgeCls =
                                  r.item_status === 'received' || r.item_status === 'completed' ? 'badge-emerald'
                                  : r.item_status === 'ready_pickup' || r.item_status === 'dispatched' ? 'badge-blue'
                                  : r.item_status === 'partial' ? 'badge-amber'
                                  : r.item_status === 'cancelled' ? 'badge-rose'
                                  : 'badge-amber';
                                return (
                                <tr key={r.id} style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'middle' }}>
                                  <td style={{ padding: '7px 10px' }} className="mono"><strong>{r.request_no}</strong></td>
                                  <td style={{ padding: '7px 10px', color: '#475569' }} className="mono">{formatDateTime(r.created_at)}</td>
                                  <td style={{ padding: '7px 10px' }}><strong>{r.sku}</strong> &mdash; {r.item_name}</td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span className={`badge ${r.main_avail > 0 ? 'badge-emerald' : 'badge-rose'} mono`}>{r.main_avail} {r.uom}</span>
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span className="badge badge-blue mono">{r.van_avail} {r.uom}</span>
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span className="mono" style={{ fontWeight: 800 }}>{r.requested_qty} {r.uom}</span>
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <div className="mono" style={{ fontSize: 11, lineHeight: 1.5 }}>
                                      <div>Del: <strong>{r.delivered_qty}</strong> {r.uom}</div>
                                      <div style={{ color: '#059669' }}>Acc: <strong>{r.accepted_qty}</strong> {r.uom}</div>
                                      {r.cancelled_qty > 0 && (
                                        <div style={{ color: '#dc2626' }}>Closed: <strong>{r.cancelled_qty}</strong> {r.uom}</div>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span className={`badge ${r.balance_qty > 0 ? 'badge-rose' : 'badge-emerald'} mono`}>
                                      {r.balance_qty} {r.uom}
                                    </span>
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    {isOpenBal ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <input
                                          type="number"
                                          min="0"
                                          max={Math.min(r.balance_qty, r.main_avail)}
                                          step="1"
                                          className="form-control mono"
                                          style={{ width: 85, padding: '4px 6px', fontSize: 12 }}
                                          placeholder="0"
                                          value={reqTransferQtys[r.row_key] ?? ''}
                                          onChange={e => setReqTransferQtys(prev => ({ ...prev, [r.row_key]: e.target.value }))}
                                        />
                                        <button
                                          type="button"
                                          className="btn btn-outline btn-sm"
                                          title="Fill Remaining Balance Qty"
                                          onClick={() => setReqTransferQtys(prev => ({ ...prev, [r.row_key]: String(Math.min(r.balance_qty, r.main_avail)) }))}
                                        >
                                          Max
                                        </button>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: 11, color: '#64748b' }}>
                                        {r.cancelled_qty > 0 ? 'Balance Closed' : 'Dispatched'}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span className={`badge ${statusBadgeCls}`}>{r.item_status}</span>
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    {r.balance_qty > 0 && r.delivered_qty > 0 ? (
                                      <button
                                        type="button"
                                        className="btn btn-outline btn-sm"
                                        style={{ color: '#dc2626', borderColor: '#fecaca', whiteSpace: 'nowrap' }}
                                        onClick={() => cancelRequestBalance(r.request_id, r.request_no, r.item_id, r.sku)}
                                      >
                                        Cancel Bal &amp; Finish
                                      </button>
                                    ) : r.status === 'pending' && r.delivered_qty === 0 ? (
                                      <button
                                        type="button"
                                        className="btn btn-outline btn-sm"
                                        style={{ color: '#dc2626', borderColor: '#fecaca' }}
                                        onClick={() => cancelRequest(r.request_id, r.request_no)}
                                      >
                                        Cancel
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: 11, color: '#94a3b8' }}>&mdash;</span>
                                    )}
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </div>
          )}

          {/* TABLE 3: CANCELLED REQUEST LIST (VAN-GROUPED PARENT-CHILD VIEW WITH DELETE) */}
          {dispatchSubTab === 'cancelled' && (
          <div className="card">
            <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span>Cancelled Request List</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge badge-rose mono">{cancelledRequests.length} Cancelled</span>
                {vanCancelledGroups.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        const all = {};
                        vanCancelledGroups.forEach((g) => { all[g.id] = true; });
                        setExpandedCancelledVans(all);
                      }}
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setExpandedCancelledVans({})}
                    >
                      Collapse All
                    </button>
                  </>
                )}
              </div>
            </div>
            <DataTable
              data={vanCancelledGroups}
              emptyText="No cancelled requests found."
              searchPlaceholder="Search van, request #, SKU, item..."
              exportFilename="cancelled-van-requests.csv"
              columns={[
                {
                  key: 'van_name',
                  label: 'Van',
                  sortValue: (g) => g.van_name || '',
                  searchValue: (g) => `${g.van_name} ${g.rows.map(r => `${r.request_no} ${r.sku} ${r.item_name}`).join(' ')}`,
                },
                { key: 'requestCount', label: 'Cancelled Requests', sortValue: (g) => g.requestCount },
                { key: 'totalRequestedQty', label: 'Requested Qty', sortValue: (g) => g.totalRequestedQty },
                { key: 'latestDate', label: 'Latest Request', sortValue: (g) => g.latestDate || '' },
              ]}
              renderParentChild={(g) => {
                const isOpen = !!expandedCancelledVans[g.id];
                return (
                  <div style={{ border: '1px solid #fecaca', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                    <button
                      type="button"
                      onClick={() => toggleCancelledVan(g.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        padding: '11px 14px',
                        background: isOpen ? '#fef2f2' : '#fff5f5',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#0f172a', fontSize: 13.5 }}>
                        {isOpen ? <ChevronDown size={16} color="#dc2626" /> : <ChevronRight size={16} color="#475569" />}
                        <span>{g.van_name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                        <span className="badge badge-rose mono">{g.requestCount} Cancelled ({g.rows.length} Items)</span>
                        <span className="badge badge-slate mono">Req Qty: {g.totalRequestedQty}</span>
                        {g.latestDate && (
                          <span className="mono" style={{ fontSize: 11.5, color: '#64748b' }}>
                            Latest: {formatDateTime(g.latestDate)}
                          </span>
                        )}
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid #fecaca' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff', borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            <thead>
                              <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569', fontSize: 11 }}>
                                <th style={{ padding: '7px 10px' }}>Request #</th>
                                <th style={{ padding: '7px 10px' }}>Date</th>
                                <th style={{ padding: '7px 10px' }}>Item</th>
                                <th style={{ padding: '7px 10px' }}>Required Stock</th>
                                <th style={{ padding: '7px 10px' }}>Status</th>
                                <th style={{ padding: '7px 10px' }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.rows.map((r) => (
                                <tr key={r.id} style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'middle' }}>
                                  <td style={{ padding: '7px 10px' }} className="mono"><strong>{r.request_no}</strong></td>
                                  <td style={{ padding: '7px 10px', color: '#475569' }} className="mono">{formatDateTime(r.created_at)}</td>
                                  <td style={{ padding: '7px 10px' }}><strong>{r.sku}</strong> &mdash; {r.item_name}</td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span className="mono" style={{ fontWeight: 800 }}>{r.required_qty} {r.uom}</span>
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span className="badge badge-rose">cancelled</span>
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-rose btn-sm"
                                      onClick={() => deleteCancelledRequest(r.request_id, r.request_no)}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                    >
                                      <Trash2 size={12} /> Delete
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </div>
          )}

          {/* TABLE 2: TRANSFER LIST (VAN-GROUPED PARENT-CHILD VIEW) */}
          {dispatchSubTab === 'transfers' && (
          <div className="card">
            <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span>Transfer List (Store-to-Van Ready to Pickup &amp; Confirmed)</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${transferStatusTab === 'waiting' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setTransferStatusTab('waiting')}
                >
                  Waiting List ({waitingStoreToVan.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${transferStatusTab === 'accepted' ? 'btn-emerald' : 'btn-outline'}`}
                  onClick={() => setTransferStatusTab('accepted')}
                >
                  Accepted List ({acceptedStoreToVan.length})
                </button>
                {vanTransferGroups.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        const all = {};
                        vanTransferGroups.forEach((g) => { all[g.id] = true; });
                        setExpandedTransferVans(all);
                      }}
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setExpandedTransferVans({})}
                    >
                      Collapse All
                    </button>
                  </>
                )}
              </div>
            </div>
            <DataTable
              data={vanTransferGroups}
              searchPlaceholder="Search van, transfer #, OTP, SKU..."
              exportFilename="store-to-van-transfers-by-van.csv"
              emptyText="No store-to-van transfers found in this date range."
              columns={[
                {
                  key: 'van_name',
                  label: 'Van (Click to Expand)',
                  sortValue: (g) => g.van_name || '',
                  searchValue: (g) => `${g.van_name} ${g.transfers.map(t => `${t.transfer_no} ${t.otp_code} ${(t.lines || []).map(l => `${l.sku} ${l.item_name}`).join(' ')}`).join(' ')}`,
                  render: (g) => {
                    const isOpen = !!expandedTransferVans[g.id];
                    return (
                      <button
                        type="button"
                        onClick={() => toggleTransferVan(g.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 800, color: '#0f172a', textAlign: 'left' }}
                      >
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <span>{g.van_name}</span>
                      </button>
                    );
                  },
                },
                {
                  key: 'transfers_count',
                  label: 'Transfers',
                  sortValue: (g) => g.transfers.length,
                  render: (g) => <span className="badge badge-blue mono">{g.transfers.length}</span>,
                },
                {
                  key: 'pendingCount',
                  label: 'Ready to Pickup',
                  sortValue: (g) => g.pendingCount,
                  render: (g) => <span className={`badge ${g.pendingCount > 0 ? 'badge-amber' : 'badge-slate'} mono`}>{g.pendingCount}</span>,
                },
                {
                  key: 'confirmedCount',
                  label: 'Confirmed',
                  sortValue: (g) => g.confirmedCount,
                  render: (g) => <span className="badge badge-emerald mono">{g.confirmedCount}</span>,
                },
                {
                  key: 'totalQty',
                  label: 'Total Qty',
                  sortValue: (g) => g.totalQty,
                  render: (g) => <strong className="mono">{g.totalQty}</strong>,
                },
                {
                  key: 'latestDate',
                  label: 'Latest Transfer',
                  sortValue: (g) => g.latestDate || '',
                  render: (g) => <span className="mono" style={{ fontSize: 12, color: '#475569' }}>{formatDateTime(g.latestDate)}</span>,
                },
              ]}
              renderParentChild={(g) => {
                const isOpen = !!expandedTransferVans[g.id];
                return (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                    <button
                      type="button"
                      onClick={() => toggleTransferVan(g.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        padding: '11px 14px',
                        background: isOpen ? '#eff6ff' : '#f8fafc',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#0f172a', fontSize: 13.5 }}>
                        {isOpen ? <ChevronDown size={16} color="#2563eb" /> : <ChevronRight size={16} color="#475569" />}
                        <span>{g.van_name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                        <span className="badge badge-blue mono">{g.transfers.length} Transfers</span>
                        <span className={`badge ${g.pendingCount > 0 ? 'badge-amber' : 'badge-slate'} mono`}>{g.pendingCount} Ready to Pickup</span>
                        <span className="badge badge-emerald mono">{g.confirmedCount} Confirmed</span>
                        <span className="badge badge-slate mono">Qty: {g.totalQty}</span>
                        {g.latestDate && (
                          <span className="mono" style={{ fontSize: 11.5, color: '#64748b' }}>
                            Latest: {formatDateTime(g.latestDate)}
                          </span>
                        )}
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff', borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            <thead>
                              <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569', fontSize: 11 }}>
                                <th style={{ padding: '7px 10px' }}>Transfer #</th>
                                <th style={{ padding: '7px 10px' }}>Date</th>
                                <th style={{ padding: '7px 10px' }}>Pickup OTP</th>
                                <th style={{ padding: '7px 10px' }}>Transferred Items</th>
                                <th style={{ padding: '7px 10px' }}>Pickup / Stock Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.transfers.map((t) => (
                                <tr key={t.id} style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                                  <td style={{ padding: '7px 10px' }} className="mono"><strong>{t.transfer_no}</strong></td>
                                  <td style={{ padding: '7px 10px', color: '#475569' }} className="mono">{formatDateTime(t.created_at)}</td>
                                  <td style={{ padding: '7px 10px' }}><span className="badge badge-blue mono">{t.otp_code}</span></td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-outline btn-sm"
                                      onClick={() => setTransferItemsModal(t)}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                                    >
                                      <Layers size={13} color="#2563eb" />
                                      <span>View Items ({(t.lines || []).length})</span>
                                      <span className="badge badge-slate mono" style={{ fontSize: 10.5 }}>
                                        Qty: {Number((t.lines || []).reduce((acc, l) => acc + Number(l.qty || 0), 0).toFixed(2))}
                                      </span>
                                    </button>
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span className={`badge ${t.status === 'completed' ? 'badge-emerald' : 'badge-amber'}`}>
                                      {t.status === 'completed' ? 'Confirmed (Van Stock Updated)' : 'Ready to Pickup (Pending Van Confirm)'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </div>
          )}
        </>
      )}

      {tab === 'transfers' && (() => {
        const waitingAll = transfers.filter(t => t.status === 'pending_confirm');
        const acceptedAll = transfers.filter(t => t.status === 'completed');
        const displayedAll = transferStatusTab === 'waiting' ? waitingAll : acceptedAll;
        return (
        <div className="card">
          <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span>Store-to-Van &amp; Van-to-Van Transfer Audit Log</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn btn-sm ${transferStatusTab === 'waiting' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setTransferStatusTab('waiting')}
              >
                Waiting List ({waitingAll.length})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${transferStatusTab === 'accepted' ? 'btn-emerald' : 'btn-outline'}`}
                onClick={() => setTransferStatusTab('accepted')}
              >
                Accepted List ({acceptedAll.length})
              </button>
            </div>
          </div>
          <DataTable
            data={displayedAll}
            searchPlaceholder="Search transfer #, type, van, SKU..."
            exportFilename="transfer-audit-log.csv"
            columns={[
              { key: 'transfer_no', label: 'Transfer #', sortValue: (t) => t.transfer_no || '', render: (t) => <span className="mono" style={{ fontWeight: 700 }}>{t.transfer_no}</span> },
              {
                key: 'transfer_type',
                label: 'Type',
                sortValue: (t) => t.transfer_type || '',
                render: (t) => <span className={`badge ${t.transfer_type === 'van_to_van' ? 'badge-purple' : 'badge-blue'}`}>{t.transfer_type}</span>,
              },
              {
                key: 'to_van_name',
                label: 'From → To',
                sortValue: (t) => `${t.from_van_name || 'Main Store'} ${t.to_van_name || ''}`,
                searchValue: (t) => `${t.from_van_name || 'Main Store'} ${t.to_van_name || ''}`,
                render: (t) => <>{t.from_van_name || 'Main Store'} &rarr; <strong>{t.to_van_name}</strong></>,
              },
              { key: 'otp_code', label: 'OTP', sortValue: (t) => t.otp_code || '', render: (t) => <span className="mono">{t.otp_code}</span> },
              {
                key: 'lines',
                label: 'Transferred Items',
                sortable: false,
                searchValue: (t) => (t.lines || []).map((l) => `${l.sku} ${l.item_name || ''} ${l.batch_no}`).join(' '),
                render: (t) => (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setTransferItemsModal(t)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                  >
                    <Layers size={13} color="#2563eb" />
                    <span>View Items ({(t.lines || []).length})</span>
                    <span className="badge badge-slate mono" style={{ fontSize: 10.5 }}>
                      Qty: {Number((t.lines || []).reduce((acc, l) => acc + Number(l.qty || 0), 0).toFixed(2))}
                    </span>
                  </button>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                sortValue: (t) => t.status || '',
                render: (t) => <span className={`badge ${t.status === 'completed' ? 'badge-emerald' : t.status === 'cancelled' ? 'badge-rose' : 'badge-amber'}`}>{t.status === 'completed' ? 'Accepted' : t.status}</span>,
              },
            ]}
          />
        </div>
        );
      })()}

      {tab === 'damages' && (
        <div className="card">
          <div className="card-title"><span><AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: '#d97706' }} />Van Returns &amp; Damaged Stock QC</span></div>
          <DataTable
            data={damages}
            searchPlaceholder="Search van, SKU, item, reason, QC status..."
            exportFilename="damages-qc.csv"
            columns={[
              { key: 'van_name', label: 'Van', sortValue: (d) => d.van_name || '' },
              {
                key: 'sku',
                label: 'Item',
                sortValue: (d) => `${d.sku} ${d.item_name}`,
                searchValue: (d) => `${d.sku || ''} ${d.item_name || ''}`,
                render: (d) => <><strong>{d.sku}</strong> &mdash; {d.item_name}</>,
              },
              { key: 'qty', label: 'Qty', sortValue: (d) => Number(d.qty || 0), render: (d) => <span className="mono">{d.qty}</span> },
              {
                key: 'return_type',
                label: 'Type & Reason',
                sortValue: (d) => `${d.return_type || ''} ${d.reason_code || ''}`,
                searchValue: (d) => `${d.return_type || ''} ${d.reason_code || ''}`,
                render: (d) => <><span className="badge badge-rose">{d.return_type}</span> {d.reason_code}</>,
              },
              {
                key: 'qc_status',
                label: 'QC Status',
                sortValue: (d) => d.qc_status || '',
                render: (d) => <span className={`badge ${d.qc_status === 'restocked' ? 'badge-emerald' : d.qc_status === 'written_off' ? 'badge-slate' : 'badge-amber'}`}>{d.qc_status}</span>,
              },
              {
                key: 'action',
                label: 'Action',
                sortable: false,
                render: (d) => d.qc_status === 'pending_qc' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-emerald btn-sm" onClick={() => qcDamage(d.id, 'restocked')}><CheckCircle2 size={13} /> Restock</button>
                    <button className="btn btn-rose btn-sm" onClick={() => qcDamage(d.id, 'written_off')}>Write-Off</button>
                  </div>
                ) : null,
              },
            ]}
          />
        </div>
      )}

      {transferItemsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setTransferItemsModal(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 920,
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              margin: 0,
              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingBottom: 12, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Layers size={18} color="#2563eb" />
                  <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                    Transferred Items &mdash; <span className="mono">{transferItemsModal.transfer_no}</span>
                  </span>
                  <span className={`badge ${transferItemsModal.status === 'completed' ? 'badge-emerald' : 'badge-amber'}`}>
                    {transferItemsModal.status === 'completed' ? 'Confirmed (Van Stock Updated)' : 'Ready to Pickup'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: '#475569' }}>
                  <span>
                    Route: <strong>{transferItemsModal.from_van_name || 'Main Store'}</strong> &rarr; <strong>{transferItemsModal.to_van_name || 'Van'}</strong>
                  </span>
                  {transferItemsModal.otp_code && (
                    <span>OTP: <span className="badge badge-blue mono">{transferItemsModal.otp_code}</span></span>
                  )}
                  {transferItemsModal.created_at && (
                    <span className="mono">Date: {formatDateTime(transferItemsModal.created_at)}</span>
                  )}
                  <span>
                    Items: <strong>{(transferItemsModal.lines || []).length}</strong> &bull; Total Qty:{' '}
                    <strong className="mono">
                      {Number((transferItemsModal.lines || []).reduce((acc, l) => acc + Number(l.qty || 0), 0).toFixed(2))}
                    </strong>
                  </span>
                </div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setTransferItemsModal(null)}>
                Close
              </button>
            </div>
            <div style={{ overflowY: 'auto', marginTop: 12 }}>
              <DataTable
                data={(transferItemsModal.lines || []).map((l, idx) => ({ ...l, _rowNum: idx + 1 }))}
                searchPlaceholder="Search SKU, item name, batch #..."
                exportFilename={`${transferItemsModal.transfer_no || 'transfer'}-items.csv`}
                initialPageSize={25}
                columns={[
                  { key: '_rowNum', label: '#', sortValue: (l) => l._rowNum, render: (l) => <span className="mono" style={{ color: '#64748b' }}>{l._rowNum}</span> },
                  { key: 'sku', label: 'SKU', sortValue: (l) => l.sku || '', render: (l) => <span className="mono" style={{ fontWeight: 700 }}>{l.sku}</span> },
                  { key: 'item_name', label: 'Item Name', sortValue: (l) => l.item_name || '', render: (l) => <span>{l.item_name || '-'}</span> },
                  { key: 'batch_no', label: 'Batch #', sortValue: (l) => l.batch_no || '', render: (l) => <span className="badge badge-blue mono">{l.batch_no || '-'}</span> },
                  { key: 'qty', label: 'Qty', sortValue: (l) => Number(l.qty || 0), render: (l) => <span className="mono" style={{ fontWeight: 700 }}>{Number(Number(l.qty || 0).toFixed(2))}</span> },
                  { key: 'uom', label: 'UOM', sortValue: (l) => l.uom || '', render: (l) => <span style={{ color: '#475569' }}>{l.uom || 'PCS'}</span> },
                ]}
              />
            </div>
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
    </div>
  );
}

