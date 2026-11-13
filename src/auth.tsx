import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, configureApi } from './api';
import type { User } from './types';

const KEY_TOKEN = 'calico.token';
const KEY_USER = 'calico.user';
const KEY_URL = 'calico.apiUrl';

const DEFAULT_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

type AuthState = {
  ready: boolean;
  user: User | null;
  apiUrl: string;
  setApiUrl: (url: string) => Promise<void>;
  signIn: (username: string, pin: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [apiUrl, setApiUrlState] = useState(DEFAULT_URL);

  const clearSession = useCallback(async () => {
    await SecureStore.deleteItemAsync(KEY_TOKEN);
    await SecureStore.deleteItemAsync(KEY_USER);
    configureApi({ token: null });
    setUser(null);
  }, []);

  useEffect(() => {
    (async () => {
      const [token, userJson, url] = await Promise.all([
        SecureStore.getItemAsync(KEY_TOKEN),
        SecureStore.getItemAsync(KEY_USER),
        SecureStore.getItemAsync(KEY_URL),
      ]);
      const base = url || DEFAULT_URL;
      setApiUrlState(base);
      configureApi({ baseUrl: base, token, onUnauthorized: () => void clearSession() });
      if (token && userJson) setUser(JSON.parse(userJson));
      setReady(true);
    })();
  }, [clearSession]);

  const setApiUrl = useCallback(async (url: string) => {
    const clean = url.trim();
    await SecureStore.setItemAsync(KEY_URL, clean);
    configureApi({ baseUrl: clean });
    setApiUrlState(clean);
  }, []);

  const signIn = useCallback(async (username: string, pin: string) => {
    const res = await api.login(username, pin);
    await SecureStore.setItemAsync(KEY_TOKEN, res.token);
    await SecureStore.setItemAsync(KEY_USER, JSON.stringify(res.user));
    configureApi({ token: res.token });
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Sign out locally even if the server can't be reached.
    }
    await clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({ ready, user, apiUrl, setApiUrl, signIn, signOut }),
    [ready, user, apiUrl, setApiUrl, signIn, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
