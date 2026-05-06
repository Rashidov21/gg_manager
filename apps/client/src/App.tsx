import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Lock, WifiOff } from 'lucide-react';

type ScreenState = 'locked' | 'active' | 'warning' | 'expired';

type SessionState = {
  isLoggedIn: boolean;
  username: string;
  remainingSeconds: number;
};

const INITIAL_STATE: SessionState = {
  isLoggedIn: false,
  username: '',
  remainingSeconds: 0,
};

const WARNING_THRESHOLD_SECONDS = 10 * 60;

function formatTime(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function timerColor(remainingSeconds: number): string {
  const minutes = remainingSeconds / 60;
  if (minutes > 30) return '#22c55e';
  if (minutes >= 15) return '#eab308';
  if (minutes >= 5) return '#f97316';
  return '#ef4444';
}

export const App: React.FC = () => {
  const [session, setSession] = useState<SessionState>(INITIAL_STATE);
  const [loginName, setLoginName] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setIsConnected(true);
    const onOffline = () => setIsConnected(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!session.isLoggedIn || session.remainingSeconds <= 0) return;
    const id = window.setInterval(() => {
      setSession((prev) => {
        if (!prev.isLoggedIn) return prev;
        return { ...prev, remainingSeconds: Math.max(prev.remainingSeconds - 1, 0) };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [session.isLoggedIn, session.remainingSeconds]);

  const screenState: ScreenState = useMemo(() => {
    if (!session.isLoggedIn) return 'locked';
    if (session.remainingSeconds <= 0) return 'expired';
    if (session.remainingSeconds <= WARNING_THRESHOLD_SECONDS) return 'warning';
    return 'active';
  }, [session]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!loginName.trim()) {
      setLoginError('Введите имя пользователя');
      return;
    }

    setLoginError(null);
    setSession({
      isLoggedIn: true,
      username: loginName.trim(),
      remainingSeconds: 60 * 60,
    });
  };

  const handleReset = () => {
    setSession(INITIAL_STATE);
    setLoginName('');
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'radial-gradient(circle at top, #131b2f 0%, #080b15 65%, #05070f 100%)',
        color: '#e2e8f0',
        fontFamily: 'Inter, Roboto, system-ui, sans-serif',
      }}
    >
      <AnimatePresence>
        {!isConnected && (
          <motion.div
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              background: 'rgba(220, 38, 38, 0.95)',
              color: 'white',
              fontSize: 13,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <WifiOff size={14} />
            Связь с сервером потеряна, повторная попытка...
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {screenState === 'locked' && (
          <LockedScreen
            key="locked"
            loginName={loginName}
            setLoginName={setLoginName}
            loginError={loginError}
            onSubmit={handleLogin}
          />
        )}

        {screenState === 'active' && (
          <ActiveSessionScreen key="active" username={session.username} remainingSeconds={session.remainingSeconds} />
        )}

        {screenState === 'warning' && (
          <WarningScreen key="warning" username={session.username} remainingSeconds={session.remainingSeconds} />
        )}

        {screenState === 'expired' && <ExpiredScreen key="expired" onReset={handleReset} />}
      </AnimatePresence>
    </div>
  );
};

type LockedProps = {
  loginName: string;
  setLoginName: (v: string) => void;
  loginError: string | null;
  onSubmit: (e: React.FormEvent) => void;
};

const LockedScreen: React.FC<LockedProps> = ({ loginName, setLoginName, loginError, onSubmit }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
  >
    <form
      onSubmit={onSubmit}
      style={{
        width: 420,
        borderRadius: 18,
        border: '1px solid rgba(59,130,246,0.35)',
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(8px)',
        padding: 28,
        boxShadow: '0 0 50px rgba(2, 6, 23, 0.8)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Lock size={18} />
        <h1 style={{ margin: 0, fontSize: 22 }}>GG Client — Экран блокировки</h1>
      </div>
      <p style={{ marginTop: 0, color: '#94a3b8', fontSize: 13 }}>
        Войдите, чтобы начать игровую сессию.
      </p>

      <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>Логин</label>
      <input
        value={loginName}
        onChange={(e) => setLoginName(e.target.value)}
        placeholder="gamer_01"
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid #334155',
          background: '#0f172a',
          color: '#e2e8f0',
          marginBottom: 12,
        }}
      />

      {loginError && (
        <div style={{ color: '#fca5a5', fontSize: 12, marginBottom: 10 }}>{loginError}</div>
      )}

      <button
        type="submit"
        style={{
          width: '100%',
          border: 'none',
          borderRadius: 999,
          padding: '10px 0',
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          color: 'white',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Войти
      </button>
    </form>
  </motion.div>
);

type SessionProps = { username: string; remainingSeconds: number };

const ActiveSessionScreen: React.FC<SessionProps> = ({ username, remainingSeconds }) => {
  const color = timerColor(remainingSeconds);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ width: '100%', height: '100%', padding: 24, boxSizing: 'border-box' }}>
      <Header username={username} remainingSeconds={remainingSeconds} color={color} title="Активная сессия" />
      <LauncherPlaceholder />
    </motion.div>
  );
};

const WarningScreen: React.FC<SessionProps> = ({ username, remainingSeconds }) => {
  const color = timerColor(remainingSeconds);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ width: '100%', height: '100%', padding: 24, boxSizing: 'border-box' }}>
      <Header username={username} remainingSeconds={remainingSeconds} color={color} title="Внимание: время заканчивается" />
      <div style={{ marginTop: 16, borderRadius: 14, padding: 16, background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(239,68,68,0.4)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <AlertTriangle color="#fca5a5" size={18} />
        <div style={{ fontSize: 14 }}>Осталось менее 10 минут. Пополните баланс у администратора.</div>
      </div>
      <LauncherPlaceholder />
    </motion.div>
  );
};

const ExpiredScreen: React.FC<{ onReset: () => void }> = ({ onReset }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
  >
    <div style={{ width: 520, textAlign: 'center', borderRadius: 18, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(15,23,42,0.9)', padding: 28 }}>
      <h2 style={{ marginTop: 0, color: '#fca5a5' }}>Сессия завершена</h2>
      <p style={{ color: '#cbd5e1' }}>Время истекло. Обратитесь к администратору для продления.</p>
      <button
        type="button"
        onClick={onReset}
        style={{ border: 'none', borderRadius: 999, padding: '10px 20px', background: '#3b82f6', color: 'white', fontWeight: 600, cursor: 'pointer' }}
      >
        На экран входа
      </button>
    </div>
  </motion.div>
);

const Header: React.FC<{ username: string; remainingSeconds: number; color: string; title: string }> = ({ username, remainingSeconds, color, title }) => (
  <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
    <div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
      <div style={{ color: '#94a3b8', fontSize: 13 }}>Игрок: {username}</div>
    </div>
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>Осталось времени</div>
      <div style={{ fontSize: 36, fontWeight: 800, color }}>{formatTime(remainingSeconds)}</div>
    </div>
  </header>
);

const LauncherPlaceholder: React.FC = () => (
  <main
    style={{
      height: 'calc(100% - 100px)',
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(2, 6, 23, 0.95))',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: 16,
      padding: 16,
      boxSizing: 'border-box',
    }}
  >
    {['CS2', 'DOTA 2', 'PUBG', 'Valorant', 'EA FC', 'GTA V', 'Steam', 'Battle.net'].map((game) => (
      <div key={game} style={{ borderRadius: 12, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>
        {game}
      </div>
    ))}
  </main>
);
