import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext, type AuthState } from './AuthContext';
import { loginRequest, refreshRequest } from './api';

const STORAGE_KEY = 'gg.auth';

function loadState(): AuthState {
  if (typeof window === 'undefined') {
    return { user: null, accessToken: null, refreshToken: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, accessToken: null, refreshToken: null };
    const parsed = JSON.parse(raw) as AuthState;
    return parsed;
  } catch {
    return { user: null, accessToken: null, refreshToken: null };
  }
}

function persistState(state: AuthState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(() => loadState());

  useEffect(() => {
    persistState(state);
  }, [state]);

  useEffect(() => {
    if (!state.refreshToken || state.accessToken) return;
    let cancelled = false;
    refreshRequest(state.refreshToken)
      .then((res) => {
        if (cancelled) return;
        setState({
          user: res.user,
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
        });
      })
      .catch((err) => {
        console.error('[GG Admin] refresh failed', err);
        if (cancelled) return;
        setState({ user: null, accessToken: null, refreshToken: null });
      });
    return () => {
      cancelled = true;
    };
  }, [state.refreshToken, state.accessToken]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await loginRequest(username, password);
    setState({
      user: res.user,
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
    });
  }, []);

  const logout = useCallback(() => {
    setState({ user: null, accessToken: null, refreshToken: null });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
