import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Truck, Building2, Calculator, Lock, User, KeyRound } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const quickFill = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        maxWidth: 440,
        width: '100%',
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #071d33 0%, #0a2540 100%)',
          color: '#ffffff',
          padding: '26px 28px 22px',
          borderBottom: '4px solid #d97706',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24'
            }}>
              <Truck size={20} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.3px' }}>SaNDS VanSales SaaS</div>
              <div style={{ fontSize: 11, color: '#cbd5e1' }}>SaNDS Lab Middle East W.L.L. &bull; Enterprise Distribution</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 6 }}>
            Sign in with your persistent token session (stays active until explicit logout).
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
              padding: '9px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 14, fontWeight: 600
            }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Username</label>
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: 11, top: 10, color: '#94a3b8' }} />
              <input
                className="form-control"
                style={{ paddingLeft: 34 }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 11, top: 10, color: '#94a3b8' }} />
              <input
                type="password"
                className="form-control"
                style={{ paddingLeft: 34 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px 14px', fontSize: 13.5 }} disabled={submitting}>
            <KeyRound size={16} />
            {submitting ? 'Authenticating...' : 'Sign In'}
          </button>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              Quick Demo Logins (4 Major Roles)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => quickFill('superadmin', 'Super@123')}>
                <ShieldCheck size={14} color="#7c3aed" /> Superadmin
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => quickFill('admin', 'Admin@123')}>
                <Building2 size={14} color="#2563eb" /> Vendor Admin
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => quickFill('account1', 'Account@123')}>
                <Calculator size={14} color="#059669" /> Account User
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => quickFill('van1', 'Van@123')}>
                <Truck size={14} color="#d97706" /> Van 1 Driver
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

