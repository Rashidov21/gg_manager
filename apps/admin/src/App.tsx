import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Clock,
  CreditCard,
  LayoutDashboard,
  Lock,
  Monitor,
  MonitorOff,
  Play,
  Power,
  RefreshCw,
  Settings,
  Square,
  Users,
} from 'lucide-react';
import { AccountPicker } from './AccountPicker';
import { Login } from './auth/Login';
import { useAuth } from './auth/useAuth';
import { WS_BASE_URL } from './auth/api';
import { CashierPage } from './billing/Cashier';
import { TariffsPage } from './billing/Tariffs';

type Page = 'dashboard' | 'users' | 'billing' | 'settings' | 'tariffs';
type FilterType = 'all' | 'free' | 'busy' | 'errors';
type MachineStatus = 'IDLE' | 'BUSY' | 'OFFLINE';

type HardwareState = { cpuTemp?: number; gpuTemp?: number };
type Machine = {
  id: string;
  name: string;
  status: MachineStatus;
  remainingMinutes: number;
  activeSessionId?: string;
  hardware: HardwareState;
};
type CommandResultStatus = 'pending' | 'sent' | 'acked' | 'failed';
type CommandResult = { commandId: string; computerId: string; status: CommandResultStatus; error?: string };
type TimelineItem = {
  id: string;
  at: number;
  action: string;
  machineId: string;
  commandId: string;
  status: CommandResultStatus;
  detail?: string;
};

type ServerMessage =
  | { type: 'snapshot'; machines: Machine[] }
  | { type: 'machine-update'; machine: Machine }
  | { type: 'hardware-alert'; machineId: string; reason: string }
  | { type: 'command-result'; result: CommandResult }
  | { type: 'error'; message: string; commandId?: string };

type Toast = { id: string; level: 'info' | 'success' | 'error' | 'warning'; message: string; detail?: string };
type PendingAction = { action: 'lock' | 'reboot' | 'shutdown'; machineId: string; machineName: string } | null;

const MACHINE_COUNT = 100;
const CRITICAL_TEMP = 85;

function createInitialMachines(): Machine[] {
  return Array.from({ length: MACHINE_COUNT }).map((_, idx) => ({
    id: `pc-${idx + 1}`,
    name: `PC ${idx + 1}`,
    status: 'IDLE',
    remainingMinutes: 0,
    hardware: {},
  }));
}

function newCommandId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusRu(status: MachineStatus): string {
  if (status === 'IDLE') return 'Свободно';
  if (status === 'BUSY') return 'Занято';
  return 'Не в сети';
}

function timelineStatusRu(status: CommandResultStatus): string {
  if (status === 'sent') return 'Отправлено';
  if (status === 'acked') return 'Выполнено';
  if (status === 'failed') return 'Ошибка';
  return 'Ожидание';
}

export const App: React.FC = () => {
  const { user, accessToken, logout } = useAuth();
  if (!user || !accessToken) return <Login />;

  return (
    <Dashboard accessToken={accessToken} username={user.username} role={user.role} onLogout={logout} />
  );
};

type DashboardProps = {
  accessToken: string;
  username: string;
  role: 'OWNER' | 'ADMIN' | 'OPERATOR';
  onLogout: () => void;
};

const Dashboard: React.FC<DashboardProps> = ({ accessToken, username, role, onLogout }) => {
  const [page, setPage] = useState<Page>('dashboard');
  const [filter, setFilter] = useState<FilterType>('all');
  const [machines, setMachines] = useState<Machine[]>(() => createInitialMachines());
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [accountId, setAccountId] = useState('');
  const [requestedMinutes, setRequestedMinutes] = useState(60);
  const [extendMinutes, setExtendMinutes] = useState(30);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    setWsStatus('connecting');
    const socket = new WebSocket(`${WS_BASE_URL}/admin?token=${encodeURIComponent(accessToken)}`);
    setWs(socket);

    socket.onopen = () => setWsStatus('connected');
    socket.onclose = () => setWsStatus('disconnected');
    socket.onerror = () => setWsStatus('disconnected');
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ServerMessage;
        if (data.type === 'snapshot') setMachines(data.machines);
        else if (data.type === 'machine-update') {
          setMachines((prev) => {
            const next = prev.slice();
            const idx = next.findIndex((m) => m.id === data.machine.id);
            if (idx >= 0) next[idx] = data.machine;
            else next.push(data.machine);
            return next;
          });
        } else if (data.type === 'hardware-alert') {
          pushToast({
            id: `hw-${Date.now()}`,
            level: 'warning',
            message: `Критическая температура: ${data.machineId}`,
            detail: data.reason,
          });
        } else if (data.type === 'command-result') {
          updateTimeline(data.result.commandId, data.result.status, data.result.error);
          if (data.result.status === 'failed') {
            pushToast({
              id: `err-${Date.now()}`,
              level: 'error',
              message: 'Ошибка выполнения команды',
              ...(data.result.error ? { detail: data.result.error } : {}),
            });
          }
        } else if (data.type === 'error') {
          pushToast({
            id: `e-${Date.now()}`,
            level: 'error',
            message: data.message,
            ...(data.commandId ? { detail: data.commandId } : {}),
          });
        }
      } catch {
        pushToast({ id: `parse-${Date.now()}`, level: 'error', message: 'Ошибка разбора WS сообщения' });
      }
    };

    return () => {
      socket.close();
      setWs(null);
    };
  }, [accessToken]);

  const pushToast = (toast: Toast) => {
    setToasts((prev) => [...prev, toast]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 4500);
  };

  const addTimeline = (item: TimelineItem) => {
    setTimeline((prev) => [item, ...prev].slice(0, 10));
  };

  const updateTimeline = (commandId: string, status: CommandResultStatus, detail?: string) => {
    setTimeline((prev) =>
      prev.map((t) =>
        t.commandId === commandId
          ? { ...t, status, ...(detail ? { detail } : {}) }
          : t,
      ),
    );
  };

  const sendCommand = (action: string, payload: Record<string, unknown>) => {
    const commandId = newCommandId();
    const final = { ...payload, commandId };

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pushToast({ id: `w-${Date.now()}`, level: 'error', message: 'Связь с сервером отсутствует' });
      return;
    }

    ws.send(JSON.stringify(final));
    addTimeline({
      id: `${commandId}-t`,
      at: Date.now(),
      action,
      machineId: String(payload.computerId ?? payload.sessionId ?? '-'),
      commandId,
      status: 'sent',
    });
  };

  const hasCritical = (m: Machine) =>
    (typeof m.hardware.cpuTemp === 'number' && m.hardware.cpuTemp >= CRITICAL_TEMP) ||
    (typeof m.hardware.gpuTemp === 'number' && m.hardware.gpuTemp >= CRITICAL_TEMP);

  const filteredMachines = useMemo(() => {
    if (filter === 'all') return machines;
    if (filter === 'free') return machines.filter((m) => m.status === 'IDLE');
    if (filter === 'busy') return machines.filter((m) => m.status === 'BUSY');
    return machines.filter((m) => hasCritical(m));
  }, [machines, filter]);

  const renderMain = () => {
    if (page === 'billing') return <CashierPage />;
    if (page === 'tariffs') return <TariffsPage />;
    if (page === 'users') return <div className="p-4 text-slate-300">Раздел пользователей в разработке</div>;
    if (page === 'settings') return <div className="p-4 text-slate-300">Настройки в разработке</div>;

    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Фильтр:</span>
          {([
            ['all', 'Все'],
            ['free', 'Свободные'],
            ['busy', 'Занятые'],
            ['errors', 'Ошибки'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`px-2 py-1 rounded border ${filter === k ? 'bg-blue-500/20 border-blue-500 text-blue-300' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
            >
              {label}
            </button>
          ))}

          <div className="ml-4 flex items-center gap-2">
            <span className="text-slate-400">Аккаунт:</span>
            <div className="w-56"><AccountPicker value={accountId} onChange={(id) => setAccountId(id)} /></div>
            <input
              type="number"
              value={requestedMinutes}
              onChange={(e) => setRequestedMinutes(Number(e.target.value))}
              className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700"
              title="Минуты старта"
            />
            <input
              type="number"
              value={extendMinutes}
              onChange={(e) => setExtendMinutes(Number(e.target.value))}
              className="w-20 px-2 py-1 rounded bg-slate-800 border border-slate-700"
              title="Минуты продления"
            />
          </div>
        </div>

        <div className="grid grid-cols-10 gap-2">
          {filteredMachines.map((machine) => (
            <MachineCard
              key={machine.id}
              machine={machine}
              critical={hasCritical(machine)}
              wsReady={wsStatus === 'connected'}
              onStart={() => {
                if (!accountId) {
                  pushToast({ id: `acc-${Date.now()}`, level: 'warning', message: 'Выберите аккаунт' });
                  return;
                }
                sendCommand('Запустить сессию', {
                  type: 'startSession',
                  computerId: machine.id,
                  accountId,
                  requestedMinutes,
                });
              }}
              onExtend={() => {
                if (!machine.activeSessionId) {
                  pushToast({ id: `ext-${Date.now()}`, level: 'warning', message: 'Нет активной сессии' });
                  return;
                }
                sendCommand('Продление', {
                  type: 'extendTime',
                  sessionId: machine.activeSessionId,
                  additionalMinutes: extendMinutes,
                });
              }}
              onLock={() => setPendingAction({ action: 'lock', machineId: machine.id, machineName: machine.name })}
              onReboot={() => setPendingAction({ action: 'reboot', machineId: machine.id, machineName: machine.name })}
              onShutdown={() => setPendingAction({ action: 'shutdown', machineId: machine.id, machineName: machine.name })}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-screen bg-slate-900 text-slate-50 font-sans flex">
      <aside className="w-56 border-r border-slate-800 p-3 space-y-2">
        <div className="text-sm font-semibold mb-2">GG Manager</div>
        <NavButton icon={<LayoutDashboard size={16} />} label="Панель" active={page === 'dashboard'} onClick={() => setPage('dashboard')} />
        <NavButton icon={<Users size={16} />} label="Пользователи" active={page === 'users'} onClick={() => setPage('users')} />
        <NavButton icon={<CreditCard size={16} />} label="Биллинг" active={page === 'billing'} onClick={() => setPage('billing')} />
        <NavButton icon={<Settings size={16} />} label="Настройки" active={page === 'settings'} onClick={() => setPage('settings')} />
        <NavButton icon={<Clock size={16} />} label="Тарифы" active={page === 'tariffs'} onClick={() => setPage('tariffs')} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-4 border-b border-slate-800 flex items-center justify-between">
          <div className="text-sm text-slate-300">Оператор: {username} ({role})</div>
          <div className="flex items-center gap-3 text-xs">
            <span className={`${wsStatus === 'connected' ? 'text-emerald-300' : wsStatus === 'connecting' ? 'text-amber-300' : 'text-red-300'}`}>
              {wsStatus === 'connected' ? 'Связь: Онлайн' : wsStatus === 'connecting' ? 'Связь: Подключение...' : 'Связь: Не в сети'}
            </span>
            <button onClick={onLogout} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700">Выйти</button>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex">
          <motion.main layout className="flex-1 overflow-auto">
            {renderMain()}
          </motion.main>

          <aside className="w-80 border-l border-slate-800 p-3 overflow-auto">
            <div className="text-xs font-semibold text-slate-300 mb-2">Журнал команд (последние 10)</div>
            <div className="space-y-2">
              {timeline.map((item) => (
                <div key={item.id} className="rounded-md border border-slate-700 bg-slate-800/60 p-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="font-semibold">{item.action}</span>
                    <span className={item.status === 'acked' ? 'text-emerald-300' : item.status === 'failed' ? 'text-red-300' : 'text-sky-300'}>
                      {timelineStatusRu(item.status)}
                    </span>
                  </div>
                  <div className="text-slate-400">PC: {item.machineId}</div>
                  <div className="text-slate-500">{new Date(item.at).toLocaleTimeString('ru-RU')}</div>
                  {item.detail && <div className="text-red-300 truncate">{item.detail}</div>}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      <AnimatePresence>
        {pendingAction && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-[360px] rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <div className="font-semibold mb-2">Подтверждение действия</div>
              <p className="text-sm text-slate-300 mb-4">{pendingAction.machineName}: {pendingAction.action === 'lock' ? 'Блокировать ПК?' : pendingAction.action === 'reboot' ? 'Перезагрузить ПК?' : 'Выключить ПК?'}</p>
              <div className="flex gap-2 justify-end">
                <button className="px-3 py-1.5 rounded bg-slate-800" onClick={() => setPendingAction(null)}>Отмена</button>
                <button
                  className="px-3 py-1.5 rounded bg-blue-500 text-white"
                  onClick={() => {
                    if (pendingAction.action === 'lock') {
                      sendCommand('Блокировка', { type: 'lock', computerId: pendingAction.machineId });
                    } else if (pendingAction.action === 'reboot') {
                      sendCommand('Перезагрузка', { type: 'reboot', computerId: pendingAction.machineId });
                    } else {
                      pushToast({ id: `sd-${Date.now()}`, level: 'warning', message: 'Команда выключения пока не поддерживается сервером' });
                    }
                    setPendingAction(null);
                  }}
                >
                  Подтвердить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed top-4 right-[22rem] z-50 space-y-2 w-80">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`rounded-md border p-2 text-xs ${
                toast.level === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : toast.level === 'error'
                    ? 'bg-red-500/15 border-red-500/40 text-red-200'
                    : toast.level === 'warning'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      : 'bg-sky-500/15 border-sky-500/40 text-sky-200'
              }`}
            >
              <div className="font-semibold">{toast.message}</div>
              {toast.detail && <div className="opacity-80 truncate">{toast.detail}</div>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

const NavButton: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-2 py-2 rounded text-sm ${active ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' : 'bg-slate-800/70 text-slate-300 border border-transparent hover:bg-slate-800'}`}
  >
    {icon}
    {label}
  </button>
);

type MachineCardProps = {
  machine: Machine;
  critical: boolean;
  wsReady: boolean;
  onStart: () => void;
  onExtend: () => void;
  onLock: () => void;
  onReboot: () => void;
  onShutdown: () => void;
};

const MachineCard: React.FC<MachineCardProps> = ({ machine, critical, wsReady, onStart, onExtend, onLock, onReboot, onShutdown }) => {
  const icon = critical ? <AlertTriangle size={14} className="text-red-400" /> : machine.status === 'OFFLINE' ? <MonitorOff size={14} className="text-slate-400" /> : <Monitor size={14} className={machine.status === 'BUSY' ? 'text-red-300' : 'text-emerald-300'} />;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`group relative rounded-lg border p-2 text-[11px] ${machine.status === 'IDLE' ? 'bg-emerald-500/10 border-emerald-500/30' : machine.status === 'BUSY' ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-600/20 border-slate-600/30'}`}
    >
      {critical && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />}
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold truncate">{machine.name}</span>
        {icon}
      </div>
      <div className="text-slate-300">{statusRu(machine.status)}</div>
      <div className="text-slate-400">{machine.remainingMinutes > 0 ? `${machine.remainingMinutes} мин` : '-'}</div>

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        whileHover={{ opacity: 1, y: 0 }}
        className="pointer-events-none group-hover:pointer-events-auto mt-2 grid grid-cols-3 gap-1 opacity-0 group-hover:opacity-100 transition"
      >
        <ActionBtn disabled={!wsReady} icon={<Play size={12} />} label="Старт" onClick={onStart} />
        <ActionBtn disabled={!wsReady} icon={<Clock size={12} />} label="Продл." onClick={onExtend} />
        <ActionBtn disabled icon={<Square size={12} />} label="Стоп" onClick={() => {}} />
        <ActionBtn disabled={!wsReady} icon={<Lock size={12} />} label="Блок" onClick={onLock} />
        <ActionBtn disabled={!wsReady} icon={<RefreshCw size={12} />} label="Ребут" onClick={onReboot} />
        <ActionBtn disabled={!wsReady} icon={<Power size={12} />} label="Выкл" onClick={onShutdown} />
      </motion.div>
    </motion.div>
  );
};

const ActionBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }> = ({ icon, label, onClick, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="rounded bg-slate-800/90 hover:bg-slate-700 px-1 py-1 text-[10px] flex items-center justify-center gap-1 disabled:opacity-40"
  >
    {icon}
    {label}
  </button>
);
