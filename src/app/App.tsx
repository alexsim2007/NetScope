import { Component, useEffect, type ReactNode } from 'react';
import {
  HashRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  LockKeyhole,
  Monitor,
  Network,
  Router,
  Search,
  Moon,
  Sun,
  Settings,
  MessageCircle,
} from 'lucide-react';
import { api, desktopAvailable, errorMessage } from '../services/ipc';
import { useSnapshot } from '../services/queries';
import { time } from '../services/format';
import { useUI } from '../stores/ui';
import { DeviceDetails } from '../components/DeviceDetails';
import { SetupWizard } from '../components/SetupWizard';
import { ErrorNotice, Loading, Status } from '../components/ui';
import Overview from '../pages/Overview';
import Devices from '../pages/Devices';
import NetworkMap from '../pages/NetworkMap';
import ActivityPage from '../pages/Activity';
import { Logo } from '../components/Logo';
import Support from '../pages/Support';
import { watchTheme } from '../services/theme';
import RouterPage from '../pages/Router';
import SettingsPage from '../pages/Settings';

const nav = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard },
  { to: '/devices', label: 'Устройства', icon: Monitor },
  { to: '/network', label: 'Карта сети', icon: Network },
  { to: '/activity', label: 'Активность', icon: Activity },
];
function Workspace() {
  const { data: s, isLoading, error } = useSnapshot();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useUI((v) => v.resolvedTheme);
  const setTheme = useUI((v) => v.setTheme);
  const setup = useUI((v) => v.setSetup);
  const toast = useUI((v) => v.toast);
  const selectedId = useUI((v) => v.selectedId);
  useEffect(() => {
    let disposed = false;
    const cleanup: (() => void)[] = [];
    const sync = () => {
      void client.invalidateQueries({ queryKey: ['snapshot'] });
      void client.invalidateQueries({ queryKey: ['metrics'] });
      void client.invalidateQueries({ queryKey: ['events'] });
    };
    const visible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    void api
      .subscribe((snapshot) => {
        void client.cancelQueries({ queryKey: ['snapshot'] }, { revert: false });
        client.setQueryData(['snapshot'], snapshot);
        void client.invalidateQueries({ queryKey: ['metrics'] });
        void client.invalidateQueries({ queryKey: ['events'] });
      })
      .then((fn) => {
        if (disposed) fn();
        else {
          cleanup.push(fn);
          sync();
        }
      })
      .catch(() => useUI.getState().notify('Прервано обновление данных. Перезапустите NetScope.'));
    void api
      .navigate((path) => {
        if (['/', '/devices', '/settings'].includes(path)) navigate(path);
      })
      .then((fn) => {
        if (disposed) fn();
        else cleanup.push(fn);
      })
      .catch(() => {});
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        navigate('/devices?search=1');
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>('[aria-label="Поиск устройств"]')?.focus(),
        );
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
      window.removeEventListener('keydown', key);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [client, navigate]);
  if (isLoading) return <Loading />;
  if (error || !s)
    return (
      <div className="startup-error">
        <Logo size={48} />
        <h1>Не удалось запустить NetScope.</h1>
        <ErrorNotice message={errorMessage(error)} />
        <button
          className="button"
          onClick={() => void client.invalidateQueries({ queryKey: ['snapshot'] })}
        >
          Повторить
        </button>
      </div>
    );
  const label =
    location.pathname === '/settings'
      ? 'Настройки'
      : nav.find((n) =>
          n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to),
        )?.label || 'Обзор';
  return (
    <div className={`app-shell ${selectedId ? 'has-inspector' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <Logo size={38} />
          <span>NetScope</span>
        </div>
        <button
          className="workspace-switch"
          onClick={() => setup(true)}
          title="Настроить подключение"
        >
          <span className="workspace-avatar">
            <Network size={17} />
          </span>
          <span>
            <strong>{s.router?.name || 'Моя сеть'}</strong>
            <small>{s.mode === 'demo' ? 'Демосеть' : 'Локальная сеть'}</small>
          </span>
          <ChevronDown size={13} />
        </button>

        <nav aria-label="Основная навигация">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} end={to === '/'} to={to} title={label}>
              <Icon size={17} strokeWidth={1.6} />
              <span>{label}</span>
              {to === '/devices' && <small>{s.devices.length}</small>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <NavLink className="settings-link" to="/settings" title="Настройки">
          <Settings size={17} />
          <span>Настройки</span>
        </NavLink>
        <NavLink className="settings-link" to="/support" title="Обратная связь">
          <MessageCircle size={19} />
          <span>Обратная связь</span>
        </NavLink>
        <div className="sidebar-local">
          <LockKeyhole size={12} />
          На этом компьютере
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="topbar-brand">NetScope</span>
            <span className="breadcrumb-separator" />
            <strong>{location.pathname === '/support' ? 'Обратная связь' : label}</strong>
          </div>
          <div className="topbar-actions">
            {s.mode === 'demo' && <span className="demo-tag">ДЕМО</span>}
            <Status value={s.connection} />
            <span className="topbar-divider" />
            <button
              className="icon-button"
              title="Найти устройство"
              aria-label="Найти устройство"
              onClick={() => navigate('/devices?search=1')}
            >
              <Search size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
              title="Сменить тему"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="icon-button"
              title="Настройки"
              aria-label="Открыть настройки"
              onClick={() => navigate('/settings')}
            >
              <Settings size={16} />
            </button>
          </div>
        </header>
        <main className={`main-content${location.pathname === '/network' ? ' map-content' : ''}`}>
          {s.error && (
            <div className="connection-banner">
              <CircleHelp size={17} />
              <div>
                <strong>
                  {s.connection === 'authentication_required'
                    ? 'Нужно проверить подключение'
                    : s.connection === 'storage_error'
                      ? 'Не удалось сохранить историю'
                      : 'Связь прервана'}
                </strong>
                <span>
                  {s.error}
                  {s.nextRetrySeconds
                    ? ` Повторная попытка не позднее чем через ${s.nextRetrySeconds} с.`
                    : ''}
                </span>
              </div>
              <button onClick={() => setup(true)} className="button">
                Параметры подключения
                <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {s.router && s.connection === 'disconnected' && (
            <div className="connection-banner">
              <Router size={17} />
              <div>
                <strong>Наблюдение остановлено</strong>
                <span>История сохранена. Для продолжения введите пароль маршрутизатора.</span>
              </div>
              <button className="button" onClick={() => setup(true)}>
                Подключить маршрутизатор
                <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/network" element={<NetworkMap />} />
            <Route path="/devices" element={<Devices />} />
            <Route path="/activity/*" element={<ActivityPage />} />
            <Route path="/analytics" element={<Navigate to="/activity" replace />} />
            <Route path="/router" element={<RouterPage />} />
            <Route path="/events" element={<Navigate to="/activity/events" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/support" element={<Support />} />
            <Route path="*" element={<Overview />} />
          </Routes>
        </main>
        <footer className="statusbar">
          <span>
            <span className="tiny-dot" />
            {s.connection === 'connected'
              ? 'Наблюдение за сетью'
              : s.connection === 'paused'
                ? 'Наблюдение на паузе'
                : 'Нет подключения'}
          </span>
          <span className="push-right">Обновлено {time(s.updatedAt)}</span>
        </footer>
      </div>
      <DeviceDetails />
      <SetupWizard firstLaunch={!s.router} />
      {toast && (
        <div role="status" className="toast">
          <Check size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="startup-error">
        <Logo size={48} />
        <h1>Не удалось открыть интерфейс.</h1>
        <p>История осталась на этом компьютере.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Открыть заново
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  useEffect(watchTheme, []);
  if (!desktopAvailable())
    return (
      <div className="startup-error">
        <Logo size={48} />
        <h1>Откройте приложение NetScope</h1>
        <p>Откройте установленный NetScope. Для разработки используйте команду:</p>
        <code>npm run tauri dev</code>
      </div>
    );
  return (
    <ErrorBoundary>
      <HashRouter>
        <Workspace />
      </HashRouter>
    </ErrorBoundary>
  );
}
