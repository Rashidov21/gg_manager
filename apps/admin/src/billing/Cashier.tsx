import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard } from 'lucide-react';
import { AccountPicker } from '../AccountPicker';
import { useAuth } from '../auth/useAuth';
import { billingApi, type TopUpResponse } from './billingApi';

export const CashierPage: React.FC = () => {
  const { accessToken } = useAuth();
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('100000');
  const [promoCode, setPromoCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TopUpResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await billingApi.topUp(accessToken, {
        accountId,
        amount,
        ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка пополнения');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 text-slate-50 space-y-3 max-w-md">
      <h2 className="text-lg font-semibold flex items-center gap-2"><CreditCard size={18} /> Касса — Пополнить баланс</h2>
      <label className="block text-xs text-slate-300">Аккаунт<AccountPicker value={accountId} onChange={(id) => setAccountId(id)} /></label>
      <label className="block text-xs text-slate-300">Сумма (UZS)
        <input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700" />
      </label>
      <label className="block text-xs text-slate-300">Промокод (необязательно)
        <input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700" />
      </label>
      <button type="button" onClick={() => void onSubmit()} disabled={busy || !accountId || !amount} className="px-3 py-1.5 text-xs rounded bg-blue-500 hover:bg-blue-400 text-white font-semibold disabled:opacity-60">
        {busy ? 'Обработка...' : 'Пополнить баланс'}
      </button>
      {error && <div className="text-xs text-red-300">{error}</div>}
      {result && (
        <div className="text-xs bg-slate-900 border border-slate-700 rounded p-3 space-y-1">
          <div>Новый баланс: <span className="font-semibold">{result.newBalance}</span></div>
          <div>Бонусные минуты: <span className="font-semibold">{result.bonusMinutesAdded}</span></div>
          {result.promo && <div>Промокод: {result.promo.promoCode} (+{result.promo.bonusMinutes ?? 0} мин, {result.promo.bonusPercent ?? 0}%)</div>}
        </div>
      )}
    </motion.div>
  );
};
