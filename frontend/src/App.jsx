import React, { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './api/client';
import LoginPage from './pages/LoginPage';
import SuperadminPage from './pages/SuperadminPage';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import ProcurementPage from './pages/ProcurementPage';
import InventoryTransfersPage from './pages/InventoryTransfersPage';
import MainStorePosPage from './pages/MainStorePosPage';
import RoutesShopsPage from './pages/RoutesShopsPage';
import UsersQuotasPage from './pages/UsersQuotasPage';
import SettingsBrandingPage from './pages/SettingsBrandingPage';
import VanDriverMobileApp from './pages/VanDriverMobileApp';
import LedgersChequesPage from './pages/LedgersChequesPage';
import PublicShareView from './pages/PublicShareView';
import ShopConfirmView from './pages/ShopConfirmView';
import {
  LayoutDashboard, Package, ArrowRightLeft, ShoppingCart, MapPin,
  Users, Settings, LogOut, Menu, X, ShieldCheck, Truck, FileCheck2, Bell
} from 'lucide-react';

function MainShell() {
  const { user, vendor, loading, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) return hash;
    try {
      return localStorage.getItem('vansales_active_tab') || null;
    } catch {
      return null;
    }
  });

  const [pendingRequests, setPendingRequests] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [newReqAlert, setNewReqAlert] = useState(null);
  const seenReqIdsRef = useRef(new Set());
  const hasLoadedReqsRef = useRef(false);

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    try {
      localStorage.setItem('vansales_active_tab', tabId);
      if (window.location.hash !== `#${tabId}`) {
        window.history.replaceState(null, '', `#${tabId}`);
      }
    } catch {
      // ignore
    }
  };

  const openRequestList = () => {
    try {
      localStorage.setItem('vansales_state_inv_tab', JSON.stringify('dispatch'));
      localStorage.setItem('vansales_state_inv_dispatch_subtab', JSON.stringify('requests'));
      localStorage.setItem('vansales_state_inv_from_date', JSON.stringify(''));
      localStorage.setItem('vansales_state_inv_to_date', JSON.stringify(''));
    } catch {
      // ignore
    }
    selectTab('inventory');
    setNotifOpen(false);
    setNewReqAlert(null);
    window.dispatchEvent(new Event('vansales:open-requests'));
  };

  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash.replace(/^#/, '');
      if (h) setActiveTab(h);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const canSeeReqs =
      user &&
      user.role !== 'van' &&
      user.role !== 'superadmin' &&
      (user.role === 'admin' || user.permissions?.inventory || user.permissions?.transfers);

    if (!canSeeReqs) {
      setPendingRequests([]);
      setNewReqAlert(null);
      return;
    }

    let cancelled = false;
    const checkRequests = async () => {
      try {
        const rows = await api.get('/api/requests');
        if (cancelled || !Array.isArray(rows)) return;
        const pending = rows.filter((r) => r.status === 'pending');
        setPendingRequests(pending);

        const fresh = pending.filter((r) => !seenReqIdsRef.current.has(r.id));
        if (pending.length > 0 && (!hasLoadedReqsRef.current || fresh.length > 0)) {
          const latest = fresh[0] || pending[0];
          setNewReqAlert({
            count: pending.length,
            request_no: latest.request_no,
            van_name: latest.van_name || `Van #${latest.van_id}`,
            itemsCount: Array.isArray(latest.items) ? latest.items.length : 0,
          });
        } else if (pending.length === 0) {
          setNewReqAlert(null);
        }

        pending.forEach((r) => seenReqIdsRef.current.add(r.id));
        hasLoadedReqsRef.current = true;
      } catch {
        // ignore transient polling errors
      }
    };

    checkRequests();
    const timer = setInterval(checkRequests, 15000);
    window.addEventListener('focus', checkRequests);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', checkRequests);
    };
  }, [user]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', fontWeight: 600 }}>Restoring persistent session...</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (user.role === 'van') {
    return <VanDriverMobileApp />;
  }

  // Build Horizontal Menu based on Role & Account Permissions
  const can = (perm) => user.role === 'admin' || Boolean(user.permissions?.[perm]);

  const navItems = user.role === 'superadmin'
    ? [{ id: 'superadmin', label: 'SaaS Vendors & Licensing', icon: ShieldCheck }]
    : [
        ...(can('reports') ? [{ id: 'dashboard', label: 'Executive Live Dashboard', icon: LayoutDashboard }] : []),
        ...(can('procurement') ? [{ id: 'procurement', label: 'Procurement & Items', icon: Package }] : []),
        ...(can('inventory') || can('transfers') || can('returns') ? [{ id: 'inventory', label: 'FIFO/FEFO & Transfers', icon: ArrowRightLeft }] : []),
        ...(can('sales') ? [{ id: 'pos', label: 'Main Store Sales', icon: ShoppingCart }] : []),
        ...(user.role === 'admin' || can('reports') ? [{ id: 'ledgers', label: 'Shop Ledgers & Cheques', icon: FileCheck2 }] : []),
        ...(user.role === 'admin' ? [{ id: 'routes', label: 'Routes & Shops', icon: MapPin }] : []),
        ...(user.role === 'admin' ? [{ id: 'users', label: 'Users & Quotas', icon: Users }] : []),
        ...(user.role === 'admin' ? [{ id: 'settings', label: 'Branding & Settings', icon: Settings }] : []),
      ];

  const defaultTab = navItems[0]?.id || 'dashboard';
  const currentTab = navItems.some(n => n.id === activeTab) ? activeTab : defaultTab;

  return (
    <div className="app-shell">
      {/* Customizable Header + Horizontal Menu */}
      <header className="top-header">
        <div className="header-bar">
          <div className="brand-group">
            <button
              className="btn btn-outline btn-sm"
              style={{ background: 'rgba(255,255,255,0.14)', borderColor: 'transparent', color: 'inherit' }}
              onClick={() => setDrawerOpen(true)}
              title="Menu Drawer"
            >
              <Menu size={18} />
            </button>
            {vendor?.logo_url ? (
              <img src={vendor.logo_url} alt={vendor.company_name} className="brand-logo" />
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Truck size={18} />
              </div>
            )}
            <div>
              <div className="brand-title">{user.role === 'superadmin' ? 'SaNDS VanSales SaaS Platform' : (vendor?.company_name || 'VanSales')}</div>
              <div className="brand-sub">
                {user.full_name} &bull; <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{user.role}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            {user.role !== 'superadmin' && (can('inventory') || can('transfers')) && (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setNotifOpen((o) => !o)}
                  title="Van Stock Request Notifications"
                  style={{
                    background: pendingRequests.length > 0 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255,255,255,0.14)',
                    color: '#fff',
                    border: pendingRequests.length > 0 ? '1px solid rgba(251, 191, 36, 0.7)' : '1px solid transparent',
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Bell size={15} />
                  {pendingRequests.length > 0 && (
                    <span
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        borderRadius: 999,
                        padding: '1px 6px',
                        fontSize: 11,
                        fontWeight: 800,
                        lineHeight: 1.3,
                      }}
                    >
                      {pendingRequests.length}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 8px)',
                      width: 330,
                      maxWidth: '90vw',
                      background: '#fff',
                      color: '#0f172a',
                      borderRadius: 10,
                      boxShadow: '0 12px 30px rgba(15,23,42,0.22)',
                      border: '1px solid #e2e8f0',
                      zIndex: 1000,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 12.5 }}>Van Stock Requests ({pendingRequests.length} Pending)</strong>
                      <button type="button" onClick={() => setNotifOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                        <X size={15} />
                      </button>
                    </div>
                    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                      {pendingRequests.length === 0 ? (
                        <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                          No pending van item requests.
                        </div>
                      ) : (
                        pendingRequests.map((r) => (
                          <div key={r.id} style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 12 }}>
                              <div style={{ fontWeight: 700 }}>{r.van_name || `Van #${r.van_id}`}</div>
                              <div className="mono" style={{ fontSize: 11, color: '#475569' }}>
                                {r.request_no} &bull; {(r.items || []).length} item(s)
                              </div>
                              {r.created_at && (
                                <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
                                  {String(r.created_at).slice(0, 16).replace('T', ' ')}
                                </div>
                              )}
                            </div>
                            <button type="button" className="btn btn-primary btn-sm" onClick={openRequestList}>
                              Review
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    {pendingRequests.length > 0 && (
                      <div style={{ padding: 8, background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <button type="button" className="btn btn-emerald btn-sm" style={{ width: '100%' }} onClick={openRequestList}>
                          Open Request List &amp; Dispatch
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.2)', color: '#fecaca', border: '1px solid rgba(239,68,68,0.4)' }} onClick={logout}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>

        {/* Horizontal Navigation Bar */}
        <nav className="horiz-nav">
          <div className="horiz-nav-inner">
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-tab ${currentTab === item.id ? 'active' : ''}`}
                  onClick={() => selectTab(item.id)}
                >
                  <Icon size={15} /> {item.label}
                  {item.id === 'inventory' && pendingRequests.length > 0 && (
                    <span style={{ background: '#ef4444', color: '#fff', borderRadius: 999, padding: '0 6px', fontSize: 10.5, fontWeight: 800, marginLeft: 4 }}>
                      {pendingRequests.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Left Slider Drawer (for Mobile / Responsive Quick Access) */}
      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer-panel">
            <div style={{ background: 'var(--header-bg)', color: 'var(--header-text)', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Navigation Menu</div>
              <button onClick={() => setDrawerOpen(false)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
              {navItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    className={`drawer-item ${currentTab === item.id ? 'active' : ''}`}
                    onClick={() => { selectTab(item.id); setDrawerOpen(false); }}
                  >
                    <Icon size={16} /> {item.label}
                  </button>
                );
              })}
            </div>
          </aside>
        </>
      )}

      {/* Main Content */}
      <main className="main-content">
        {newReqAlert && pendingRequests.length > 0 && (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 14px',
              borderRadius: 10,
              background: '#fffbeb',
              border: '1px solid #f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#92400e' }}>
              <Bell size={16} color="#d97706" />
              <span>
                <strong>New Van Stock Request:</strong> {newReqAlert.request_no} from <strong>{newReqAlert.van_name}</strong> ({pendingRequests.length} pending request{pendingRequests.length > 1 ? 's' : ''})
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-emerald btn-sm" onClick={openRequestList}>
                Review &amp; Transfer
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setNewReqAlert(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}
        {currentTab === 'superadmin' && <SuperadminPage />}
        {currentTab === 'dashboard' && <ExecutiveDashboard />}
        {currentTab === 'procurement' && <ProcurementPage />}
        {currentTab === 'inventory' && <InventoryTransfersPage />}
        {currentTab === 'pos' && <MainStorePosPage />}
        {currentTab === 'ledgers' && <LedgersChequesPage />}
        {currentTab === 'routes' && <RoutesShopsPage />}
        {currentTab === 'users' && <UsersQuotasPage />}
        {currentTab === 'settings' && <SettingsBrandingPage />}
      </main>

      {/* Customizable Footer */}
      <footer className="app-footer">
        <div className="app-footer-inner">
          <span>&copy; 2026 {vendor?.company_name || 'SaNDS Lab Middle East W.L.L.'} &bull; Powered by SaNDS VanSales SaaS</span>
          <span>Session: Persistent Token Active &bull; Light Theme</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const shareToken = params.get('share');
  if (shareToken) {
    return <PublicShareView token={shareToken} />;
  }
  const confirmShopToken = params.get('confirm-shop');
  if (confirmShopToken) {
    return <ShopConfirmView token={confirmShopToken} />;
  }
  return (
    <AuthProvider>
      <MainShell />
    </AuthProvider>
  );
}

