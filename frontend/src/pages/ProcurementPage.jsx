import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePersistedState } from '../hooks/usePersistedState';
import DataTable from '../components/DataTable';
import SearchableSelect from '../components/SearchableSelect';
import ConfirmModal from '../components/ConfirmModal';
import * as XLSX from 'xlsx';
import { Plus, PackageCheck, Truck, ChevronRight, ChevronDown, Clock, Filter, Download, Upload, Trash2, CheckCircle2, AlertTriangle, Pencil, Save, X } from 'lucide-react';

export default function ProcurementPage() {
  const { formatMoney, formatDate, formatDateTime } = useAuth();
  const [tab, setTab] = usePersistedState('proc_tab', 'items');
  const [items, setItems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [grns, setGrns] = useState([]);
  const [stockScope, setStockScope] = usePersistedState('proc_stock_scope', 'total');
  const [stockPreset, setStockPreset] = usePersistedState('proc_stock_preset', 'all');
  const [minQty, setMinQty] = usePersistedState('proc_min_qty', '');
  const [maxQty, setMaxQty] = usePersistedState('proc_max_qty', '');
  const [agePreset, setAgePreset] = usePersistedState('proc_age_preset', 'all');
  const [stockSort, setStockSort] = usePersistedState('proc_stock_sort', 'default');
  const [expandedItemIds, setExpandedItemIds] = useState({});
  const [expandedGrnSuppliers, setExpandedGrnSuppliers] = useState({});
  const [expandedGrnIds, setExpandedGrnIds] = useState({});
  const [editingGrnBatchId, setEditingGrnBatchId] = useState(null);
  const [grnItemEditForm, setGrnItemEditForm] = useState({ qty_received: '', unit_cost: '', selling_price: '' });
  const [savingGrnItem, setSavingGrnItem] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [newItem, setNewItem] = useState({ sku: '', name: '', category: 'Beverages', uom: 'PCS', purchase_price: '', selling_price: '', track_expiry: 1 });
  const [newSup, setNewSup] = useState({ name: '', contact_person: '', phone: '', vat_number: '' });
  const [grnForm, setGrnForm] = useState({ supplier_id: '', supplier_invoice_no: '', item_id: '', qty: 50, unit_cost: '', selling_price: '', batch_no: '', expiry_date: '' });
  const [importRows, setImportRows] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [deleteGrnTarget, setDeleteGrnTarget] = useState(null);
  const [popupMsg, setPopupMsg] = useState(null);

  const computeNextBatchCode = (supplierId, batchList = batches) => {
    if (!supplierId) return '';
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const datePart = `${dd}${mm}${yy}`;
    const supCode = String(supplierId).padStart(2, '0');
    const regex = new RegExp(`^${datePart}B(\\d+)S${supCode}$`);
    let maxSeq = 0;
    (batchList || []).forEach((b) => {
      const m = String(b.batch_no || '').match(regex);
      if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
    });
    return `${datePart}B${maxSeq + 1}S${supCode}`;
  };

  const load = async () => {
    try {
      const [it, su, gr, bt] = await Promise.all([
        api.get('/api/items'),
        api.get('/api/suppliers'),
        api.get('/api/grns'),
        api.get('/api/inventory/batches'),
      ]);
      setItems(it); setSuppliers(su); setGrns(gr); setBatches(Array.isArray(bt) ? bt : []);
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { load(); }, []);

  const addItem = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api.post('/api/items', newItem);
      setMsg('Item added to catalog'); setNewItem({ sku: '', name: '', category: 'Beverages', uom: 'PCS', purchase_price: '', selling_price: '', track_expiry: 1 });
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const addSupplier = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api.post('/api/suppliers', newSup);
      setMsg('Supplier added'); setNewSup({ name: '', contact_person: '', phone: '', vat_number: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const receiveGrn = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      const res = await api.post('/api/grns', {
        supplier_id: grnForm.supplier_id,
        supplier_invoice_no: grnForm.supplier_invoice_no,
        lines: [{
          item_id: grnForm.item_id,
          qty: Number(grnForm.qty),
          unit_cost: Number(grnForm.unit_cost),
          selling_price: grnForm.selling_price !== '' ? Number(grnForm.selling_price) : undefined,
          batch_no: grnForm.batch_no || undefined,
          expiry_date: grnForm.expiry_date || null,
        }],
      });
      const createdBatch = res?.batches?.[0] ? ` (Batch: ${res.batches[0]})` : '';
      setMsg(`GRN ${res.grn_no}${createdBatch} received into Main Store!`);
      const freshBatches = await api.get('/api/inventory/batches').catch(() => batches);
      setGrnForm((prev) => ({
        ...prev,
        qty: 50,
        batch_no: computeNextBatchCode(prev.supplier_id, Array.isArray(freshBatches) ? freshBatches : batches),
        expiry_date: '',
      }));
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const handleConfirmDeleteGrn = async () => {
    if (!deleteGrnTarget) return;
    const target = deleteGrnTarget;
    setDeleteGrnTarget(null);
    setErr('');
    setMsg('');
    try {
      const res = await api.del(`/api/grns/${target.id}`);
      setMsg(res?.message || `GRN ${target.grn_no} deleted and all batch entries reverted.`);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const downloadGrnTemplate = () => {
    const sample1 = items[0] || { sku: 'ITM-0001', name: 'Sample Item 1', purchase_price: 1.0, selling_price: 1.5 };
    const sample2 = items[1] || { sku: 'ITM-0002', name: 'Sample Item 2', purchase_price: 1.2, selling_price: 1.7 };

    const templateRows = [
      {
        SKU: sample1.sku,
        'Item Name (Reference)': sample1.name,
        'Qty Received': 24,
        'Unit Cost': Number(sample1.purchase_price || 0),
        'Selling Price': Number(sample1.selling_price || 0),
        'Batch No': 'BCH-001',
        'Expiry Date (YYYY-MM-DD)': '2027-12-31',
      },
      {
        SKU: sample2.sku,
        'Item Name (Reference)': sample2.name,
        'Qty Received': 12,
        'Unit Cost': Number(sample2.purchase_price || 0),
        'Selling Price': Number(sample2.selling_price || 0),
        'Batch No': 'BCH-002',
        'Expiry Date (YYYY-MM-DD)': '',
      },
    ];

    const catalogRows = items.map((it) => ({
      SKU: it.sku,
      'Item Name': it.name,
      Category: it.category || '',
      UOM: it.uom || '',
      'Default Purchase Price': Number(it.purchase_price || 0),
      'Default Selling Price': Number(it.catalog_selling_price ?? it.selling_price ?? 0),
    }));

    const wb = XLSX.utils.book_new();
    const wsTemplate = XLSX.utils.json_to_sheet(templateRows);
    wsTemplate['!cols'] = [{ wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'GRN_Import');

    if (catalogRows.length > 0) {
      const wsCatalog = XLSX.utils.json_to_sheet(catalogRows);
      wsCatalog['!cols'] = [{ wch: 16 }, { wch: 34 }, { wch: 20 }, { wch: 10 }, { wch: 20 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsCatalog, 'Catalog_Reference');
    }

    XLSX.writeFile(wb, 'GRN_Import_Template.xlsx');
    setMsg('GRN Excel template downloaded (GRN_Import_Template.xlsx).');
  };

  const formatExcelDate = (val) => {
    if (!val) return '';
    if (val instanceof Date && !Number.isNaN(val.getTime())) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    return '';
  };

  const handleGrnExcelUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    setMsg('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const firstSheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!rawRows || rawRows.length === 0) {
        const em = 'The uploaded Excel/CSV file is empty.';
        setErr(em);
        setPopupMsg({ type: 'error', title: 'Import Error', message: em });
        return;
      }

      const normalizeKey = (k) => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const parsed = rawRows.map((row, idx) => {
        const mapped = {};
        Object.keys(row).forEach((k) => {
          mapped[normalizeKey(k)] = row[k];
        });

        const skuVal = String(mapped.sku || mapped.itemcode || '').trim();
        const nameVal = String(mapped.itemnamereference || mapped.itemname || mapped.name || '').trim();
        const qtyVal = Number(mapped.qtyreceived ?? mapped.qty ?? mapped.quantity ?? 0);
        const costRaw = mapped.unitcost ?? mapped.unitpurchasecost ?? mapped.cost ?? mapped.purchaseprice;
        const sellRaw = mapped.sellingprice ?? mapped.unitsellingprice ?? mapped.saleprice ?? mapped.price;
        const batchVal = String(mapped.batchno ?? mapped.batch ?? '').trim();
        const expiryVal = formatExcelDate(mapped.expirydateyyyymmdd ?? mapped.expirydate ?? mapped.expiry ?? '');

        const matchedItem =
          items.find((it) => String(it.sku || '').trim().toLowerCase() === skuVal.toLowerCase()) ||
          (nameVal ? items.find((it) => String(it.name || '').trim().toLowerCase() === nameVal.toLowerCase()) : null);

        const unitCostVal = costRaw !== '' && costRaw !== undefined && costRaw !== null
          ? Number(costRaw)
          : Number(matchedItem?.purchase_price || 0);
        const sellingPriceVal = sellRaw !== '' && sellRaw !== undefined && sellRaw !== null
          ? Number(sellRaw)
          : Number(matchedItem?.catalog_selling_price ?? matchedItem?.selling_price ?? 0);

        let error = '';
        if (!matchedItem) error = `SKU "${skuVal || nameVal || '-'}" not found`;
        else if (!(qtyVal > 0)) error = 'Qty must be > 0';
        else if (Number.isNaN(unitCostVal) || unitCostVal < 0) error = 'Invalid unit cost';
        else if (Number.isNaN(sellingPriceVal) || sellingPriceVal < 0) error = 'Invalid selling price';

        return {
          rowNo: idx + 2,
          sku: skuVal || matchedItem?.sku || '',
          item_id: matchedItem?.id || null,
          item_name: matchedItem?.name || nameVal || '-',
          qty: qtyVal,
          unit_cost: Number.isNaN(unitCostVal) ? 0 : unitCostVal,
          selling_price: Number.isNaN(sellingPriceVal) ? 0 : sellingPriceVal,
          batch_no: batchVal,
          expiry_date: expiryVal,
          error,
        };
      });

      setImportRows(parsed);
      setImportFileName(file.name);
      const validCount = parsed.filter((r) => !r.error).length;
      setMsg(`Loaded ${parsed.length} row(s) from ${file.name} (${validCount} valid). Review below and click Post Imported GRN.`);
    } catch (ex) {
      const em = 'Failed to read Excel file: ' + ex.message;
      setErr(em);
      setPopupMsg({ type: 'error', title: 'Import Error', message: em });
    }
  };

  const postImportedGrn = async () => {
    setErr('');
    setMsg('');
    if (!grnForm.supplier_id) {
      const em = 'Please select a Supplier above before posting the imported GRN.';
      setErr(em);
      setPopupMsg({ type: 'error', title: 'Supplier Required', message: em });
      return;
    }
    const validLines = importRows.filter((r) => !r.error && r.item_id);
    if (validLines.length === 0) {
      const em = 'No valid rows to import.';
      setErr(em);
      setPopupMsg({ type: 'error', title: 'No Valid Rows', message: em });
      return;
    }
    setImporting(true);
    try {
      const res = await api.post('/api/grns', {
        supplier_id: grnForm.supplier_id,
        supplier_invoice_no: grnForm.supplier_invoice_no,
        notes: `Excel Import (${importFileName})`,
        lines: validLines.map((r) => ({
          item_id: r.item_id,
          qty: Number(r.qty),
          unit_cost: Number(r.unit_cost),
          selling_price: Number(r.selling_price),
          batch_no: r.batch_no || undefined,
          expiry_date: r.expiry_date || null,
        })),
      });
      const sm = `GRN ${res.grn_no} posted with ${validLines.length} imported item line(s)!`;
      setMsg(sm);
      setPopupMsg({ type: 'success', title: 'GRN Posted', message: sm });
      setImportRows([]);
      setImportFileName('');
      load();
    } catch (e2) {
      setErr(e2.message);
      setPopupMsg({ type: 'error', title: 'Post Import Failed', message: e2.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>Procurement, Suppliers &amp; Item Master</h2>
          <p style={{ fontSize: 12.5, color: '#64748b' }}>Manage ~180+ SKUs with Purchase/Selling prices and receive supplier stock into FIFO/FEFO Main Store batches.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn btn-sm ${tab === 'items' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('items')}>Items ({items.length})</button>
          <button className={`btn btn-sm ${tab === 'grn' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('grn')}>Receive GRN ({grns.length})</button>
          <button className={`btn btn-sm ${tab === 'suppliers' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('suppliers')}>Suppliers ({suppliers.length})</button>
        </div>
      </div>

      {msg && <div className="badge badge-emerald" style={{ padding: '9px 14px', borderRadius: 8 }}>{msg}</div>}
      {err && <div className="badge badge-rose" style={{ padding: '9px 14px', borderRadius: 8 }}>{err}</div>}

      {tab === 'items' && (
        <>
          <form onSubmit={addItem} className="card">
            <div className="card-title">Add New Item to Catalog</div>
            <div className="grid-4">
              <div className="form-group"><label className="form-label">SKU</label><input className="form-control" required value={newItem.sku} onChange={e => setNewItem({ ...newItem, sku: e.target.value })} placeholder="SKU-113" /></div>
              <div className="form-group"><label className="form-label">Item Name</label><input className="form-control" required value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="Product name" /></div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <SearchableSelect
                  required
                  value={newItem.category}
                  onChange={val => setNewItem({ ...newItem, category: val })}
                  placeholder="Select Category..."
                  searchPlaceholder="Search category..."
                  options={Array.from(new Set([
                    'Beverages',
                    'Snacks & Confectionery',
                    'Chocolate & Candy',
                    'Biscuits & Bakery',
                    'Coffee & Tea',
                    'Water & Juices',
                    'Dairy & Chilled',
                    'Grocery & Dry Goods',
                    'Personal Care',
                    'Household',
                    'General',
                    ...items.map(it => it.category).filter(Boolean),
                  ])).sort().map(c => ({ value: c, label: c }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">UOM (Unit)</label>
                <SearchableSelect
                  required
                  value={newItem.uom}
                  onChange={val => setNewItem({ ...newItem, uom: val })}
                  placeholder="Select Unit..."
                  searchPlaceholder="Search unit..."
                  options={Array.from(new Set([
                    'PCS', 'BOX', 'CTN', 'PKT', 'PACK', 'CASE', 'BTL', 'CAN',
                    'KG', 'G', 'LTR', 'ML', 'DOZ', 'TRAY', 'BAG',
                    ...items.map(it => it.uom).filter(Boolean),
                  ])).sort().map(u => ({ value: u, label: u }))}
                />
              </div>
              <div className="form-group"><label className="form-label">Purchase Price</label><input className="form-control mono" type="number" step="0.001" required value={newItem.purchase_price} onChange={e => setNewItem({ ...newItem, purchase_price: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Selling Price</label><input className="form-control mono" type="number" step="0.001" required value={newItem.selling_price} onChange={e => setNewItem({ ...newItem, selling_price: e.target.value })} /></div>
              <div className="form-group">
                <label className="form-label">Model</label>
                <SearchableSelect
                  value={newItem.track_expiry}
                  onChange={val => setNewItem({ ...newItem, track_expiry: Number(val) })}
                  searchPlaceholder="Search model..."
                  options={[
                    { value: 1, label: 'FEFO (Expiry Tracked)' },
                    { value: 0, label: 'FIFO (Non-Expiry)' },
                  ]}
                />
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-blue"><Plus size={15} /> Add Item</button>
              </div>
            </div>
          </form>

          <div className="card">
            <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span>Item Master, Stock Availability &amp; Batch Stock Age</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    const all = {};
                    items.forEach((it) => { all[it.id] = true; });
                    setExpandedItemIds(all);
                  }}
                >
                  Expand All
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setExpandedItemIds({})}>
                  Collapse All
                </button>
              </div>
            </div>

            {(() => {
              const nowMs = Date.now();
              const enrichedItems = items.map((it) => {
                const itemBatches = batches
                  .filter((b) => Number(b.item_id) === Number(it.id))
                  .filter((b) => stockScope === 'total' || (stockScope === 'main_store' ? b.location_type === 'main_store' : b.location_type === 'van'))
                  .map((b) => {
                    const recTs = b.received_at || b.created_at;
                    const ageDays = recTs ? Math.max(0, Math.floor((nowMs - new Date(recTs).getTime()) / 86400000)) : 0;
                    const expDays = b.expiry_date ? Math.ceil((new Date(b.expiry_date).getTime() - nowMs) / 86400000) : null;
                    return { ...b, ageDays, expDays };
                  });

                const mainQty = Number(it.main_store_qty || 0);
                const vanQty = Number(it.vans_qty || 0);
                const scopedQty = stockScope === 'main_store' ? mainQty : stockScope === 'vans' ? vanQty : (mainQty + vanQty);
                const oldestAgeDays = itemBatches.length > 0 ? Math.max(...itemBatches.map(b => b.ageDays)) : null;
                const expVals = itemBatches.map(b => b.expDays).filter(v => v !== null);
                const soonestExpiryDays = expVals.length > 0 ? Math.min(...expVals) : null;

                return { ...it, itemBatches, scopedQty, oldestAgeDays, soonestExpiryDays };
              });

              const filteredItems = enrichedItems.filter((it) => {
                const q = it.scopedQty;
                if (stockPreset === 'gt0' && !(q > 0)) return false;
                if (stockPreset === 'eq0' && !(q === 0)) return false;
                if (stockPreset === '1_10' && !(q >= 1 && q <= 10)) return false;
                if (stockPreset === '11_50' && !(q >= 11 && q <= 50)) return false;
                if (stockPreset === '50_100' && !(q >= 50 && q <= 100)) return false;
                if (stockPreset === 'gt100' && !(q > 100)) return false;
                if (minQty !== '' && q < Number(minQty)) return false;
                if (maxQty !== '' && q > Number(maxQty)) return false;

                const age = it.oldestAgeDays;
                if (agePreset === '0_30' && !(age !== null && age <= 30)) return false;
                if (agePreset === '31_60' && !(age !== null && age >= 31 && age <= 60)) return false;
                if (agePreset === '61_90' && !(age !== null && age >= 61 && age <= 90)) return false;
                if (agePreset === '90_plus' && !(age !== null && age > 90)) return false;
                if (agePreset === 'expiring' && !(it.soonestExpiryDays !== null && it.soonestExpiryDays <= 30)) return false;

                return true;
              });

              const sortedItems = [...filteredItems].sort((a, b) => {
                if (stockSort === 'less_to_more') return a.scopedQty - b.scopedQty;
                if (stockSort === 'more_to_less') return b.scopedQty - a.scopedQty;
                if (stockSort === 'oldest_first') return (b.oldestAgeDays ?? -1) - (a.oldestAgeDays ?? -1);
                return 0;
              });

              const resetAllFilters = () => {
                setStockScope('total');
                setStockPreset('all');
                setMinQty('');
                setMaxQty('');
                setAgePreset('all');
                setStockSort('default');
              };

              return (
                <>
                  <div style={{ padding: '12px 14px', marginBottom: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Filter size={13} /> Stock Scope:
                        </span>
                        {[
                          { id: 'total', label: 'Total (Main + Vans)' },
                          { id: 'main_store', label: 'Main Store' },
                          { id: 'vans', label: 'On Vans' },
                        ].map(s => (
                          <button
                            key={s.id}
                            type="button"
                            className={`btn btn-sm ${stockScope === s.id ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setStockScope(s.id)}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>Sort:</span>
                        {[
                          { id: 'default', label: 'Default' },
                          { id: 'less_to_more', label: 'Less → More' },
                          { id: 'more_to_less', label: 'More → Less' },
                          { id: 'oldest_first', label: 'Oldest Age' },
                        ].map(s => (
                          <button
                            key={s.id}
                            type="button"
                            className={`btn btn-sm ${stockSort === s.id ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setStockSort(s.id)}
                          >
                            {s.label}
                          </button>
                        ))}
                        {(stockScope !== 'total' || stockPreset !== 'all' || minQty !== '' || maxQty !== '' || agePreset !== 'all' || stockSort !== 'default') && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={resetAllFilters}>
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: '#334155' }}>Availability:</span>
                      {[
                        { id: 'all', label: 'All' },
                        { id: 'gt0', label: '> 0 (In Stock)' },
                        { id: 'eq0', label: '= 0 (Out of Stock)' },
                        { id: '1_10', label: '1 – 10 (Low)' },
                        { id: '11_50', label: '11 – 50' },
                        { id: '50_100', label: '50 – 100' },
                        { id: 'gt100', label: '> 100 (High)' },
                      ].map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className={`btn btn-sm ${stockPreset === p.id ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setStockPreset(p.id)}
                        >
                          {p.label}
                        </button>
                      ))}
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                        <input
                          type="number"
                          className="form-control mono"
                          style={{ width: 72, padding: '4px 6px', fontSize: 11.5 }}
                          placeholder="Min"
                          value={minQty}
                          onChange={(e) => setMinQty(e.target.value)}
                        />
                        <span style={{ fontSize: 11, color: '#64748b' }}>to</span>
                        <input
                          type="number"
                          className="form-control mono"
                          style={{ width: 72, padding: '4px 6px', fontSize: 11.5 }}
                          placeholder="Max"
                          value={maxQty}
                          onChange={(e) => setMaxQty(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={13} /> Stock Age (Batches):
                      </span>
                      {[
                        { id: 'all', label: 'All Ages' },
                        { id: '0_30', label: '0 – 30 Days' },
                        { id: '31_60', label: '31 – 60 Days' },
                        { id: '61_90', label: '61 – 90 Days' },
                        { id: '90_plus', label: '90+ Days (Aged)' },
                        { id: 'expiring', label: 'Expiring ≤ 30d' },
                      ].map(a => (
                        <button
                          key={a.id}
                          type="button"
                          className={`btn btn-sm ${agePreset === a.id ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setAgePreset(a.id)}
                        >
                          {a.label}
                        </button>
                      ))}
                      <span className="badge badge-blue mono" style={{ marginLeft: 'auto' }}>
                        {sortedItems.length} / {items.length} SKUs
                      </span>
                    </div>
                  </div>

                  <DataTable
                    data={sortedItems}
                    searchPlaceholder="Search SKU, item name, category, batch #..."
                    exportFilename="item-master-stock-age.csv"
                    emptyText="No items match the selected stock/age filters."
                    columns={[
                      { key: 'sku', label: 'SKU', sortValue: (it) => it.sku || '', searchValue: (it) => `${it.sku} ${it.itemBatches.map(b => b.batch_no).join(' ')}` },
                      { key: 'name', label: 'Name', sortValue: (it) => it.name || '', searchValue: (it) => `${it.name || ''} ${it.uom || ''}` },
                      { key: 'category', label: 'Category', sortValue: (it) => it.category || '' },
                      { key: 'main_store_qty', label: 'Main Store', sortValue: (it) => Number(it.main_store_qty || 0) },
                      { key: 'vans_qty', label: 'On Vans', sortValue: (it) => Number(it.vans_qty || 0) },
                      { key: 'oldestAgeDays', label: 'Oldest Age', sortValue: (it) => it.oldestAgeDays ?? -1 },
                    ]}
                    renderParentChild={(it) => {
                      const isOpen = !!expandedItemIds[it.id];
                      const ageColor = it.oldestAgeDays === null ? 'badge-slate' : it.oldestAgeDays > 90 ? 'badge-rose' : it.oldestAgeDays > 30 ? 'badge-amber' : 'badge-emerald';
                      return (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                          <button
                            type="button"
                            onClick={() => setExpandedItemIds((prev) => ({ ...prev, [it.id]: !prev[it.id] }))}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: 10,
                              padding: '10px 14px',
                              background: isOpen ? '#eff6ff' : '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px', minWidth: 0 }}>
                              {isOpen ? <ChevronDown size={15} color="#2563eb" /> : <ChevronRight size={15} color="#64748b" />}
                              <span className="mono" style={{ fontWeight: 700, fontSize: 12, color: '#334155' }}>{it.sku}</span>
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{it.name}</span>
                              <span style={{ fontSize: 11, color: '#64748b' }}>({it.uom})</span>
                              <span className="badge badge-slate" style={{ fontSize: 10.5 }}>{it.category}</span>
                              <span className={`badge ${it.track_expiry ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: 10.5 }}>
                                {it.track_expiry ? 'FEFO' : 'FIFO'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11.5 }}>
                              <span className="mono" style={{ color: '#64748b' }}>Buy: {formatMoney(it.purchase_price)}</span>
                              <span className="mono" style={{ fontWeight: 700, color: '#0f172a' }}>Sell: {formatMoney(it.selling_price)}</span>
                              <span className={`badge ${Number(it.main_store_qty) > 0 ? 'badge-emerald' : 'badge-rose'} mono`}>
                                Main: {Number(it.main_store_qty)}
                              </span>
                              <span className="badge badge-blue mono">Vans: {Number(it.vans_qty)}</span>
                              <span className={`badge ${ageColor} mono`}>
                                {it.oldestAgeDays !== null ? `Age: ${it.oldestAgeDays}d` : 'No Batches'}
                              </span>
                              <span className="badge badge-slate mono">{it.itemBatches.length} Batch{it.itemBatches.length === 1 ? '' : 'es'}</span>
                            </div>
                          </button>

                          {isOpen && (
                            <div style={{ padding: '10px 14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                              {it.itemBatches.length === 0 ? (
                                <div style={{ fontSize: 12, color: '#64748b', padding: '6px 0' }}>
                                  No active stock batches available for this item in the selected scope.
                                </div>
                              ) : (
                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff', borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                    <thead>
                                      <tr style={{ background: '#f1f5f9', textAlign: 'left', color: '#475569', fontSize: 11 }}>
                                        <th style={{ padding: '7px 10px' }}>Batch #</th>
                                        <th style={{ padding: '7px 10px' }}>Location</th>
                                        <th style={{ padding: '7px 10px' }}>Received Date</th>
                                        <th style={{ padding: '7px 10px' }}>Stock Age</th>
                                        <th style={{ padding: '7px 10px' }}>Expiry Date</th>
                                        <th style={{ padding: '7px 10px' }}>Unit Cost</th>
                                        <th style={{ padding: '7px 10px' }}>Qty Available</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {it.itemBatches.map((b) => (
                                        <tr key={b.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                          <td style={{ padding: '7px 10px' }} className="mono"><strong>{b.batch_no}</strong></td>
                                          <td style={{ padding: '7px 10px' }}>
                                            <span className={`badge ${b.location_type === 'main_store' ? 'badge-emerald' : 'badge-blue'}`}>
                                              {b.location_type === 'main_store' ? 'Main Store' : (b.van_name || `Van #${b.van_id}`)}
                                            </span>
                                          </td>
                                          <td style={{ padding: '7px 10px', color: '#475569' }} className="mono">
                                            {formatDate(b.received_at || b.created_at) || '-'}
                                          </td>
                                          <td style={{ padding: '7px 10px' }}>
                                            <span className={`badge ${b.ageDays > 90 ? 'badge-rose' : b.ageDays > 30 ? 'badge-amber' : 'badge-emerald'} mono`}>
                                              {b.ageDays} days
                                            </span>
                                          </td>
                                          <td style={{ padding: '7px 10px' }} className="mono">
                                            {b.expiry_date ? (
                                              <span className={`badge ${b.expDays <= 0 ? 'badge-rose' : b.expDays <= 30 ? 'badge-amber' : 'badge-slate'} mono`}>
                                                {formatDate(b.expiry_date)} ({b.expDays <= 0 ? 'Expired' : `${b.expDays}d left`})
                                              </span>
                                            ) : (
                                              <span style={{ color: '#94a3b8' }}>No Expiry</span>
                                            )}
                                          </td>
                                          <td style={{ padding: '7px 10px' }} className="mono">{formatMoney(b.unit_cost)}</td>
                                          <td style={{ padding: '7px 10px' }} className="mono"><strong>{Number(b.qty_available)} {it.uom}</strong></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                </>
              );
            })()}
          </div>
        </>
      )}

      {tab === 'grn' && (
        <>
          <form onSubmit={receiveGrn} className="card">
            <div className="card-title"><span><PackageCheck size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Receive Goods from Supplier (GRN)</span></div>
            <div className="grid-4">
              <div className="form-group">
                <label className="form-label">Supplier</label>
                <SearchableSelect
                  required
                  value={grnForm.supplier_id}
                  onChange={val => setGrnForm({ ...grnForm, supplier_id: val, batch_no: computeNextBatchCode(val) })}
                  placeholder="Select Supplier..."
                  searchPlaceholder="Search supplier..."
                  options={suppliers.map(s => ({ value: s.id, label: s.name, sublabel: s.phone }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Item</label>
                <SearchableSelect
                  required
                  value={grnForm.item_id}
                  onChange={val => {
                    const it = items.find(x => String(x.id) === String(val));
                    setGrnForm({
                      ...grnForm,
                      item_id: val,
                      unit_cost: it ? it.purchase_price : '',
                      selling_price: it ? (it.catalog_selling_price ?? it.selling_price ?? '') : '',
                    });
                  }}
                  placeholder="Select Item..."
                  searchPlaceholder="Search SKU or item name..."
                  options={items.map(it => ({ value: it.id, label: `${it.sku} - ${it.name}`, sublabel: it.category }))}
                />
              </div>
              <div className="form-group"><label className="form-label">Supplier Invoice #</label><input className="form-control" value={grnForm.supplier_invoice_no} onChange={e => setGrnForm({ ...grnForm, supplier_invoice_no: e.target.value })} placeholder="INV-SUP-101" /></div>
              <div className="form-group"><label className="form-label">Qty Received</label><input className="form-control mono" type="number" required value={grnForm.qty} onChange={e => setGrnForm({ ...grnForm, qty: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Unit Purchase Cost</label><input className="form-control mono" type="number" step="0.001" required value={grnForm.unit_cost} onChange={e => setGrnForm({ ...grnForm, unit_cost: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Batch Selling Price</label><input className="form-control mono" type="number" step="0.001" required value={grnForm.selling_price} onChange={e => setGrnForm({ ...grnForm, selling_price: e.target.value })} placeholder="e.g. 1.500" /></div>
              <div className="form-group"><label className="form-label">Batch Code (Auto)</label><input className="form-control mono" value={grnForm.batch_no} onChange={e => setGrnForm({ ...grnForm, batch_no: e.target.value })} placeholder="Auto: e.g. 141126B1S01" /></div>
              <div className="form-group"><label className="form-label">Expiry Date</label><input className="form-control" type="date" value={grnForm.expiry_date} onChange={e => setGrnForm({ ...grnForm, expiry_date: e.target.value })} /></div>
            </div>
            <button type="submit" className="btn btn-emerald"><PackageCheck size={15} /> Post GRN to Main Store</button>
          </form>

          {/* Excel Template Download & Bulk GRN Import */}
          <div className="card">
            <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span><Upload size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Bulk GRN Excel Import</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={downloadGrnTemplate}>
                  <Download size={14} /> Download Excel Template (.xlsx)
                </button>
                <label className="btn btn-blue btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                  <Upload size={14} /> Import Excel / CSV
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: 'none' }}
                    onChange={handleGrnExcelUpload}
                  />
                </label>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: importRows.length > 0 ? 12 : 0 }}>
              1) Select <strong>Supplier</strong> and <strong>Supplier Invoice #</strong> above. 2) Download the Excel template (includes a <em>Catalog_Reference</em> sheet with your SKUs), fill in Qty, Unit Cost, Batch No &amp; Expiry Date, and upload it here.
            </p>

            {importRows.length > 0 && (() => {
              const validRows = importRows.filter((r) => !r.error);
              const invalidRows = importRows.filter((r) => !!r.error);
              const totalImportCost = validRows.reduce((s, r) => s + Number(r.qty) * Number(r.unit_cost), 0);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontWeight: 700, fontSize: 12.5 }}>{importFileName}</span>
                    <span className="badge badge-emerald">Valid: {validRows.length}</span>
                    {invalidRows.length > 0 && <span className="badge badge-rose">Errors: {invalidRows.length}</span>}
                    <span className="badge badge-blue mono" style={{ marginLeft: 'auto' }}>Total Cost: {formatMoney(totalImportCost)}</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { setImportRows([]); setImportFileName(''); }}>
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn btn-emerald btn-sm"
                      disabled={importing || validRows.length === 0}
                      onClick={postImportedGrn}
                    >
                      <PackageCheck size={14} /> {importing ? 'Posting...' : `Post Imported GRN (${validRows.length} items)`}
                    </button>
                  </div>

                  <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>SKU</th>
                          <th>Item Name</th>
                          <th style={{ textAlign: 'right' }}>Qty</th>
                          <th style={{ textAlign: 'right' }}>Unit Cost</th>
                          <th style={{ textAlign: 'right' }}>Selling Price</th>
                          <th style={{ textAlign: 'right' }}>Line Total</th>
                          <th>Batch #</th>
                          <th>Expiry</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((r, i) => (
                          <tr key={i} style={{ background: r.error ? '#fff1f2' : undefined }}>
                            <td className="mono">{r.rowNo}</td>
                            <td className="mono" style={{ fontWeight: 700 }}>{r.sku || '-'}</td>
                            <td>{r.item_name}</td>
                            <td className="mono" style={{ textAlign: 'right' }}>{r.qty}</td>
                            <td className="mono" style={{ textAlign: 'right' }}>{Number(r.unit_cost || 0).toFixed(3)}</td>
                            <td className="mono" style={{ textAlign: 'right', color: '#059669', fontWeight: 700 }}>{Number(r.selling_price || 0).toFixed(3)}</td>
                            <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(Number(r.qty || 0) * Number(r.unit_cost || 0))}</td>
                            <td className="mono">{r.batch_no || 'Auto'}</td>
                            <td className="mono">{r.expiry_date ? formatDate(r.expiry_date) : '-'}</td>
                            <td>
                              {r.error ? (
                                <span className="badge badge-rose" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <AlertTriangle size={11} /> {r.error}
                                </span>
                              ) : (
                                <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle2 size={11} /> Ready
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                style={{ padding: '2px 6px', color: '#be123c' }}
                                onClick={() => setImportRows((prev) => prev.filter((_, idx) => idx !== i))}
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>

          {(() => {
            const startEditGrnItem = (it) => {
              setEditingGrnBatchId(it.id);
              setGrnItemEditForm({
                qty_received: String(Number(it.qty_received || 0)),
                unit_cost: String(Number(it.unit_cost || 0)),
                selling_price: it.selling_price !== null && it.selling_price !== undefined ? String(Number(it.selling_price)) : '',
              });
            };

            const saveGrnItemEdit = async (grnId, batchId) => {
              setErr(''); setMsg('');
              setSavingGrnItem(true);
              try {
                await api.put(`/api/grns/${grnId}/items/${batchId}`, {
                  qty_received: Number(grnItemEditForm.qty_received),
                  unit_cost: Number(grnItemEditForm.unit_cost),
                  selling_price: grnItemEditForm.selling_price === '' ? null : Number(grnItemEditForm.selling_price),
                });
                setEditingGrnBatchId(null);
                setMsg('GRN item updated and GRN total recalculated!');
                load();
              } catch (e2) {
                setErr(e2.message);
              } finally {
                setSavingGrnItem(false);
              }
            };

            const grnSupplierGroups = Object.values(
              grns.reduce((acc, g) => {
                const key = String(g.supplier_id || g.supplier_name || 'unknown');
                if (!acc[key]) {
                  acc[key] = {
                    id: key,
                    supplier_id: g.supplier_id,
                    supplier_name: g.supplier_name || 'Unknown Supplier',
                    grnCount: 0,
                    totalItems: 0,
                    totalQty: 0,
                    totalCost: 0,
                    latestDate: '',
                    grns: [],
                  };
                }
                const gItems = g.items || [];
                const gItemCount = Number(g.item_count ?? gItems.length);
                const gQty = Number(g.total_qty ?? gItems.reduce((s, it) => s + Number(it.qty_received || 0), 0));
                acc[key].grnCount += 1;
                acc[key].totalItems += gItemCount;
                acc[key].totalQty += gQty;
                acc[key].totalCost += Number(g.total_cost || 0);
                const d = String(g.received_at || '');
                if (d > acc[key].latestDate) acc[key].latestDate = d;
                acc[key].grns.push({ ...g, items: gItems, item_count: gItemCount, total_qty: gQty });
                return acc;
              }, {})
            );

            return (
              <div className="card">
                <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span>Recent Goods Receipts (GRN) &mdash; Grouped by Supplier</span>
                  {grnSupplierGroups.length > 0 && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          const all = {};
                          grnSupplierGroups.forEach(sg => { all[sg.id] = true; });
                          setExpandedGrnSuppliers(all);
                        }}
                      >
                        Expand All
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setExpandedGrnSuppliers({})}
                      >
                        Collapse All
                      </button>
                    </div>
                  )}
                </div>
                <DataTable
                  data={grnSupplierGroups}
                  emptyText="No goods receipts found."
                  searchPlaceholder="Search supplier, GRN #, batch code, item, invoice..."
                  exportFilename="goods-receipts-by-supplier.csv"
                  columns={[
                    {
                      key: 'supplier_name',
                      label: 'Supplier',
                      sortValue: (sg) => sg.supplier_name || '',
                      searchValue: (sg) => `${sg.supplier_name} ${sg.grns.map(g => `${g.grn_no} ${g.batch_nos || ''} ${g.supplier_invoice_no || ''} ${(g.items || []).map(it => `${it.sku} ${it.item_name}`).join(' ')}`).join(' ')}`,
                    },
                    { key: 'grnCount', label: 'GRNs', sortValue: (sg) => sg.grnCount },
                    { key: 'totalItems', label: 'Items', sortValue: (sg) => sg.totalItems },
                    { key: 'totalQty', label: 'Total Qty', sortValue: (sg) => sg.totalQty },
                    { key: 'totalCost', label: 'Total Cost', sortValue: (sg) => sg.totalCost },
                    { key: 'latestDate', label: 'Latest Receipt', sortValue: (sg) => sg.latestDate || '' },
                  ]}
                  renderParentChild={(sg) => {
                    const isOpen = !!expandedGrnSuppliers[sg.id];
                    return (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                        <button
                          type="button"
                          onClick={() => setExpandedGrnSuppliers(prev => ({ ...prev, [sg.id]: !prev[sg.id] }))}
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
                            <span>{sg.supplier_name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                            <span className="badge badge-blue mono">{sg.grnCount} GRN(s)</span>
                            <span className="badge badge-slate mono">{sg.totalItems} Items</span>
                            <span className="badge badge-slate mono">Qty: {Number(sg.totalQty || 0).toFixed(2)}</span>
                            <span className="badge badge-emerald mono">Total: {formatMoney(sg.totalCost)}</span>
                            {sg.latestDate && (
                              <span className="mono" style={{ fontSize: 11.5, color: '#64748b' }}>
                                Latest: {formatDateTime(sg.latestDate)}
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
                                    <th style={{ padding: '7px 10px' }}>GRN #</th>
                                    <th style={{ padding: '7px 10px' }}>Supplier Inv</th>
                                    <th style={{ padding: '7px 10px' }}>Items</th>
                                    <th style={{ padding: '7px 10px' }}>Total Qty</th>
                                    <th style={{ padding: '7px 10px' }}>Total Cost</th>
                                    <th style={{ padding: '7px 10px' }}>Received At</th>
                                    <th style={{ padding: '7px 10px' }}>Store Items &amp; Rework</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sg.grns.map((g) => {
                                    const itemsOpen = !!expandedGrnIds[g.id];
                                    return (
                                      <React.Fragment key={g.id}>
                                        <tr style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'middle' }}>
                                          <td style={{ padding: '7px 10px' }} className="mono"><strong>{g.grn_no}</strong></td>
                                          <td style={{ padding: '7px 10px' }} className="mono">{g.supplier_invoice_no || '-'}</td>
                                          <td style={{ padding: '7px 10px' }}>
                                            <span className="badge badge-blue mono">{g.item_count} Items</span>
                                          </td>
                                          <td style={{ padding: '7px 10px' }} className="mono"><strong>{Number(g.total_qty || 0).toFixed(2)}</strong></td>
                                          <td style={{ padding: '7px 10px' }} className="mono"><strong>{formatMoney(g.total_cost)}</strong></td>
                                          <td style={{ padding: '7px 10px', color: '#475569' }} className="mono">{formatDateTime(g.received_at)}</td>
                                          <td style={{ padding: '7px 10px' }}>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                              <button
                                                type="button"
                                                className={`btn btn-sm ${itemsOpen ? 'btn-primary' : 'btn-outline'}`}
                                                onClick={() => setExpandedGrnIds(prev => ({ ...prev, [g.id]: !prev[g.id] }))}
                                              >
                                                {itemsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                                Item List ({g.item_count})
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-outline btn-sm"
                                                style={{ color: '#be123c', borderColor: '#fecdd3' }}
                                                onClick={() => setDeleteGrnTarget(g)}
                                              >
                                                <Trash2 size={13} /> Delete
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                        {itemsOpen && (
                                          <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                                            <td colSpan={7} style={{ padding: '10px 12px' }}>
                                              {(g.items || []).length === 0 ? (
                                                <div style={{ fontSize: 12, color: '#64748b' }}>No store items recorded for this GRN.</div>
                                              ) : (
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden' }}>
                                                  <thead>
                                                    <tr style={{ background: '#e2e8f0', textAlign: 'left', color: '#334155', fontSize: 10.5 }}>
                                                      <th style={{ padding: '6px 8px' }}>#</th>
                                                      <th style={{ padding: '6px 8px' }}>Item (SKU &amp; Name)</th>
                                                      <th style={{ padding: '6px 8px' }}>Batch #</th>
                                                      <th style={{ padding: '6px 8px' }}>Expiry Date</th>
                                                      <th style={{ padding: '6px 8px' }}>Qty Entered</th>
                                                      <th style={{ padding: '6px 8px' }}>Store Avail</th>
                                                      <th style={{ padding: '6px 8px' }}>Unit Cost</th>
                                                      <th style={{ padding: '6px 8px' }}>Selling Price</th>
                                                      <th style={{ padding: '6px 8px' }}>Line Total</th>
                                                      <th style={{ padding: '6px 8px' }}>Edit</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {g.items.map((it, idx) => {
                                                      const isEditing = editingGrnBatchId === it.id;
                                                      const liveLineTotal = isEditing
                                                        ? Number(grnItemEditForm.qty_received || 0) * Number(grnItemEditForm.unit_cost || 0)
                                                        : Number(it.line_total || 0);
                                                      return (
                                                      <tr key={it.id || idx} style={{ borderTop: '1px solid #e2e8f0', background: isEditing ? '#eff6ff' : 'transparent' }}>
                                                        <td style={{ padding: '5px 8px', color: '#64748b' }} className="mono">{idx + 1}</td>
                                                        <td style={{ padding: '5px 8px' }}><strong>{it.sku}</strong> &mdash; {it.item_name}</td>
                                                        <td style={{ padding: '5px 8px', color: '#1d4ed8', fontWeight: 700 }} className="mono">{it.batch_no}</td>
                                                        <td style={{ padding: '5px 8px' }} className="mono">{it.expiry_date ? formatDate(it.expiry_date) : '-'}</td>
                                                        <td style={{ padding: '5px 8px', fontWeight: 700 }} className="mono">
                                                          {isEditing ? (
                                                            <input
                                                              type="number"
                                                              step="0.01"
                                                              min="0.01"
                                                              className="form-control mono"
                                                              style={{ width: 85, padding: '3px 6px', fontSize: 11.5 }}
                                                              value={grnItemEditForm.qty_received}
                                                              onChange={e => setGrnItemEditForm(prev => ({ ...prev, qty_received: e.target.value }))}
                                                            />
                                                          ) : (
                                                            `${Number(it.qty_received || 0).toFixed(2)} ${it.uom}`
                                                          )}
                                                        </td>
                                                        <td style={{ padding: '5px 8px' }} className="mono">{Number(it.qty_available || 0).toFixed(2)} {it.uom}</td>
                                                        <td style={{ padding: '5px 8px' }} className="mono">
                                                          {isEditing ? (
                                                            <input
                                                              type="number"
                                                              step="0.001"
                                                              min="0"
                                                              className="form-control mono"
                                                              style={{ width: 90, padding: '3px 6px', fontSize: 11.5 }}
                                                              value={grnItemEditForm.unit_cost}
                                                              onChange={e => setGrnItemEditForm(prev => ({ ...prev, unit_cost: e.target.value }))}
                                                            />
                                                          ) : (
                                                            formatMoney(it.unit_cost)
                                                          )}
                                                        </td>
                                                        <td style={{ padding: '5px 8px' }} className="mono">
                                                          {isEditing ? (
                                                            <input
                                                              type="number"
                                                              step="0.001"
                                                              min="0"
                                                              placeholder="Optional"
                                                              className="form-control mono"
                                                              style={{ width: 90, padding: '3px 6px', fontSize: 11.5 }}
                                                              value={grnItemEditForm.selling_price}
                                                              onChange={e => setGrnItemEditForm(prev => ({ ...prev, selling_price: e.target.value }))}
                                                            />
                                                          ) : (
                                                            it.selling_price !== null ? formatMoney(it.selling_price) : '-'
                                                          )}
                                                        </td>
                                                        <td style={{ padding: '5px 8px', fontWeight: 700 }} className="mono">{formatMoney(liveLineTotal)}</td>
                                                        <td style={{ padding: '5px 8px' }}>
                                                          {isEditing ? (
                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                              <button
                                                                type="button"
                                                                className="btn btn-emerald btn-sm"
                                                                disabled={savingGrnItem}
                                                                title="Save"
                                                                onClick={() => saveGrnItemEdit(g.id, it.id)}
                                                              >
                                                                <Save size={12} />
                                                              </button>
                                                              <button
                                                                type="button"
                                                                className="btn btn-outline btn-sm"
                                                                title="Cancel"
                                                                onClick={() => setEditingGrnBatchId(null)}
                                                              >
                                                                <X size={12} />
                                                              </button>
                                                            </div>
                                                          ) : (
                                                            <button
                                                              type="button"
                                                              className="btn btn-outline btn-sm"
                                                              title="Edit Qty, Unit Cost & Selling Price"
                                                              onClick={() => startEditGrnItem(it)}
                                                            >
                                                              <Pencil size={12} />
                                                            </button>
                                                          )}
                                                        </td>
                                                      </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                </table>
                                              )}
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
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
            );
          })()}

          <ConfirmModal
            open={!!deleteGrnTarget}
            title="Delete & Rework GRN Batch?"
            message={deleteGrnTarget ? `Delete GRN ${deleteGrnTarget.grn_no} (${deleteGrnTarget.batch_nos || 'batch'}) and revert its stock & cost entries? (Only allowed if no stock from this batch has been sold or transferred.)` : ''}
            confirmLabel="Delete & Rework"
            confirmVariant="rose"
            onConfirm={handleConfirmDeleteGrn}
            onCancel={() => setDeleteGrnTarget(null)}
          />
        </>
      )}

      {tab === 'suppliers' && (
        <>
          <form onSubmit={addSupplier} className="card">
            <div className="card-title">Add Supplier</div>
            <div className="grid-4">
              <div className="form-group"><label className="form-label">Company Name</label><input className="form-control" required value={newSup.name} onChange={e => setNewSup({ ...newSup, name: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Contact Person</label><input className="form-control" value={newSup.contact_person} onChange={e => setNewSup({ ...newSup, contact_person: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={newSup.phone} onChange={e => setNewSup({ ...newSup, phone: e.target.value })} /></div>
              <div className="form-group" style={{ justifyContent: 'flex-end' }}><button type="submit" className="btn btn-blue"><Truck size={15} /> Save Supplier</button></div>
            </div>
          </form>
          <div className="card">
            <DataTable
              data={suppliers}
              searchPlaceholder="Search supplier, contact, phone, VAT..."
              exportFilename="suppliers.csv"
              columns={[
                { key: 'name', label: 'Name', sortValue: (s) => s.name || '', render: (s) => <span style={{ fontWeight: 700 }}>{s.name}</span> },
                { key: 'contact_person', label: 'Contact', sortValue: (s) => s.contact_person || '' },
                { key: 'phone', label: 'Phone', sortValue: (s) => s.phone || '' },
                { key: 'vat_number', label: 'VAT #', sortValue: (s) => s.vat_number || '', render: (s) => <span className="mono">{s.vat_number || '-'}</span> },
              ]}
            />
          </div>
        </>
      )}
      {popupMsg && (
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
          onClick={() => setPopupMsg(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 440,
              margin: 0,
              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.28)',
              borderTop: `4px solid ${popupMsg.type === 'success' ? '#059669' : '#dc2626'}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              {popupMsg.type === 'success' ? (
                <CheckCircle2 size={22} color="#059669" />
              ) : (
                <AlertTriangle size={22} color="#dc2626" />
              )}
              <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{popupMsg.title}</span>
            </div>
            <p style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.5, margin: '0 0 18px 0' }}>
              {popupMsg.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {popupMsg.type === 'error' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setPopupMsg(null);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Go to Top
                </button>
              )}
              <button
                type="button"
                className={`btn btn-sm ${popupMsg.type === 'success' ? 'btn-emerald' : 'btn-rose'}`}
                onClick={() => setPopupMsg(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

