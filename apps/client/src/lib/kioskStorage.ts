import type { ActiveSessionResponse } from '../api/kioskSession';

export const KIOSK_SNAPSHOT_KEY = 'gg_kiosk_snapshot';
export const KIOSK_CREDS_KEY = 'gg_kiosk_creds';

export type KioskSnapshot = Pick<ActiveSessionResponse, 'phone' | 'balance' | 'endsAt'>;

export function readSnapshot(): KioskSnapshot | null {
  try {
    const raw = localStorage.getItem(KIOSK_SNAPSHOT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as KioskSnapshot;
    if (!v.phone || !v.endsAt || typeof v.balance !== 'number') return null;
    return v;
  } catch {
    return null;
  }
}

export function writeSnapshot(s: KioskSnapshot): void {
  localStorage.setItem(KIOSK_SNAPSHOT_KEY, JSON.stringify(s));
}

export function clearKioskStorage(): void {
  localStorage.removeItem(KIOSK_SNAPSHOT_KEY);
  sessionStorage.removeItem(KIOSK_CREDS_KEY);
}

export type KioskCreds = { phone: string; password: string };

export function writeCreds(c: KioskCreds): void {
  sessionStorage.setItem(KIOSK_CREDS_KEY, JSON.stringify(c));
}

export function readCreds(): KioskCreds | null {
  try {
    const raw = sessionStorage.getItem(KIOSK_CREDS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as KioskCreds;
    if (!v.phone || !v.password) return null;
    return v;
  } catch {
    return null;
  }
}
