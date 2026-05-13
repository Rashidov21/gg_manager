import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { fetchActiveSession } from '../api/kioskSession';
import {
  clearKioskStorage,
  readCreds,
  readSnapshot,
  writeSnapshot,
  type KioskSnapshot,
} from '../lib/kioskStorage';

const LOW_THRESHOLD_SEC = 10 * 60;

function formatHms(totalSeconds: number): string {
  const t = Math.max(0, totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function remainingFromEndsAt(endsAtIso: string): number {
  const end = new Date(endsAtIso).getTime();
  return Math.max(0, Math.floor((end - Date.now()) / 1000));
}

type KioskSessionContextValue = {
  snapshot: KioskSnapshot | null;
  remainingSeconds: number;
  formattedTime: string;
  isLowTime: boolean;
  refreshFromServer: () => Promise<void>;
};

const KioskSessionContext = createContext<KioskSessionContextValue | null>(null);

export function KioskSessionProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<KioskSnapshot | null>(() => readSnapshot());
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const expireOnce = useRef(false);

  const syncRemaining = useCallback((snap: KioskSnapshot | null) => {
    if (!snap) {
      setRemainingSeconds(0);
      return;
    }
    setRemainingSeconds(remainingFromEndsAt(snap.endsAt));
  }, []);

  useEffect(() => {
    const snap = readSnapshot();
    setSnapshot(snap);
    syncRemaining(snap);
  }, [syncRemaining]);

  useEffect(() => {
    if (!snapshot) return;
    const id = window.setInterval(() => {
      setRemainingSeconds(remainingFromEndsAt(snapshot.endsAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [snapshot]);

  const expireToLogin = useCallback(async () => {
    clearKioskStorage();
    setSnapshot(null);
    setRemainingSeconds(0);
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    if (isTauri) {
      try {
        await invoke('present_login');
      } catch (e) {
        console.error('[Kiosk] present_login failed', e);
      }
    }
  }, []);

  useEffect(() => {
    if (!snapshot) {
      expireOnce.current = false;
      return;
    }
    if (remainingSeconds > 0) {
      expireOnce.current = false;
      return;
    }
    if (expireOnce.current) return;
    expireOnce.current = true;
    void expireToLogin();
  }, [snapshot, remainingSeconds, expireToLogin]);

  const refreshFromServer = useCallback(async () => {
    const creds = readCreds();
    if (!creds) return;
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    const computerId = isTauri
      ? await invoke<string>('get_computer_id')
      : (import.meta.env.VITE_GG_COMPUTER_ID as string) || 'pc-1';
    const data = await fetchActiveSession(computerId, creds.phone, creds.password);
    const next: KioskSnapshot = {
      phone: data.phone,
      balance: data.balance,
      endsAt: data.endsAt,
    };
    writeSnapshot(next);
    setSnapshot(next);
    syncRemaining(next);
  }, [syncRemaining]);

  useEffect(() => {
    if (!snapshot) return;
    const id = window.setInterval(() => {
      void refreshFromServer().catch((e) => console.warn('[Kiosk] poll failed', e));
    }, 45_000);
    return () => window.clearInterval(id);
  }, [snapshot, refreshFromServer]);

  const isLowTime = remainingSeconds > 0 && remainingSeconds < LOW_THRESHOLD_SEC;

  const value = useMemo(
    () => ({
      snapshot,
      remainingSeconds,
      formattedTime: formatHms(remainingSeconds),
      isLowTime,
      refreshFromServer,
    }),
    [snapshot, remainingSeconds, isLowTime, refreshFromServer],
  );

  return <KioskSessionContext.Provider value={value}>{children}</KioskSessionContext.Provider>;
}

export function useKioskSession(): KioskSessionContextValue {
  const ctx = useContext(KioskSessionContext);
  if (!ctx) throw new Error('useKioskSession must be used inside KioskSessionProvider');
  return ctx;
}
