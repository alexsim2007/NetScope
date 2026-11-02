import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { ArrowRight, Monitor, Moon, Sun } from 'lucide-react';
import { api, errorMessage } from '../services/ipc';
import type { Settings } from '../types';
import { useUI, type Theme } from '../stores/ui';
import { useSnapshot } from '../services/queries';
import { ErrorNotice, Loading, PageTitle, Panel } from '../components/ui';
import { DesktopIntegration } from '../components/DesktopIntegration';

function Appearance() {
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  return (
    <Panel title="Оформление" subtitle="Цветовая тема приложения.">
      <div className="theme-options" role="group" aria-label="Цветовая тема">
        {(
          [
            { value: 'light', label: 'Светлая', icon: Sun },
            { value: 'dark', label: 'Тёмная', icon: Moon },
            { value: 'system', label: 'Системная', icon: Monitor },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <button
            type="button"
            key={value}
            className={`theme-option theme-${value}`}
            aria-pressed={theme === value}
            onClick={() => setTheme(value as Theme)}
          >
            <Icon size={18} />
            <span>{label}</span>
            <i />
          </button>
        ))}
      </div>
      <p className="setting-hint">Применяется сразу. Выбор сохраняется на этом компьютере.</p>
    </Panel>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [s, set] = useState(initial);
  const client = useQueryClient();
  const notify = useUI((v) => v.notify);
  const open = useUI((v) => v.setSetup);
  const { data: snapshot } = useSnapshot();
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    set((old) => ({ ...old, [key]: value }));
  const save = useMutation({
    mutationFn: async () => {
      if (
        s.notifications &&
        !(await isPermissionGranted()) &&
        (await requestPermission()) !== 'granted'
      )
        throw new Error('Разрешите уведомления в настройках системы или выключите их здесь.');
      await api.saveSettings(s);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['settings'] });
      notify('Настройки сохранены');
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="settings-grid">
        <Panel
          title="Подключение к маршрутизатору"
          subtitle={
            snapshot?.mode === 'demo'
              ? 'Сейчас открыта демонстрационная сеть.'
              : snapshot?.router?.address || 'Маршрутизатор не подключён.'
          }
        >
          <div className="connection-settings-actions">
            <button type="button" className="button" onClick={() => open(true)}>
              Настроить подключение <ArrowRight size={14} />
            </button>
            <Link to="/router" className="text-link">
              Сведения о маршрутизаторе <ArrowRight size={13} />
            </Link>
          </div>
          <p className="setting-hint">После полного выхода пароль нужно ввести заново.</p>
        </Panel>
        <Panel title="Наблюдение">
          <label className="setting-row">
            <span>
              <strong>Интервал обновления</strong>
              <small>Как часто запрашивать данные.</small>
            </span>
            <span className="number-input">
              <input
                aria-label="Интервал обновления"
                type="number"
                min={5}
                max={300}
                required
                value={s.pollSeconds}
                onChange={(e) => update('pollSeconds', Number(e.target.value))}
              />{' '}
              с
            </span>
          </label>
          <label className="setting-row">
            <span>
              <strong>Хранить историю</strong>
            </span>
            <span className="number-input">
              <input
                aria-label="Срок хранения истории"
                type="number"
                min={1}
                max={30}
                required
                value={s.retentionDays}
                onChange={(e) => update('retentionDays', Number(e.target.value))}
              />{' '}
              дн.
            </span>
          </label>
          <details className="advanced-settings">
            <summary>Дополнительно</summary>
            <label className="setting-row">
              <span>
                <strong>Таймаут отключения</strong>
                <small>Сколько ждать, прежде чем считать устройство отключённым.</small>
              </span>
              <span className="number-input">
                <input
                  aria-label="Таймаут отключения"
                  type="number"
                  min={Math.max(30, s.pollSeconds * 2)}
                  max={3600}
                  required
                  value={s.offlineSeconds}
                  onChange={(e) => update('offlineSeconds', Number(e.target.value))}
                />{' '}
                с
              </span>
            </label>
          </details>
        </Panel>
        <Panel title="Уведомления и приложение">
          <label className="setting-row">
            <span>
              <strong>Системные уведомления</strong>
              <small>Новые устройства, отключения и потеря связи.</small>
            </span>
            <input
              className="switch"
              type="checkbox"
              role="switch"
              checked={s.notifications}
              onChange={(e) => update('notifications', e.target.checked)}
            />
          </label>
          {s.notifications && (
            <details className="advanced-settings">
              <summary>Какие события показывать</summary>
              {(
                [
                  ['favoriteNotificationsOnly', 'Только избранные'],
                  ['notifyDiscovery', 'Новые устройства'],
                  ['notifyOffline', 'Отключение устройств'],
                  ['notifyRouter', 'Изменение связи с маршрутизатором'],
                ] as const
              ).map(([key, label]) => (
                <label className="setting-row" key={key}>
                  <span>
                    <strong>{label}</strong>
                  </span>
                  <input
                    className="switch"
                    type="checkbox"
                    role="switch"
                    checked={s[key]}
                    onChange={(e) => update(key, e.target.checked)}
                  />
                </label>
              ))}
            </details>
          )}
          <label className="setting-row">
            <span>
              <strong>Продолжать работу после закрытия окна</strong>
              <small>Чтобы остановить наблюдение, выберите «Выйти» в меню приложения.</small>
            </span>
            <input
              className="switch"
              type="checkbox"
              role="switch"
              checked={s.closeToTray}
              onChange={(e) => update('closeToTray', e.target.checked)}
            />
          </label>
        </Panel>
      </div>
      {save.error && <ErrorNotice message={errorMessage(save.error)} />}
      <div className="settings-save">
        <span>Сохраняется на этом компьютере.</span>
        <button className="button primary" disabled={save.isPending}>
          {save.isPending ? 'Сохранение…' : 'Сохранить изменения'}
        </button>
      </div>
    </form>
  );
}
export default function SettingsPage() {
  const { data, error, isLoading } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  return (
    <div className="settings-page">
      <PageTitle title="Настройки">Наблюдение, оформление и уведомления.</PageTitle>
      <Appearance />
      <DesktopIntegration />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={errorMessage(error)} />
      ) : (
        data && <SettingsForm key={JSON.stringify(data)} initial={data} />
      )}
      <div className="about-footer">
        <strong>NetScope</strong>
        <span>Лицензия MIT</span>
      </div>
    </div>
  );
}
