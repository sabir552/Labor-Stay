import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { get, post } from '../api/client';

const AuthContext = createContext(null);

const TOKEN_KEY = 'laborstay_token';
const USER_KEY = 'laborstay_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  // On boot, if we have a token, validate it
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }
    get('/auth/me')
      .then((r) => {
        setUser(r.user);
        localStorage.setItem(USER_KEY, JSON.stringify(r.user));
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await post('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, r.token);
    localStorage.setItem(USER_KEY, JSON.stringify(r.user));
    setUser(r.user);
    return r.user;
  }, []);

  const register = useCallback(async (payload) => {
    const r = await post('/auth/register', payload);
    localStorage.setItem(TOKEN_KEY, r.token);
    localStorage.setItem(USER_KEY, JSON.stringify(r.user));
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(() => {
    post('/auth/logout', {}).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const r = await get('/auth/me');
      setUser(r.user);
      localStorage.setItem(USER_KEY, JSON.stringify(r.user));
      return r.user;
    } catch { return null; }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
