import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Monitor } from 'lucide-react';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { api, errorMessage } from '../services/ipc';
import { useUI } from '../stores/ui';
import { ErrorNotice, Panel } from './ui';

export function DesktopIntegration() {
  const { data, error } = useQuery({ queryKey: ['desktop-status'], queryFn: api.desktopStatus });
  const client = useQueryClient();
  const notify = useUI((s) => s.notify);
  const startup = useMutation({
    mutationFn: (enabled: boolean) => api.setAutostart(enabled),
    onSuccess: (value) => {
      client.setQueryData(['desktop-status'], value);
      notify(value.autostartEnabled ? 'Автозапуск включён' : 'Автозапуск выключен');
    },
  });
  const test = useMutation({
    mutationFn: async () => {
      if (!(await isPermissionGranted()) && (await requestPermission()) !== 'granted')
        throw new Error('Разрешите уведомления NetScope в настройках системы.');
      await api.testNotification();
    },
    onSuccess: () => notify('Тестовое уведомление отправлено в систему'),
  });
  return (
    <Panel
      title="Фоновая работа"
      subtitle="Наблюдение выполняется в приложении, даже когда окно скрыто."
    >
      <div className="background-explanation">
        <Monitor size={18} />
        <p>
          Закройте окно при включённой настройке «Продолжать работу» ниже. Управление останется в
          строке меню macOS или в системном трее Windows. Команда «Выйти» остановит наблюдение.
        </p>
      </div>
      {error && <ErrorNotice message={errorMessage(error)} />}
      {data && (
        <label className="setting-row">
          <span>
            <strong>Запускать при входе в систему</strong>
            <small>
              Применяется сразу. После полного выхода нужно заново ввести пароль маршрутизатора.
            </small>
          </span>
          <input
            className="switch"
            type="checkbox"
            role="switch"
            checked={data.autostartEnabled}
            disabled={startup.isPending}
            onChange={(e) => startup.mutate(e.target.checked)}
          />
        </label>
      )}
      {startup.error && <ErrorNotice message={errorMessage(startup.error)} />}
      {data?.platform === 'macos' && (
        <div className="alcove-integration">
          <div className="alcove-status">
            <span className="alcove-pill" />
            <strong>Alcove</strong>
            <span>
              {data.alcoveInstalled ? (
                <>
                  <Check size={12} /> Найден на этом Mac
                </>
              ) : (
                'Не установлен'
              )}
            </span>
          </div>
          <p>
            В Alcove откройте Settings → Notifications → Allowed Notifications и разрешите NetScope.
            События новых устройств, отключения и восстановления связи смогут появляться возле
            чёлки. Для этого включите системные уведомления ниже.
          </p>
          <p className="fine-print">
            Интеграция через уведомления. Постоянный виджет скорости в Alcove не создаётся.
          </p>
        </div>
      )}
      <button
        type="button"
        className="button"
        disabled={test.isPending}
        onClick={() => test.mutate()}
      >
        <Bell size={14} />
        {test.isPending ? 'Отправка…' : 'Тестовое уведомление'}
      </button>
      {test.error && <ErrorNotice message={errorMessage(test.error)} />}
    </Panel>
  );
}
