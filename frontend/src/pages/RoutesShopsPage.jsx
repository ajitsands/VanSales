import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import DataTable from '../components/DataTable';
import SearchableSelect from '../components/SearchableSelect';
import { GULF_INDIA_COUNTRY_CODES, getDefaultCountryCode, buildFullMobile, toWhatsAppDigits } from '../utils/phoneCodes';
import { MapPin, Route as RouteIcon, Plus, Share2, ArrowRightLeft, CheckCircle2, Clock, X, Pencil, Save } from 'lucide-react';

export default function RoutesShopsPage() {
  const { vendor } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [shops, setShops] = useState([]);
  const [vans, setVans] = useState([]);
  const [rForm, setRForm] = useState({ route_code: '', route_name: '', assigned_van_id: '' });
  const [countryCode, setCountryCode] = useState(() => getDefaultCountryCode(vendor));
  const [sForm, setSForm] = useState({ route_id: '', shop_code: '', shop_name: '', owner_name: '', phone: '', address: '', vat_number: '', latitude: '26.2285', longitude: '50.5860' });
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ route_id: '', shop_code: '', shop_name: '', owner_name: '', phone: '', address: '', vat_number: '', latitude: '', longitude: '' });
  const [transferModal, setTransferModal] = useState(null);
  const [transferVanId, setTransferVanId] = useState('');
  const [lastConfirmLink, setLastConfirmLink] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [r, s, v] = await Promise.all([api.get('/api/routes'), api.get('/api/shops'), api.get('/api/vans')]);
      setRoutes(r); setShops(s); setVans(v);
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { load(); }, []);

  const addRoute = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api.post('/api/routes', rForm);
      setMsg('Route added and assigned to van'); setRForm({ route_code: '', route_name: '', assigned_van_id: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const addShop = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      const fullPhone = buildFullMobile(countryCode, sForm.phone);
      const res = await api.post('/api/shops', { ...sForm, phone: fullPhone });
      const confirmUrl = res?.confirm_path ? `${window.location.origin}${res.confirm_path}` : '';
      if (confirmUrl) {
        setLastConfirmLink({ shop_name: sForm.shop_name, owner_name: sForm.owner_name, phone: fullPhone, url: confirmUrl });
      }
      setMsg('Shop added! Share the location confirmation link with the shopkeeper.');
      setSForm({ ...sForm, shop_code: '', shop_name: '', owner_name: '', phone: '', address: '', vat_number: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const openEditShop = (shop) => {
    setEditForm({
      route_id: String(shop.route_id || ''),
      shop_code: shop.shop_code || '',
      shop_name: shop.shop_name || '',
      owner_name: shop.owner_name || '',
      phone: shop.phone || '',
      address: shop.address || '',
      vat_number: shop.vat_number || '',
      latitude: String(shop.latitude ?? ''),
      longitude: String(shop.longitude ?? ''),
    });
    setEditModal(shop);
  };

  const saveEditShop = async (e) => {
    e.preventDefault();
    if (!editModal) return;
    setErr(''); setMsg('');
    try {
      const res = await api.put(`/api/shops/${editModal.id}`, editForm);
      setMsg(res?.message || `Shop "${editForm.shop_name}" updated!`);
      setEditModal(null);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const openWhatsAppConfirmLink = async (shop) => {
    setErr('');
    try {
      const res = await api.post(`/api/shops/${shop.id}/confirm-link`, {});
      const url = `${window.location.origin}${res.confirm_path}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).catch(() => {});
      }
      const companyName = vendor?.company_name || 'Our Company';
      const clientName = (shop.owner_name || shop.shop_name || '').trim();
      const text = `*Hello ${clientName},*\nThis message is from *${companyName}*.\n\nPlease confirm your store location (*${shop.shop_name}*) by opening this link and tapping "Confirm My Store Location":\n${url}`;
      const digits = toWhatsAppDigits(shop.phone, countryCode);
      const waUrl = digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      setMsg(`Location confirmation link ready & copied for ${shop.shop_name}: ${url}`);
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const submitTransferVan = async (e) => {
    e.preventDefault();
    if (!transferModal || !transferVanId) return;
    setErr(''); setMsg('');
    try {
      const res = await api.put(`/api/shops/${transferModal.id}/transfer-van`, { van_id: Number(transferVanId) });
      setMsg(res?.message || `Shop "${transferModal.shop_name}" transferred!`);
      setTransferModal(null);
      setTransferVanId('');
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800 }}>Routes, Exclusive Van Mapping &amp; Shop GPS</h2>
        <p style={{ fontSize: 12.5, color: '#64748b' }}>Only the assigned van can bill shops on its route, and only after GPS arrival check-in.</p>
      </div>

      {msg && <div className="badge badge-emerald" style={{ padding: '9px 14px', borderRadius: 8 }}>{msg}</div>}
      {err && <div className="badge badge-rose" style={{ padding: '9px 14px', borderRadius: 8 }}>{err}</div>}
      {lastConfirmLink && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12.5 }}>
            <strong>Shopkeeper Location Link ({lastConfirmLink.shop_name}):</strong>{' '}
            <span className="mono" style={{ color: '#1d4ed8' }}>{lastConfirmLink.url}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: '#16a34a', color: '#fff', border: 'none' }}
              onClick={() => {
                const companyName = vendor?.company_name || 'Our Company';
                const clientName = (lastConfirmLink.owner_name || lastConfirmLink.shop_name || '').trim();
                const text = `*Hello ${clientName},*\nThis message is from *${companyName}*.\n\nPlease confirm your store GPS location (*${lastConfirmLink.shop_name}*) using this link:\n${lastConfirmLink.url}`;
                const digits = toWhatsAppDigits(lastConfirmLink.phone, countryCode);
                window.open(digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
              }}
            >
              <Share2 size={13} /> Send on WhatsApp
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setLastConfirmLink(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="grid-2">
        <form onSubmit={addRoute} className="card">
          <div className="card-title"><span><RouteIcon size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Add Route</span></div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Route Code</label><input className="form-control" required value={rForm.route_code} onChange={e => setRForm({ ...rForm, route_code: e.target.value })} placeholder="RT-05" /></div>
            <div className="form-group"><label className="form-label">Route Name</label><input className="form-control" required value={rForm.route_name} onChange={e => setRForm({ ...rForm, route_name: e.target.value })} placeholder="Sitra Industrial" /></div>
          </div>
          <div className="form-group">
            <label className="form-label">Assigned Van</label>
            <SearchableSelect
              required
              value={rForm.assigned_van_id}
              onChange={val => setRForm({ ...rForm, assigned_van_id: val })}
              placeholder="Select Van..."
              searchPlaceholder="Search van..."
              options={vans.map(v => ({ value: v.id, label: v.van_name, sublabel: v.van_code }))}
            />
          </div>
          <button type="submit" className="btn btn-blue btn-sm"><Plus size={14} /> Create Route</button>
        </form>

        <form onSubmit={addShop} className="card">
          <div className="card-title"><span><MapPin size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Add Shop with GPS</span></div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Route</label>
              <SearchableSelect
                required
                value={sForm.route_id}
                onChange={val => setSForm({ ...sForm, route_id: val })}
                placeholder="Select Route..."
                searchPlaceholder="Search route..."
                options={routes.map(r => ({ value: r.id, label: `${r.route_code} - ${r.route_name}` }))}
              />
            </div>
            <div className="form-group"><label className="form-label">Shop Code</label><input className="form-control" required value={sForm.shop_code} onChange={e => setSForm({ ...sForm, shop_code: e.target.value })} placeholder="SHP-501" /></div>
            <div className="form-group"><label className="form-label">Shop Name</label><input className="form-control" required value={sForm.shop_name} onChange={e => setSForm({ ...sForm, shop_name: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Owner Name</label><input className="form-control" value={sForm.owner_name} onChange={e => setSForm({ ...sForm, owner_name: e.target.value })} placeholder="Shopkeeper Name" /></div>
            <div className="form-group">
              <label className="form-label">Shopkeeper Mobile #</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <select className="form-control" style={{ width: 96, padding: '4px 6px', fontSize: 12 }} value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                  {GULF_INDIA_COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.short} {c.code}</option>)}
                </select>
                <input className="form-control mono" value={sForm.phone} onChange={e => setSForm({ ...sForm, phone: e.target.value })} placeholder="33112233" />
              </div>
            </div>
            <div className="form-group"><label className="form-label">Address / Area</label><input className="form-control" value={sForm.address} onChange={e => setSForm({ ...sForm, address: e.target.value })} placeholder="Shop address" /></div>
            <div className="form-group"><label className="form-label">VAT Number</label><input className="form-control mono" value={sForm.vat_number} onChange={e => setSForm({ ...sForm, vat_number: e.target.value })} placeholder="VAT / CR #" /></div>
            <div className="form-group"><label className="form-label">GPS Lat / Lng</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input className="form-control mono" value={sForm.latitude} onChange={e => setSForm({ ...sForm, latitude: e.target.value })} />
                <input className="form-control mono" value={sForm.longitude} onChange={e => setSForm({ ...sForm, longitude: e.target.value })} />
              </div>
            </div>
          </div>
          <button type="submit" className="btn btn-emerald btn-sm"><Plus size={14} /> Add Shop</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Assigned Route Shops ({shops.length})</div>
        <DataTable
          data={shops}
          searchPlaceholder="Search shop code, name, route, van..."
          exportFilename="route-shops.csv"
          columns={[
            { key: 'shop_code', label: 'Shop Code', sortValue: (s) => s.shop_code || '', render: (s) => <span className="mono" style={{ fontWeight: 700 }}>{s.shop_code}</span> },
            {
              key: 'shop_name',
              label: 'Shop Name & Contact',
              sortValue: (s) => s.shop_name || '',
              searchValue: (s) => `${s.shop_name || ''} ${s.owner_name || ''} ${s.phone || ''} ${s.vat_number || ''} ${s.address || ''}`,
              render: (s) => (
                <>
                  <div style={{ fontWeight: 700 }}>{s.shop_name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {[s.owner_name, s.phone, s.vat_number ? `VAT: ${s.vat_number}` : ''].filter(Boolean).join(' • ') || s.address}
                  </div>
                  {s.address && (s.owner_name || s.phone || s.vat_number) && (
                    <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{s.address}</div>
                  )}
                </>
              ),
            },
            {
              key: 'route_name',
              label: 'Route',
              sortValue: (s) => `${s.route_code || ''} ${s.route_name || ''}`,
              searchValue: (s) => `${s.route_code || ''} ${s.route_name || ''}`,
              render: (s) => <span className="badge badge-blue">{s.route_code} &bull; {s.route_name}</span>,
            },
            {
              key: 'van_name',
              label: 'Assigned Van',
              sortValue: (s) => s.van_name || 'Unassigned',
              render: (s) => <span className="badge badge-amber">{s.van_name || 'Unassigned'}</span>,
            },
            {
              key: 'latitude',
              label: 'GPS & Status',
              sortValue: (s) => Number(s.location_confirmed || 0),
              searchValue: (s) => `${s.latitude || ''} ${s.longitude || ''} ${s.location_confirmed ? 'Confirmed' : 'Pending'}`,
              render: (s) => (
                <div>
                  <div className="mono" style={{ fontSize: 11 }}>{Number(s.latitude).toFixed(5)}, {Number(s.longitude).toFixed(5)}</div>
                  {Number(s.location_confirmed) ? (
                    <span className="badge badge-emerald" style={{ fontSize: 10, marginTop: 2 }}><CheckCircle2 size={10} /> Confirmed</span>
                  ) : (
                    <span className="badge badge-amber" style={{ fontSize: 10, marginTop: 2 }}><Clock size={10} /> Pending Confirm</span>
                  )}
                </div>
              ),
            },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (s) => (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => openEditShop(s)}
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ background: '#16a34a', color: '#fff', border: 'none' }}
                    onClick={() => openWhatsAppConfirmLink(s)}
                  >
                    <Share2 size={12} /> Send Link
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => { setTransferModal(s); setTransferVanId(String(s.assigned_van_id || '')); }}
                  >
                    <ArrowRightLeft size={12} /> Transfer Van
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal-card" style={{ maxWidth: 620, width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>Edit Shop Information: {editModal.shop_name}</h3>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditModal(null)}><X size={14} /></button>
            </div>
            <form onSubmit={saveEditShop} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Shop Code</label>
                  <input className="form-control mono" required value={editForm.shop_code} onChange={e => setEditForm({ ...editForm, shop_code: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Shop Name</label>
                  <input className="form-control" required value={editForm.shop_name} onChange={e => setEditForm({ ...editForm, shop_name: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Contact Person / Owner Name</label>
                  <input className="form-control" value={editForm.owner_name} onChange={e => setEditForm({ ...editForm, owner_name: e.target.value })} placeholder="Shopkeeper Name" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Mobile Number</label>
                  <input className="form-control mono" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+97333112233" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">VAT Number</label>
                  <input className="form-control mono" value={editForm.vat_number} onChange={e => setEditForm({ ...editForm, vat_number: e.target.value })} placeholder="VAT / CR #" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Route</label>
                  <SearchableSelect
                    value={editForm.route_id}
                    onChange={val => setEditForm({ ...editForm, route_id: val })}
                    searchPlaceholder="Search route..."
                    options={routes.map(r => ({ value: String(r.id), label: `${r.route_code} - ${r.route_name}` }))}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Address / Area</label>
                <input className="form-control" value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder="Shop address" />
              </div>
              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">GPS Latitude</label>
                  <input className="form-control mono" value={editForm.latitude} onChange={e => setEditForm({ ...editForm, latitude: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">GPS Longitude</label>
                  <input className="form-control mono" value={editForm.longitude} onChange={e => setEditForm({ ...editForm, longitude: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-emerald btn-sm"><Save size={13} /> Save Shop Details</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {transferModal && (
        <div className="modal-overlay" onClick={() => setTransferModal(null)}>
          <div className="modal-card" style={{ maxWidth: 560, width: '95%', minHeight: 320, padding: 24, overflow: 'visible', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} onClick={e => e.stopPropagation()}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>Transfer Shop to Another Van</h3>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setTransferModal(null)}><X size={14} /></button>
              </div>
              <p style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.6 }}>
                Shop: <strong>{transferModal.shop_name}</strong> ({transferModal.shop_code})<br />
                Current Van: <span className="badge badge-amber">{transferModal.van_name || 'Unassigned'}</span>
              </p>
            </div>
            <form onSubmit={submitTransferVan} style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1, justifyContent: 'space-between' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Select Target Van</label>
                <SearchableSelect
                  required
                  value={transferVanId}
                  onChange={val => setTransferVanId(val)}
                  placeholder="Select Van..."
                  searchPlaceholder="Search van..."
                  options={vans.map(v => ({ value: v.id, label: v.van_name, sublabel: v.van_code }))}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setTransferModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm"><ArrowRightLeft size={13} /> Transfer Shop</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

