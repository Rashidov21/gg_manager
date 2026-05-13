import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { User } from 'lucide-react';
import { useKioskSession } from '../context/KioskSessionContext';
import { readSnapshot } from '../lib/kioskStorage';

function formatBalanceUZS(n: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
}

function avatarLetter(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length >= 2) return d.slice(-2);
  return phone.slice(0, 2).toUpperCase() || '?';
}

export const OverlayWindow: React.FC = () => {
  const { snapshot, formattedTime, isLowTime, remainingSeconds } = useKioskSession();

  useEffect(() => {
    if (readSnapshot()) return;
    const t = window.setTimeout(() => {
      if (!readSnapshot()) {
        const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
        if (isTauri) {
          void invoke('present_login').catch(console.error);
        }
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, []);

  if (!snapshot || remainingSeconds <= 0) {
    return (
      <div className="h-screen w-screen bg-transparent" aria-hidden />
    );
  }

  const borderClass = isLowTime
    ? 'border-l-red-500 animate-pulse'
    : 'border-l-blue-500';
  const timeClass = isLowTime ? 'text-red-500 animate-pulse tabular-nums' : 'text-white tabular-nums';

  return (
    <div className="flex h-full w-full items-stretch justify-stretch bg-transparent p-0">
      <div
        className={`flex h-full w-full flex-col justify-between rounded-2xl border border-white/10 border-l-4 bg-black/60 px-3 py-2.5 shadow-xl backdrop-blur-lg ${borderClass}`}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/25 text-xs font-bold text-blue-100">
            {avatarLetter(snapshot.phone)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              <User size={10} className="shrink-0" />
              <span className="truncate">{snapshot.phone}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-1">
          <div className={`text-[26px] font-bold leading-none tracking-tight ${timeClass}`}>
            {formattedTime}
          </div>
        </div>

        <div className="text-center text-[11px] font-medium text-slate-200">
          Баланс: {formatBalanceUZS(snapshot.balance)} сум
        </div>
      </div>
    </div>
  );
};
