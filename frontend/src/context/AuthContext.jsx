import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getStoredToken, setStoredToken } from '../api/client';
import { formatAppDate, formatAppDateTime } from '../utils/dateFormat';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [van, setVan] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyThemeColors = (v) => {
    const root = document.documentElement;
    root.style.setProperty('--header-bg', v?.header_bg_color || '#0a2540');
    root.style.setProperty('--header-text', v?.header_text_color || '#ffffff');
    root.style.setProperty('--footer-bg', v?.footer_bg_color || '#f8fafc');
    root.style.setProperty('--footer-text', v?.footer_text_color || '#475569');
  };

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      applyThemeColors(null);
      setLoading(false);
      return;
    }
    api.get('/api/auth/me')
      .then((res) => {
        setUser(res.user);
        setVendor(res.vendor);
        setVan(res.van);
        applyThemeColors(res.vendor);
      })
      .catch(() => {
        setStoredToken(null);
        applyThemeColors(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/api/auth/login', {
      username,
      password,
      device_info: navigator.userAgent,
    });
    setStoredToken(res.token);
    setUser(res.user);
    setVendor(res.vendor);
    setVan(res.van);
    applyThemeColors(res.vendor);
    return res;
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout', {});
    } catch {
      // Ignore network errors during logout
    }
    setStoredToken(null);
    setUser(null);
    setVendor(null);
    setVan(null);
    applyThemeColors(null);
  };

  const updateVendorState = (newVendor) => {
    setVendor(newVendor);
    applyThemeColors(newVendor);
  };

  const formatMoney = (amount) => {
    const decimals = vendor?.currency_decimals ?? 3;
    const code = vendor?.currency_code || 'BHD';
    return `${Number(amount || 0).toFixed(decimals)} ${code}`;
  };

  const formatDate = (val) => formatAppDate(val, vendor?.date_format || 'DD/MM/YYYY');
  const formatDateTime = (val) => formatAppDateTime(val, vendor?.date_format || 'DD/MM/YYYY');

  return (
    <AuthContext.Provider value={{ user, vendor, van, loading, login, logout, updateVendorState, formatMoney, formatDate, formatDateTime }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

