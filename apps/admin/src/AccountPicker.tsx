import React, { useEffect, useState } from 'react';
import { searchAccountsRequest, type AccountSearchResult } from './auth/api';
import { useAuth } from './auth/useAuth';

type Props = {
  value: string;
  onChange: (id: string, label?: string) => void;
};

export const AccountPicker: React.FC<Props> = ({ value, onChange }) => {
  const { accessToken } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AccountSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const list = await searchAccountsRequest(accessToken, query);
          if (cancelled) return;
          setResults(list);
          setError(null);
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Ошибка поиска');
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [accessToken, query]);

  return (
    <div className="relative">
      <input
        value={value || query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Логин или accountId"
        className="mt-1 w-full px-2 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-slate-50 text-xs outline-none focus:border-blue-500"
      />
      {open && (results.length > 0 || error) && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-md bg-slate-900 border border-slate-700 shadow-lg">
          {error && <div className="px-2 py-1.5 text-[11px] text-red-300">{error}</div>}
          {results.map((acc) => (
            <button
              key={acc.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(acc.id, acc.username);
                setQuery(acc.username);
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 flex items-center justify-between"
            >
              <span className="font-medium">{acc.username}</span>
              <span className="text-[10px] text-slate-400">{acc.balance} сум · {acc.bonusMinutes} мин</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
