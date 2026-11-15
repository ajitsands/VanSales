import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import SearchableSelect from '../components/SearchableSelect';
import { UserPlus, Shield, Truck, Users } from 'lucide-react';

const ALL_PERMS = [
  { key: 'procurement', label: 'Procurement & GRN' },
  { key: 'inventory', label: 'Inventory & Batches' },
  { key: 'transfers', label: 'Store-to-Van Dispatch' },
  { key: 'sales', label: 'Main Store Sales' },
  { key: 'returns', label: 'Returns & Damage QC' },
  { key: 'reports', label: 'Executive & Financial Reports' },
];

export default function UsersQuotasPage() {
  const [users, setUsers] = useState([]);
  const [quotas, setQuotas] = useState(null);
  const [vans, setVans] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    role: 'account',
    username: '',
    password: '',
    full_name: '',
    phone: '',
    van_id: '',
    permissions: { procurement: true, inventory: true, transfers: true, sales: true, returns: true, reports: true },
  });

  const load = async () => {
    try {
      const [uRes, vRes] = await Promise.all([api.get('/api/admin/users'), api.get('/api/vans')]);
      setUsers(uRes.users);
      setQuotas(uRes.quotas);
      setVans(vRes);
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await api.post('/api/admin/users', form);
      setMsg(`User "${form.username}" (${form.role}) created!`);
      setForm({ ...form, username: '', password: '', full_name: '', phone: '' });
      load();
    } catch (e2) { setErr(e2.message); }
  };

  const toggleActive = async (u) => {
    await api.put(`/api/admin/users/${u.id}`, { is_active: u.is_active ? 0 : 1 });
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 19, fontWeight: 800 }}>Users, Account Privileges &amp; License Quotas</h2>
        <p style={{ fontSize: 12.5, color: '#64748b' }}>Create Account &amp; Van users within the SaaS limits assigned by Superadmin.</p>
      </div>

      {quotas && (
        <div className="grid-2">
          <div className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
            <div>
              <div className="kpi-label">Normal / Account Users Quota</div>
              <div className="kpi-value mono">{quotas.used_normal_users} / {quotas.max_normal_users}</div>
              <div className="kpi-sub">{quotas.free_normal_users} free users included in your SaaS plan</div>
            </div>
            <div className="kpi-icon" style={{ background: '#eff6ff', color: '#2563eb' }}><Users size={20} /></div>
          </div>
          <div className="kpi-card" style={{ borderLeft: '4px solid #d97706' }}>
            <div>
              <div className="kpi-label">Van Driver Users Quota</div>
              <div className="kpi-value mono">{quotas.used_van_users} / {quotas.max_van_users}</div>
              <div className="kpi-sub">{quotas.free_van_users} free van users included in your SaaS plan</div>
            </div>
            <div className="kpi-icon" style={{ background: '#fffbeb', color: '#d97706' }}><Truck size={20} /></div>
          </div>
        </div>
      )}

      {msg && <div className="badge badge-emerald" style={{ padding: '9px 14px', borderRadius: 8 }}>{msg}</div>}
      {err && <div className="badge badge-rose" style={{ padding: '9px 14px', borderRadius: 8 }}>{err}</div>}

      <form onSubmit={handleCreate} className="card">
        <div className="card-title"><span><UserPlus size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Create New User</span></div>
        <div className="grid-4">
          <div className="form-group">
            <label className="form-label">Role</label>
            <SearchableSelect
              value={form.role}
              onChange={val => setForm({ ...form, role: val })}
              searchPlaceholder="Search role..."
              options={[
                { value: 'account', label: 'Account / Backoffice User' },
                { value: 'van', label: 'Van Driver User' },
              ]}
            />
          </div>
          <div className="form-group"><label className="form-label">Full Name</label><input className="form-control" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Username</label><input className="form-control" required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Password</label><input className="form-control" type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
        </div>

        {form.role === 'van' && (
          <div className="form-group" style={{ maxWidth: 320 }}>
            <label className="form-label">Assign Van Store</label>
            <SearchableSelect
              required
              value={form.van_id}
              onChange={val => setForm({ ...form, van_id: val })}
              placeholder="Select Van..."
              searchPlaceholder="Search van..."
              options={vans.map(v => ({ value: v.id, label: `${v.van_name} (${v.van_code})` }))}
            />
          </div>
        )}

        {form.role === 'account' && (
          <div style={{ marginTop: 6, marginBottom: 12 }}>
            <div className="form-label" style={{ marginBottom: 6 }}><Shield size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Account User Access Privileges</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {ALL_PERMS.map(p => (
                <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!form.permissions[p.key]}
                    onChange={e => setForm({ ...form, permissions: { ...form.permissions, [p.key]: e.target.checked } })}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <button type="submit" className="btn btn-blue btn-sm"><UserPlus size={14} /> Create User</button>
      </form>

      <div className="card">
        <div className="card-title">Organization Users</div>
        <DataTable
          data={users}
          searchPlaceholder="Search name, username, role, van..."
          exportFilename="organization-users.csv"
          columns={[
            {
              key: 'full_name',
              label: 'User',
              sortValue: (u) => u.full_name || '',
              searchValue: (u) => `${u.full_name || ''} ${u.username || ''}`,
              render: (u) => <><div style={{ fontWeight: 700 }}>{u.full_name}</div><div className="mono" style={{ fontSize: 11, color: '#64748b' }}>@{u.username}</div></>,
            },
            {
              key: 'role',
              label: 'Role',
              sortValue: (u) => u.role || '',
              render: (u) => <span className={`badge ${u.role === 'admin' ? 'badge-purple' : u.role === 'account' ? 'badge-blue' : 'badge-amber'}`}>{u.role}</span>,
            },
            {
              key: 'van_name',
              label: 'Assigned Van / Privileges',
              sortValue: (u) => u.van_name || u.role || '',
              searchValue: (u) => `${u.van_name || ''} ${Object.keys(u.permissions || {}).filter((k) => u.permissions[k]).join(' ')}`,
              render: (u) => (
                <>
                  {u.role === 'van' && <span>{u.van_name || 'Unassigned'}</span>}
                  {u.role === 'account' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(u.permissions || {}).filter(([, val]) => val).map(([k]) => (
                        <span key={k} className="badge badge-slate">{k}</span>
                      ))}
                    </div>
                  )}
                  {u.role === 'admin' && <span style={{ fontSize: 11, color: '#64748b' }}>Full Organization Admin</span>}
                </>
              ),
            },
            {
              key: 'is_active',
              label: 'Status',
              sortValue: (u) => u.is_active ? 1 : 0,
              searchValue: (u) => u.is_active ? 'Active' : 'Disabled',
              render: (u) => <span className={`badge ${u.is_active ? 'badge-emerald' : 'badge-rose'}`}>{u.is_active ? 'Active' : 'Disabled'}</span>,
            },
            {
              key: 'action',
              label: 'Action',
              sortable: false,
              render: (u) => u.role !== 'admin' ? (
                <button className="btn btn-outline btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'Disable' : 'Enable'}</button>
              ) : null,
            },
          ]}
        />
      </div>
    </div>
  );
}

