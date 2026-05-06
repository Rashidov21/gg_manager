import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { billingApi, type Tariff } from './billingApi';

const TARIFF_TYPES: Tariff['type'][] = ['HOURLY', 'PACKAGE', 'NIGHT', 'BONUS'];
type Draft = Omit<Tariff, 'id'> & { id?: string };

const emptyDraft: Draft = {
  name: '',
  type: 'HOURLY',
  price: '0',
  minutes: 60,
  startHour: null,
  endHour: null,
  zone: null,
};

export const TariffsPage: React.FC = () => {
  const { accessToken, user } = useAuth();
  const canEdit = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [items, setItems] = useState<Tariff[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!accessToken) return;
    try {
      setItems(await billingApi.listTariffs(accessToken));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  };

  useEffect(() => { void reload(); }, [accessToken]);

  const onSave = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Partial<Tariff> = {
        name: draft.name,
        type: draft.type,
        price: draft.price,
        minutes: draft.minutes,
        ...(draft.startHour !== null ? { startHour: draft.startHour } : {}),
        ...(draft.endHour !== null ? { endHour: draft.endHour } : {}),
        ...(draft.zone !== null ? { zone: draft.zone } : {}),
      };
      if (draft.id) await billingApi.updateTariff(accessToken, draft.id, payload);
      else await billingApi.createTariff(accessToken, payload);
      setDraft(emptyDraft);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally { setBusy(false); }
  };

  const onDelete = async (id: string) => {
    if (!accessToken) return;
    if (!window.confirm('Удалить тариф?')) return;
    try { await billingApi.deleteTariff(accessToken, id); await reload(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Ошибка удаления'); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 text-slate-50 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Clock size={18} /> Тарифы</h2>
        <button type="button" onClick={() => void reload()} className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700">Обновить</button>
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}

      <div className="overflow-auto rounded-lg border border-slate-800">
        <table className="w-full text-xs">
          <thead className="bg-slate-900 text-slate-300"><tr><th className="text-left px-3 py-2">Название</th><th className="text-left px-3 py-2">Тип</th><th className="text-right px-3 py-2">Цена</th><th className="text-right px-3 py-2">Минуты</th><th className="text-left px-3 py-2">Окно</th><th className="text-left px-3 py-2">Зона</th><th className="text-left px-3 py-2"></th></tr></thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="px-3 py-2">{t.name}</td><td className="px-3 py-2">{t.type}</td><td className="px-3 py-2 text-right">{t.price}</td><td className="px-3 py-2 text-right">{t.minutes}</td>
                <td className="px-3 py-2">{t.startHour !== null && t.endHour !== null ? `${t.startHour}:00 — ${t.endHour}:00` : '-'}</td>
                <td className="px-3 py-2">{t.zone ?? '-'}</td>
                <td className="px-3 py-2 text-right">{canEdit && <><button type="button" onClick={() => setDraft({ id: t.id, name: t.name, type: t.type, price: t.price, minutes: t.minutes, startHour: t.startHour, endHour: t.endHour, zone: t.zone })} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 mr-1">Изм.</button><button type="button" onClick={() => void onDelete(t.id)} className="px-2 py-1 rounded bg-red-500/80 hover:bg-red-500 text-slate-50">Удал.</button></>}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">Тарифы отсутствуют</td></tr>}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="rounded-lg border border-slate-800 p-3 space-y-2">
          <div className="font-semibold text-sm">{draft.id ? 'Редактирование тарифа' : 'Новый тариф'}</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="text-slate-300">Название<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700" /></label>
            <label className="text-slate-300">Тип<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as Tariff['type'] })} className="mt-1 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700">{TARIFF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <label className="text-slate-300">Цена<input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700" /></label>
            <label className="text-slate-300">Минуты<input type="number" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })} className="mt-1 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700" /></label>
            <label className="text-slate-300">Час начала<input type="number" value={draft.startHour ?? ''} onChange={(e) => setDraft({ ...draft, startHour: e.target.value === '' ? null : Number(e.target.value) })} className="mt-1 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700" /></label>
            <label className="text-slate-300">Час конца<input type="number" value={draft.endHour ?? ''} onChange={(e) => setDraft({ ...draft, endHour: e.target.value === '' ? null : Number(e.target.value) })} className="mt-1 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700" /></label>
            <label className="text-slate-300 col-span-3">Зона<input value={draft.zone ?? ''} onChange={(e) => setDraft({ ...draft, zone: e.target.value === '' ? null : e.target.value })} className="mt-1 w-full px-2 py-1.5 rounded bg-slate-800 border border-slate-700" /></label>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void onSave()} disabled={busy || !draft.name} className="px-3 py-1.5 text-xs rounded bg-blue-500 hover:bg-blue-400 text-white font-semibold disabled:opacity-60">{draft.id ? 'Сохранить' : 'Создать'}</button>
            {draft.id && <button type="button" onClick={() => setDraft(emptyDraft)} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200">Отмена</button>}
          </div>
        </div>
      )}
    </motion.div>
  );
};
