import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from './useAuth';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-900 text-slate-50 flex items-center justify-center">
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={onSubmit}
        className="w-[380px] bg-slate-900/90 border border-slate-800 rounded-xl shadow-2xl p-6 space-y-4 backdrop-blur"
      >
        <div>
          <h1 className="text-lg font-semibold">GG Manager — Вход оператора</h1>
          <p className="text-xs text-slate-400">Тестовые пользователи: owner / admin / operator</p>
        </div>
        <label className="block text-xs text-slate-300">
          Логин
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-md bg-slate-800 border border-slate-700" />
        </label>
        <label className="block text-xs text-slate-300">
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded-md bg-slate-800 border border-slate-700" />
        </label>
        {error && <div className="text-xs text-red-300">{error}</div>}
        <button type="submit" disabled={busy} className="w-full px-3 py-2 rounded-md bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm disabled:opacity-60">
          {busy ? 'Выполняется вход...' : 'Войти'}
        </button>
      </motion.form>
    </div>
  );
};
