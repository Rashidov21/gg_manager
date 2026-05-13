import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/tauri';
import { Lock, WifiOff } from 'lucide-react';
import { fetchActiveSession } from '../api/kioskSession';
import { writeCreds, writeSnapshot } from '../lib/kioskStorage';

const DEFAULT_PASSWORD = '1234';

export const LoginWindow: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const p = phone.trim();
    if (!p) {
      setError('Введите номер телефона');
      return;
    }
    if (!password) {
      setError('Введите пароль');
      return;
    }

    setLoading(true);
    try {
      const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
      const computerId = isTauri
        ? await invoke<string>('get_computer_id')
        : ((import.meta.env.VITE_GG_COMPUTER_ID as string) || 'pc-1');

      const data = await fetchActiveSession(computerId, p, password);
      writeSnapshot({ phone: data.phone, balance: data.balance, endsAt: data.endsAt });
      writeCreds({ phone: p, password });

      if (isTauri) {
        await invoke('present_overlay');
      } else {
        window.location.href = '/?window=overlay';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100">
      <AnimatePresence>
        {!online && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="absolute left-0 right-0 top-0 z-50 flex items-center gap-2 bg-red-600 px-4 py-2.5 text-sm text-white"
          >
            <WifiOff size={14} />
            Нет соединения с сетью
          </motion.div>
        )}
      </AnimatePresence>

      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[420px] rounded-2xl border border-blue-500/30 bg-slate-900/90 p-7 shadow-2xl backdrop-blur-md"
      >
        <div className="mb-2 flex items-center gap-2">
          <Lock className="text-blue-400" size={20} />
          <h1 className="text-xl font-semibold">GG Client — вход</h1>
        </div>
        <p className="mb-6 text-sm text-slate-400">Введите телефон и пароль для начала сессии.</p>

        <label className="mb-1 block text-xs font-medium text-slate-400">Телефон (логин)</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+998901234567"
          autoComplete="username"
          className="mb-4 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none ring-blue-500/40 focus:ring-2"
        />

        <label className="mb-1 block text-xs font-medium text-slate-400">Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••"
          autoComplete="current-password"
          className="mb-1 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none ring-blue-500/40 focus:ring-2"
        />
        <p className="mb-4 text-xs text-slate-500">По умолчанию принимается пароль: {DEFAULT_PASSWORD}</p>

        {error && <div className="mb-3 text-sm text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg transition enabled:hover:brightness-110 disabled:opacity-60"
        >
          {loading ? 'Вход…' : 'Войти'}
        </button>
      </motion.form>
    </div>
  );
};
