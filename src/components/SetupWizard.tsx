import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  LockKeyhole,
  Play,
  Router,
  X,
} from 'lucide-react';
import { api, errorMessage } from '../services/ipc';
import { useUI } from '../stores/ui';
import { useSnapshot } from '../services/queries';
import { ErrorNotice } from './ui';
import { Logo } from './Logo';
import { ROUTER_PROFILES } from '../services/router-profiles';

export function SetupWizard({ firstLaunch }: { firstLaunch: boolean }) {
  const isOpen = useUI((s) => s.setupOpen);
  const setOpen = useUI((s) => s.setSetup);
  const { data: snapshot } = useSnapshot();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionCheck, setConnectionCheck] = useState<string | null>(null);
  async function checkConnection() {
    setBusy(true);
    setError(null);
    setConnectionCheck(null);
    try {
      const check = await api.checkConnection(address);
      setConnectionCheck(
        check.httpStatus === 401 && check.digestAvailable
          ? 'Маршрутизатор доступен, Digest поддерживается. Введите имя пользователя и пароль для подключения.'
          : `Маршрутизатор ответил (HTTP ${check.httpStatus}). Нажмите «Проверить и подключить» для проверки авторизации.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const client = useQueryClient();
  const navigate = useNavigate();
  const close = () => {
    setOpen(false);
    setStep(0);
    setAddress('');
    setUsername('');
    setPassword('');
    setError(null);
    setConnectionCheck(null);
  };
  async function connect(selectedMode: 'live' | 'demo') {
    setBusy(true);
    setError(null);
    try {
      const result = await api.connect(
        selectedMode,
        selectedMode === 'live' ? address : '',
        selectedMode === 'live' ? username : '',
        selectedMode === 'live' ? password : '',
      );
      setOpen(true);
      client.setQueryData(['snapshot'], result);
      await client.invalidateQueries({ queryKey: ['metrics'] });
      await client.invalidateQueries({ queryKey: ['events'] });
      setStep(3);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPassword('');
      setBusy(false);
    }
  }
  return (
    <Dialog.Root
      open={firstLaunch || isOpen}
      onOpenChange={(v) => {
        if (!v && !firstLaunch && !busy) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="setup-dialog"
          onEscapeKeyDown={(e) => {
            if (busy || firstLaunch) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy || firstLaunch) e.preventDefault();
          }}
        >
          {!firstLaunch && (
            <Dialog.Close
              className="icon-button dialog-close"
              aria-label="Закрыть настройку"
              disabled={busy}
            >
              <X size={18} />
            </Dialog.Close>
          )}
          <div className="setup-brand">
            <Logo size={28} /> NetScope
          </div>
          {step === 0 && (
            <>
              <Dialog.Title>Подключение к сети</Dialog.Title>
              <Dialog.Description>
                Подключите маршрутизатор, чтобы видеть устройства, трафик и историю сети.
              </Dialog.Description>
              <button className="button primary wide" onClick={() => setStep(1)}>
                Подключить маршрутизатор <ArrowRight size={16} />
              </button>
              <div className="setup-privacy">
                <LockKeyhole size={12} />
                Только чтение · Данные на вашем компьютере
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <Dialog.Title>Выберите источник</Dialog.Title>
              <Dialog.Description>
                Подключите свой маршрутизатор или откройте демонстрационную сеть.
              </Dialog.Description>
              <button
                className={`router-choice ${mode === 'live' ? 'chosen' : ''}`}
                onClick={() => {
                  setMode('live');
                  setAddress('');
                  setUsername('');
                  setPassword('');
                  setError(null);
                  setConnectionCheck(null);
                }}
              >
                <Router size={30} strokeWidth={1.2} />
                <span>
                  <strong>{ROUTER_PROFILES[0].model}</strong>
                  <small>{ROUTER_PROFILES[0].description}</small>
                </span>
                <span className="choice-radio">{mode === 'live' && <Check size={12} />}</span>
              </button>
              <button
                className={`router-choice ${mode === 'demo' ? 'chosen' : ''}`}
                onClick={() => setMode('demo')}
              >
                <Play size={28} strokeWidth={1.2} />
                <span>
                  <strong>Открыть демосеть</strong>
                  <small>Вымышленные устройства. Маршрутизатор не нужен.</small>
                </span>
                <span className="choice-radio">{mode === 'demo' && <Check size={12} />}</span>
              </button>
              {snapshot?.mode === 'live' && snapshot.router && (
                <button
                  className="text-button saved-connection"
                  onClick={() => {
                    setAddress(snapshot.router!.address);
                    setUsername('');
                    setMode('live');
                    setStep(2);
                  }}
                >
                  Подключиться к моей сохранённой сети
                </button>
              )}
              {error && <ErrorNotice message={error} />}
              <div className="setup-buttons">
                <button className="button" onClick={() => setStep(0)} disabled={busy}>
                  <ArrowLeft size={14} />
                  Назад
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => (mode === 'demo' ? void connect('demo') : setStep(2))}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <>
                      Продолжить
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void connect('live');
              }}
            >
              <Dialog.Title>Параметры подключения</Dialog.Title>
              <Dialog.Description>
                NetScope читает список клиентов маршрутизатора. Пароль хранится в памяти до выхода
                из приложения.
              </Dialog.Description>
              <label className="field">
                Адрес маршрутизатора
                <input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setConnectionCheck(null);
                  }}
                  placeholder="192.168.0.1"
                  autoComplete="off"
                  required
                  disabled={busy}
                />
              </label>
              <label className="field">
                Имя пользователя
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  placeholder="admin"
                  required
                  maxLength={128}
                  disabled={busy}
                />
              </label>
              <label className="field">
                Пароль
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  maxLength={1024}
                  disabled={busy}
                />
              </label>
              <div className="connection-check">
                <button
                  type="button"
                  className="text-button"
                  disabled={busy || !address}
                  onClick={() => void checkConnection()}
                >
                  Проверить доступность
                </button>
                <small>Без отправки пароля.</small>
              </div>
              {connectionCheck && (
                <div className="connection-check-result" role="status">
                  <Check size={16} />
                  {connectionCheck}
                </div>
              )}
              {error && <ErrorNotice message={error} />}
              <div className="read-only-note">
                <LockKeyhole size={15} />
                <span>Только чтение. Настройки маршрутизатора не меняются.</span>
              </div>
              <div className="setup-buttons">
                <button className="button" type="button" onClick={() => setStep(1)} disabled={busy}>
                  <ArrowLeft size={14} />
                  Назад
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? (
                    <>
                      <LoaderCircle className="spin" size={15} />
                      Подключение…
                    </>
                  ) : (
                    <>
                      Проверить и подключить
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
          {step === 3 && (
            <>
              <div className="success-symbol">
                <Check size={34} strokeWidth={1.4} />
              </div>
              <Dialog.Title>Подключено</Dialog.Title>
              <Dialog.Description>
                {snapshot?.devices.length ?? 0}устройств обнаружено.{' '}
                {snapshot?.mode === 'demo'
                  ? 'Открыта демонстрационная сеть с вымышленными устройствами.'
                  : 'Авторизация прошла, список устройств получен. Наблюдение запущено.'}
              </Dialog.Description>
              <div className="setup-summary">
                <Router size={20} />
                <span>{snapshot?.router?.name}</span>
                <span className="tag">{snapshot?.mode === 'demo' ? 'ДЕМО' : 'ПОДКЛЮЧЕНО'}</span>
              </div>
              <button
                className="button primary wide"
                onClick={() => {
                  close();
                  navigate('/');
                }}
              >
                Открыть обзор
                <ArrowRight size={15} />
              </button>
            </>
          )}
          <div className="setup-progress" aria-label={`Шаг ${step + 1} из 4`}>
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={i <= step ? 'active' : ''} />
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
