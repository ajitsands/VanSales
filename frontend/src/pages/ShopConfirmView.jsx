import React, { useEffect, useState } from 'react';
import { MapPin, CheckCircle2, Navigation, AlertTriangle } from 'lucide-react';

export default function ShopConfirmView({ token }) {
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState({ lat: '', lng: '' });
  const [ownerName, setOwnerName] = useState('');
  const [address, setAddress] = useState('');
  const [showManualGps, setShowManualGps] = useState(false);

  useEffect(() => {
    fetch(`/api/public/shop-confirm/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || j.success === false) throw new Error(j.message || 'Invalid shop confirmation link');
        return j.data ?? j;
      })
      .then((data) => {
        setShop(data);
        setOwnerName(data.owner_name || '');
        setAddress(data.address || '');
        if (data.location_confirmed && data.latitude && data.longitude) {
          setCoords({ lat: String(data.latitude), lng: String(data.longitude) });
        }
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const saveConfirmedLocation = async (latNum, lngNum) => {
    setSaving(true);
    setErr('');
    try {
      const r = await fetch(`/api/public/shop-confirm/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: latNum,
          longitude: lngNum,
          owner_name: ownerName.trim(),
          address: address.trim(),
        }),
      });
      const j = await r.json();
      if (!r.ok || j.success === false) throw new Error(j.message || 'Failed to update store location');
      setShop((prev) => ({
        ...prev,
        latitude: latNum,
        longitude: lngNum,
        location_confirmed: 1,
        owner_name: ownerName.trim() || prev.owner_name,
        address: address.trim() || prev.address,
      }));
      setMsg('Thank you! Your store location has been confirmed and updated in our system.');
      setShowManualGps(false);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const detectAndConfirm = () => {
    setErr('');
    setMsg('');
    if (!window.isSecureContext) {
      setErr(`Browser GPS is blocked on insecure HTTP (${window.location.origin}). Open this link over HTTPS (or localhost), or enter GPS coordinates manually below.`);
      setShowManualGps(true);
      return;
    }
    if (!navigator.geolocation) {
      setErr('GPS / Location is not supported by your browser. Please open this link on your mobile phone.');
      setShowManualGps(true);
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat: lat.toFixed(6), lng: lng.toFixed(6) });
        setDetecting(false);
        await saveConfirmedLocation(lat, lng);
      },
      (geoErr) => {
        setDetecting(false);
        if (geoErr.code === 1) {
          const reason = geoErr.message ? ` (${geoErr.message})` : '';
          setErr(`Location permission blocked${reason}. Click the lock/site-info icon next to the URL, set Location to "Allow" (and ensure device Location/GPS is ON), then tap Confirm again.`);
          setShowManualGps(true);
        } else {
          setErr('Unable to detect GPS location. Please ensure device GPS/Location is turned ON and try again.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontSize: 14 }}>
        Loading store confirmation...
      </div>
    );
  }

  if (err && !shop) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 20 }}>
        <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: 24 }}>
          <AlertTriangle size={28} style={{ color: '#be123c', marginBottom: 8 }} />
          <h3 style={{ fontWeight: 800, color: '#be123c' }}>Link Unavailable</h3>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>{err}</p>
        </div>
      </div>
    );
  }

  const confirmed = !!Number(shop?.location_confirmed);

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '20px 12px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 6px 20px rgba(15,23,42,0.08)' }}>
        <div style={{ background: shop?.header_bg_color || '#0a2540', color: '#ffffff', padding: '16px 18px' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{shop?.company_name || 'Van Supply & Distribution'}</div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
            <MapPin size={14} /> Store Location Confirmation
          </div>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{shop?.shop_name}</div>
            <div className="mono" style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Code: {shop?.shop_code} {shop?.phone ? `• ${shop.phone}` : ''}
            </div>
            {confirmed && (
              <div className="badge badge-emerald" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle2 size={13} /> Location Confirmed
              </div>
            )}
          </div>

          {msg && <div className="badge badge-emerald" style={{ padding: '10px 12px', borderRadius: 8, whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.45 }}>{msg}</div>}
          {err && <div className="badge badge-rose" style={{ padding: '10px 12px', borderRadius: 8, whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.45 }}>{err}</div>}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Owner / Contact Name</label>
            <input className="form-control" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Shopkeeper Name" />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Store Address / Landmark</label>
            <input className="form-control" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shop area / building / street" />
          </div>

          <button
            type="button"
            className="btn btn-emerald"
            style={{ width: '100%', padding: '12px 16px', fontSize: 14, fontWeight: 700 }}
            disabled={detecting || saving}
            onClick={detectAndConfirm}
          >
            <Navigation size={16} />{' '}
            {detecting ? 'Detecting Your Store GPS...' : saving ? 'Updating Location...' : confirmed ? 'Update Store GPS Location' : 'Confirm My Store Location (GPS)'}
          </button>

          {showManualGps && (
            <div style={{ padding: 12, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Manual GPS Fallback (Lat / Lng)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  className="form-control mono"
                  placeholder="Latitude (e.g. 26.2285)"
                  value={coords.lat}
                  onChange={(e) => setCoords((prev) => ({ ...prev, lat: e.target.value }))}
                />
                <input
                  className="form-control mono"
                  placeholder="Longitude (e.g. 50.5860)"
                  value={coords.lng}
                  onChange={(e) => setCoords((prev) => ({ ...prev, lng: e.target.value }))}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving || !coords.lat || !coords.lng}
                onClick={() => saveConfirmedLocation(Number(coords.lat), Number(coords.lng))}
              >
                Save Manual Coordinates
              </button>
            </div>
          )}

          {coords.lat && coords.lng && (
            <div style={{ padding: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, fontSize: 12, textAlign: 'center' }}>
              <div className="mono" style={{ fontWeight: 700, color: '#065f46' }}>
                GPS: {coords.lat}, {coords.lng}
              </div>
              <a
                href={`https://maps.google.com/?q=${coords.lat},${coords.lng}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11.5, color: '#1d4ed8', fontWeight: 600 }}
              >
                View on Google Maps
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
