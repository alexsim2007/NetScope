import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, LockKeyhole, Router as RouterIcon, Unplug, Wifi } from 'lucide-react';
import { useSnapshot } from '../services/queries';
import { api, errorMessage } from '../services/ipc';
import { useUI } from '../stores/ui';
import { time } from '../services/format';
import { PageTitle, Panel, Status } from '../components/ui';
import { NetworkActions } from '../components/NetworkActions';
export default function RouterPage() {
  const { data: s } = useSnapshot();
  const open = useUI((v) => v.setSetup);
  const notify = useUI((v) => v.notify);
  const client = useQueryClient();
  const disconnect = useMutation({
    mutationFn: api.disconnect,
    onSuccess: () => client.invalidateQueries({ queryKey: ['snapshot'] }),
    onError: (e) => notify(errorMessage(e)),
  });
  const r = s?.router;
  const ssids = [
    ...new Set(s?.devices.filter((d) => d.status === 'online' && d.ssid).map((d) => d.ssid) || []),
  ];
  const bands = [
    ...new Set(
      s?.devices.filter((d) => d.status === 'online' && d.wifiBand).map((d) => d.wifiBand) || [],
    ),
  ];
  return (
    <>
      <PageTitle title="Маршрутизатор" action={<NetworkActions pause />}>
        Подключение и доступные данные.
      </PageTitle>
      <div className="router-grid">
        <Panel title="Профиль подключения" subtitle="Модель задана выбранным профилем">
          <div className="router-hero">
            <RouterIcon size={70} strokeWidth={0.9} />
            <div>
              <h2>{r?.name || 'Маршрутизатор не выбран'}</h2>
              <p>
                {r?.model || 'Выберите поддерживаемую модель'} · {r?.hardwareRevision || '—'}
              </p>
              <Status value={s?.connection || 'disconnected'} />
            </div>
            <span className="tag">
              <LockKeyhole size={11} />
              ТОЛЬКО ЧТЕНИЕ
            </span>
          </div>
          <dl className="detail-list router-info">
            {[
              ['Производитель', r?.manufacturer],
              ['Адрес', r?.address],
              ['Адаптер', r?.adapter],
              ['Версия прошивки', r?.firmware || 'API не сообщает'],
              ['Последнее успешное обновление', time(s?.updatedAt ?? null)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || '—'}</dd>
              </div>
            ))}
          </dl>
          <div className="router-buttons">
            <button className="button primary" onClick={() => open(true)}>
              Настроить подключение
              <ArrowRight size={14} />
            </button>
            <button
              className="button"
              disabled={!s?.router || s.connection === 'disconnected' || disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              <Unplug size={14} />
              Отключиться
            </button>
          </div>
        </Panel>
        <Panel title="Возможности подключения" subtitle="Доступны только проверенные запросы">
          <div className="capability-list">
            {[
              ['Обнаружение устройств', 'device_discovery'],
              ['Клиенты Wi-Fi', 'wifi_clients'],
              ['Соседи сети', 'network_neighbors'],
              ['Счётчики трафика', 'traffic_counters'],
              ['Система и WAN', 'router_information'],
              ['Аренды DHCP', 'dhcp_read'],
            ].map(([name, key]) => (
              <div key={key}>
                <span>{name}</span>
                {r?.capabilities.includes(key) ? (
                  <span className="capability-state">
                    <Check size={13} />
                    Поддерживается
                  </span>
                ) : (
                  <span className="muted">Не поддерживается</span>
                )}
              </div>
            ))}
          </div>
          <div className="read-only-note">
            <LockKeyhole size={17} />
            <span>NetScope не меняет настройки маршрутизатора.</span>
          </div>
        </Panel>
        <Panel title="Наблюдаемые сети Wi-Fi" subtitle="По данным подключённых клиентов">
          <div className="observed-wifi">
            <Wifi size={25} strokeWidth={1.2} />
            <div>
              <strong>{ssids.join(', ') || 'SSID не получен'}</strong>
              <p>{bands.join(' · ') || 'Нет данных о диапазонах'}</p>
            </div>
          </div>
          <p className="fine-print">
            Каналы, пароли Wi-Fi, скорость WAN и время работы недоступны через этот API.
          </p>
        </Panel>
      </div>
    </>
  );
}
