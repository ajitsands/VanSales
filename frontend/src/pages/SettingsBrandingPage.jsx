import React, { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from '../components/SearchableSelect';
import { getVendorShifts } from '../utils/shiftTimings';
import { Palette, Save, Globe, Clock, Plus, Trash2 } from 'lucide-react';

const PRESETS = [
  { name: 'Executive Navy', hBg: '#0a2540', hTxt: '#ffffff', fBg: '#f8fafc', fTxt: '#475569' },
  { name: 'Royal Blue', hBg: '#1e3a8a', hTxt: '#ffffff', fBg: '#eff6ff', fTxt: '#1e40af' },
  { name: 'Emerald Corporate', hBg: '#064e3b', hTxt: '#ffffff', fBg: '#ecfdf5', fTxt: '#065f46' },
  { name: 'Clean Light Slate', hBg: '#ffffff', hTxt: '#0f172a', fBg: '#f1f5f9', fTxt: '#334155' },
];

export default function SettingsBrandingPage() {
  const { vendor, updateVendorState } = useAuth();
  const [form, setForm] = useState({
    company_name: vendor?.company_name || '',
    logo_url: vendor?.logo_url || '',
    header_bg_color: vendor?.header_bg_color || '#0a2540',
    header_text_color: vendor?.header_text_color || '#ffffff',
    footer_bg_color: vendor?.footer_bg_color || '#f8fafc',
    footer_text_color: vendor?.footer_text_color || '#475569',
    currency_code: vendor?.currency_code || 'BHD',
    currency_decimals: vendor?.currency_decimals ?? 3,
    date_format: vendor?.date_format || 'DD/MM/YYYY',
    vat_percent: vendor?.vat_percent ?? 10,
    default_vat_mode: vendor?.default_vat_mode || 'exclusive',
    geofence_radius_m: vendor?.geofence_radius_m ?? 250,
    require_eod_closing: vendor?.require_eod_closing ?? 1,
    shift_timings: getVendorShifts(vendor),
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const handleSave = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      const updated = await api.put('/api/admin/settings', form);
      updateVendorState(updated);
      setMsg('Company branding, Header/Footer colors & localization settings saved!');
    } catch (e2) { setErr(e2.message); }
  };

  return (
    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>Company Branding, Theme Colors &amp; Localization</h2>
          <p style={{ fontSize: 12.5, color: '#64748b' }}>Customize your organization name, logo, Header &amp; Footer color combo, VAT rules, and currency.</p>
        </div>
        <button type="submit" className="btn btn-blue"><Save size={15} /> Save All Settings</button>
      </div>

      {msg && <div className="badge badge-emerald" style={{ padding: '9px 14px', borderRadius: 8 }}>{msg}</div>}
      {err && <div className="badge badge-rose" style={{ padding: '9px 14px', borderRadius: 8 }}>{err}</div>}

      <div className="grid-2">
        <div className="card">
          <div className="card-title"><span><Palette size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Company Branding &amp; Header/Footer Colors</span></div>
          <div className="form-group">
            <label className="form-label">Company Name</label>
            <input className="form-control" required value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Company Logo URL (Optional)</label>
            <input className="form-control" value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} placeholder="https://... or leave blank for default icon" />
          </div>

          <div style={{ margin: '10px 0' }}>
            <div className="form-label" style={{ marginBottom: 6 }}>Quick Color Combo Presets</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRESETS.map(p => (
                <button
                  type="button"
                  key={p.name}
                  className="btn btn-outline btn-sm"
                  onClick={() => setForm({ ...form, header_bg_color: p.hBg, header_text_color: p.hTxt, footer_bg_color: p.fBg, footer_text_color: p.fTxt })}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: p.hBg, border: '1px solid #cbd5e1', display: 'inline-block' }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Header Background</label>
              <input type="color" className="form-control" style={{ height: 38, padding: 3 }} value={form.header_bg_color} onChange={e => setForm({ ...form, header_bg_color: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Header Text Color</label>
              <input type="color" className="form-control" style={{ height: 38, padding: 3 }} value={form.header_text_color} onChange={e => setForm({ ...form, header_text_color: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Footer Background</label>
              <input type="color" className="form-control" style={{ height: 38, padding: 3 }} value={form.footer_bg_color} onChange={e => setForm({ ...form, footer_bg_color: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Footer Text Color</label>
              <input type="color" className="form-control" style={{ height: 38, padding: 3 }} value={form.footer_text_color} onChange={e => setForm({ ...form, footer_text_color: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title"><span><Globe size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Localization, VAT &amp; Field Rules</span></div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Currency Code</label><input className="form-control" value={form.currency_code} onChange={e => setForm({ ...form, currency_code: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">Currency Decimals</label><input className="form-control mono" type="number" min="0" max="3" value={form.currency_decimals} onChange={e => setForm({ ...form, currency_decimals: Number(e.target.value) })} /></div>
            <div className="form-group">
              <label className="form-label">Date Format</label>
              <SearchableSelect
                value={form.date_format}
                onChange={val => setForm({ ...form, date_format: val })}
                searchPlaceholder="Search date format..."
                options={[
                  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                ]}
              />
            </div>
            <div className="form-group"><label className="form-label">VAT Rate (%)</label><input className="form-control mono" type="number" step="0.01" value={form.vat_percent} onChange={e => setForm({ ...form, vat_percent: e.target.value })} /></div>
            <div className="form-group">
              <label className="form-label">Default VAT Billing Mode</label>
              <SearchableSelect
                value={form.default_vat_mode}
                onChange={val => setForm({ ...form, default_vat_mode: val })}
                searchPlaceholder="Search VAT mode..."
                options={[
                  { value: 'exclusive', label: 'VAT Exclusive' },
                  { value: 'inclusive', label: 'VAT Inclusive' },
                ]}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Shop GPS Geofence (Meters)</label>
              <input className="form-control mono" type="number" min="5" value={form.geofence_radius_m} onChange={e => setForm({ ...form, geofence_radius_m: Number(e.target.value) })} />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {[10, 20, 30, 50, 100, 250].map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`btn btn-sm ${Number(form.geofence_radius_m) === m ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '2px 7px', fontSize: 11 }}
                    onClick={() => setForm({ ...form, geofence_radius_m: m })}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.require_eod_closing} onChange={e => setForm({ ...form, require_eod_closing: e.target.checked ? 1 : 0 })} />
            Enforce Compulsory Daily Closing (Lock next-day sales until Admin approves)
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span><Clock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Shift Timings (Reflected on Van App &amp; POS Counter)</span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setForm({
              ...form,
              shift_timings: [
                ...(form.shift_timings || []),
                { id: `shift_${Date.now()}`, name: `Shift ${(form.shift_timings || []).length + 1}`, from: '08:00', to: '17:00' },
              ],
            })}
          >
            <Plus size={14} /> Add Shift
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          Define your store &amp; van shift windows. These shift times automatically appear as quick filters and active shift indicators on both the Main Store POS Counter and the Van Driver App.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(form.shift_timings || []).map((s, idx) => (
            <div
              key={s.id || idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 1fr auto',
                gap: 10,
                alignItems: 'end',
                padding: '10px 12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
              }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Shift Name</label>
                <input
                  className="form-control"
                  required
                  value={s.name}
                  placeholder="e.g. Morning"
                  onChange={(e) => {
                    const next = [...form.shift_timings];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setForm({ ...form, shift_timings: next });
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">From Time</label>
                <input
                  type="time"
                  className="form-control mono"
                  required
                  value={s.from}
                  onChange={(e) => {
                    const next = [...form.shift_timings];
                    next[idx] = { ...next[idx], from: e.target.value };
                    setForm({ ...form, shift_timings: next });
                  }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">To Time</label>
                <input
                  type="time"
                  className="form-control mono"
                  required
                  value={s.to}
                  onChange={(e) => {
                    const next = [...form.shift_timings];
                    next[idx] = { ...next[idx], to: e.target.value };
                    setForm({ ...form, shift_timings: next });
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ color: '#be123c', borderColor: '#fecdd3', height: 36 }}
                disabled={(form.shift_timings || []).length <= 1}
                onClick={() => {
                  const next = form.shift_timings.filter((_, i) => i !== idx);
                  setForm({ ...form, shift_timings: next });
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
}

