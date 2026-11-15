import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import SearchableSelect from '../components/SearchableSelect';
import { Building2, Plus, Key, Users, Truck, CheckCircle2, PauseCircle } from 'lucide-react';

export default function SuperadminPage() {
  const [stats, setStats] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    company_name: '',
    company_code: '',
    admin_username: '',
    admin_password: '',
    admin_full_name: '',
    billing_cycle: 'yearly',
    software_base_cost: 350,
    max_normal_users: 4,
    free_normal_users: 2,
    paid_normal_user_cost: 30,
    max_van_users: 5,
    free_van_users: 0,
    paid_van_user_cost: 40,
  });

  const load = async () => {
    try {
      const [s, v] = await Promise.all([
        api.get('/api/superadmin/stats'),
        api.get('/api/superadmin/vendors'),
      ]);
      setStats(s);
      setVendors(v);
    } catch (e) {
      setErr(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const calcTotal = () => {
    const base = Number(form.software_base_cost || 0);
    const paidNormal = Math.max(0, Number(form.max_normal_users || 0) - Number(form.free_normal_users || 0));
    const paidVan = Math.max(0, Number(form.max_van_users || 0) - Number(form.free_van_users || 0));
    return (base + paidNormal * Number(form.paid_normal_user_cost || 0) + paidVan * Number(form.paid_van_user_cost || 0)).toFixed(3);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    try {
      await api.post('/api/superadmin/vendors', form);
      setMsg(`Vendor "${form.company_name}" & Admin "${form.admin_username}" created!`);
      setShowCreate(false);
      setForm({ ...form, company_name: '', company_code: '', admin_username: '', admin_password: '', admin_full_name: '' });
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const toggleStatus = async (v) => {
    const next = v.license_status === 'active' ? 'suspended' : 'active';
    await api.put(`/api/superadmin/vendors/${v.id}`, { license_status: next });
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a' }}>Superadmin SaaS Control Center</h2>
          <p style={{ fontSize: 12.5, color: '#64748b' }}>Developer-only platform for multi-tenant vendor provisioning, user quotas, and SaaS licensing.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          <Plus size={16} /> {showCreate ? 'Close Form' : 'Create New Vendor & License'}
        </button>
      </div>

      {msg && <div className="badge badge-emerald" style={{ padding: '10px 14px', borderRadius: 8 }}>{msg}</div>}
      {err && <div className="badge badge-rose" style={{ padding: '10px 14px', borderRadius: 8 }}>{err}</div>}

      {stats && (
        <div className="grid-4">
          <div className="kpi-card">
            <div>
              <div className="kpi-label">Active Vendors</div>
              <div className="kpi-value mono">{stats.vendors?.active_count || 0} / {stats.vendors?.total || 0}</div>
              <div className="kpi-sub">Multi-tenant organizations</div>
            </div>
            <div className="kpi-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><Building2 size={20} /></div>
          </div>
          <div className="kpi-card">
            <div>
              <div className="kpi-label">Total SaaS Value</div>
              <div className="kpi-value mono">{Number(stats.vendors?.total_saas_value || 0).toFixed(3)} BHD</div>
              <div className="kpi-sub">Active licensed revenue</div>
            </div>
            <div className="kpi-icon" style={{ background: '#ecfdf5', color: '#059669' }}><Key size={20} /></div>
          </div>
          <div className="kpi-card">
            <div>
              <div className="kpi-label">Van Fleet Users</div>
              <div className="kpi-value mono">{stats.users_by_role?.find(r => r.role === 'van')?.cnt || 0}</div>
              <div className="kpi-sub">Active mobile van drivers</div>
            </div>
            <div className="kpi-icon" style={{ background: '#fffbeb', color: '#d97706' }}><Truck size={20} /></div>
          </div>
          <div className="kpi-card">
            <div>
              <div className="kpi-label">Persistent Tokens</div>
              <div className="kpi-value mono">{stats.active_tokens}</div>
              <div className="kpi-sub">Non-expiring active sessions</div>
            </div>
            <div className="kpi-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}><Users size={20} /></div>
          </div>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="card" style={{ borderColor: '#2563eb', borderWidth: 1.5 }}>
          <div className="card-title">
            <span>Provision New SaaS Vendor &amp; Licensing Quota</span>
            <span className="badge badge-blue mono" style={{ fontSize: 13 }}>
              Total Cost: {calcTotal()} BHD / {form.billing_cycle}
            </span>
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Company Name</label>
              <input className="form-control" required value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} placeholder="e.g. Gulf Fresh Foods W.L.L." />
            </div>
            <div className="form-group">
              <label className="form-label">Company Code</label>
              <input className="form-control" required value={form.company_code} onChange={e => setForm({ ...form, company_code: e.target.value })} placeholder="e.g. GFF-02" />
            </div>
            <div className="form-group">
              <label className="form-label">Billing Cycle</label>
              <SearchableSelect
                value={form.billing_cycle}
                onChange={val => setForm({ ...form, billing_cycle: val })}
                searchPlaceholder="Search cycle..."
                options={[
                  { value: 'yearly', label: 'Yearly' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
              />
            </div>
          </div>

          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Vendor Admin Username</label>
              <input className="form-control" required value={form.admin_username} onChange={e => setForm({ ...form, admin_username: e.target.value })} placeholder="e.g. gff_admin" />
            </div>
            <div className="form-group">
              <label className="form-label">Vendor Admin Password</label>
              <input className="form-control" type="password" required value={form.admin_password} onChange={e => setForm({ ...form, admin_password: e.target.value })} placeholder="Password" />
            </div>
            <div className="form-group">
              <label className="form-label">Software Base Cost (BHD / {form.billing_cycle})</label>
              <input className="form-control mono" type="number" step="0.001" value={form.software_base_cost} onChange={e => setForm({ ...form, software_base_cost: e.target.value })} />
            </div>
          </div>

          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Max Normal Users</label>
              <input className="form-control mono" type="number" value={form.max_normal_users} onChange={e => setForm({ ...form, max_normal_users: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Free Normal Users</label>
              <input className="form-control mono" type="number" value={form.free_normal_users} onChange={e => setForm({ ...form, free_normal_users: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Cost / Paid Normal User (BHD)</label>
              <input className="form-control mono" type="number" step="0.001" value={form.paid_normal_user_cost} onChange={e => setForm({ ...form, paid_normal_user_cost: e.target.value })} />
            </div>
          </div>

          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Max Van Users</label>
              <input className="form-control mono" type="number" value={form.max_van_users} onChange={e => setForm({ ...form, max_van_users: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Free Van Users</label>
              <input className="form-control mono" type="number" value={form.free_van_users} onChange={e => setForm({ ...form, free_van_users: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Cost / Paid Van User (BHD)</label>
              <input className="form-control mono" type="number" step="0.001" value={form.paid_van_user_cost} onChange={e => setForm({ ...form, paid_van_user_cost: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn btn-blue">Create Vendor &amp; Activate License</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="card-title">Registered SaaS Vendors &amp; Licensing Quotas</div>
        <DataTable
          data={vendors}
          searchPlaceholder="Search vendor, code, cycle, status..."
          exportFilename="saas-vendors.csv"
          columns={[
            {
              key: 'company_name',
              label: 'Vendor',
              sortValue: (v) => v.company_name || '',
              searchValue: (v) => `${v.company_name || ''} ${v.company_code || ''} ${v.license_expires_at || ''}`,
              render: (v) => (
                <>
                  <div style={{ fontWeight: 700 }}>{v.company_name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Code: {v.company_code} &bull; Exp: {v.license_expires_at}</div>
                </>
              ),
            },
            {
              key: 'billing_cycle',
              label: 'Cycle',
              sortValue: (v) => v.billing_cycle || '',
              render: (v) => <span className="badge badge-slate" style={{ textTransform: 'capitalize' }}>{v.billing_cycle}</span>,
            },
            {
              key: 'software_base_cost',
              label: 'Base Cost',
              sortValue: (v) => Number(v.software_base_cost || 0),
              render: (v) => <span className="mono">{Number(v.software_base_cost).toFixed(3)} BHD</span>,
            },
            {
              key: 'current_normal_users',
              label: 'Normal Users (Used / Max | Free)',
              sortValue: (v) => Number(v.current_normal_users || 0),
              render: (v) => (
                <>
                  <span className="mono" style={{ fontWeight: 700 }}>{v.current_normal_users} / {v.max_normal_users}</span>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{v.free_normal_users} free &bull; {Number(v.paid_normal_user_cost).toFixed(3)}/paid</div>
                </>
              ),
            },
            {
              key: 'current_van_users',
              label: 'Van Users (Used / Max | Free)',
              sortValue: (v) => Number(v.current_van_users || 0),
              render: (v) => (
                <>
                  <span className="mono" style={{ fontWeight: 700 }}>{v.current_van_users} / {v.max_van_users}</span>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{v.free_van_users} free &bull; {Number(v.paid_van_user_cost).toFixed(3)}/paid</div>
                </>
              ),
            },
            {
              key: 'total_software_cost',
              label: 'Total Cost',
              sortValue: (v) => Number(v.total_software_cost || 0),
              render: (v) => (
                <span className="mono" style={{ fontWeight: 800, color: '#0a2540' }}>
                  {Number(v.total_software_cost).toFixed(3)} BHD/{v.billing_cycle === 'yearly' ? 'yr' : 'mo'}
                </span>
              ),
            },
            {
              key: 'license_status',
              label: 'Status',
              sortValue: (v) => v.license_status || '',
              render: (v) => (
                <span className={`badge ${v.license_status === 'active' ? 'badge-emerald' : 'badge-rose'}`}>
                  {v.license_status === 'active' ? <CheckCircle2 size={12} /> : <PauseCircle size={12} />}
                  {v.license_status}
                </span>
              ),
            },
            {
              key: 'action',
              label: 'Action',
              sortable: false,
              render: (v) => (
                <button className="btn btn-outline btn-sm" onClick={() => toggleStatus(v)}>
                  {v.license_status === 'active' ? 'Suspend' : 'Activate'}
                </button>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

