import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Heart, X } from 'lucide-react';
import { useUI } from '../stores/ui';
import { useEvents, useMetrics, useSnapshot } from '../services/queries';
import { api, errorMessage } from '../services/ipc';
import { displayName, type Device, type DeviceType } from '../types';
import {
  dateTime,
  duration,
  formatBytes,
  formatRate,
  humanize,
  formatBand,
} from '../services/format';
import { DeviceIcon, ErrorNotice, Status } from './ui';
import { MetricChart } from './MetricChart';
import { EventList } from './EventList';

const deviceTypes: DeviceType[] = [
  'unknown',
  'desktop',
  'laptop',
  'smartphone',
  'tablet',
  'smartwatch',
  'tv',
  'smart_home',
  'server',
  'router',
];
function Details({ device: d }: { device: Device }) {
  const [tab, setTab] = useState<'info' | 'history' | 'settings'>('info');
  const [name, setName] = useState(d.customName || '');
  const [kind, setKind] = useState(d.deviceType);
  const [icon, setIcon] = useState(d.icon);
  const [favorite, setFavorite] = useState(d.favorite);
  const [hidden, setHidden] = useState(d.hidden);
  const { data: metrics = [], error: metricsError } = useMetrics(3600, d.id);
  const { data: events = [], error: eventsError } = useEvents(d.id);
  const client = useQueryClient();
  const notify = useUI((s) => s.notify);
  const save = useMutation({
    mutationFn: () =>
      api.updateDevice({
        id: d.id,
        customName: name || null,
        deviceType: kind,
        icon,
        favorite,
        hidden,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['snapshot'] });
      notify('Настройки устройства сохранены');
    },
  });
  const fields = [
    ['MAC-адрес', d.macAddress],
    ['IPv4', d.ipv4Addresses.join(', ') || '—'],
    ['IPv6', d.ipv6Addresses.join(', ') || '—'],
    ['Адреса обновлены', d.addressesObservedAt ? dateTime(d.addressesObservedAt) : '—'],
    ['Подключение', d.connectionType === 'wifi' ? 'Wi-Fi' : 'Тип подключения неизвестен'],
    ['SSID', d.ssid || '—'],
    ['Диапазон Wi-Fi', d.wifiBand ? formatBand(d.wifiBand) : '—'],
    ['Стандарт Wi-Fi', d.wifiStandard || '—'],
    ['Скорость Wi-Fi', d.linkRate == null ? '—' : `${d.linkRate} Мбит/с`],
    ['RSSI (исходный)', d.rssiRaw ?? '—'],
    ['Время подключения', duration(d.onlineSeconds)],
    ['Энергосбережение', d.sleep == null ? '—' : d.sleep ? 'Спящий режим' : 'Активно'],
    ['Счётчики TX / RX', `${formatBytes(d.txBytes)} / ${formatBytes(d.rxBytes)}`],
    ['Активность TX / RX', `${formatRate(d.txBps)} / ${formatRate(d.rxBps)}`],
    ['Впервые замечено', dateTime(d.firstSeen)],
    ['Последняя активность', dateTime(d.lastSeen)],
    ['Последнее наблюдение', dateTime(d.lastObserved)],
  ];
  return (
    <>
      <div className="details-identity">
        <div className="device-avatar large">
          <DeviceIcon device={d} size={32} />
        </div>
        <Status value={d.status} />
        <Dialog.Title>{displayName(d)}</Dialog.Title>
        <Dialog.Description className="mono">{d.macAddress}</Dialog.Description>
      </div>
      <div className="inspector-tabs" role="tablist" aria-label="Панель устройства">
        {(
          [
            ['info', 'Сведения'],
            ['history', 'История'],
            ['settings', 'Настройки'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'settings' && (
        <>
          <form
            className="device-edit"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <label className="field">
              Своё название
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder={d.hostname || 'Название устройства'}
              />
            </label>
            <div className="form-columns">
              <label className="field">
                Тип устройства
                <select value={kind} onChange={(e) => setKind(e.target.value as DeviceType)}>
                  {deviceTypes.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Иконка
                <select value={icon} onChange={(e) => setIcon(e.target.value)}>
                  {[
                    'auto',
                    ...deviceTypes.filter((t) => !['unknown', 'router'].includes(t)),
                    'wifi',
                  ].map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="check-field">
              <input
                type="checkbox"
                checked={favorite}
                onChange={(e) => setFavorite(e.target.checked)}
              />
              <Heart size={13} />
              Избранное устройство
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
              />
              Скрыть в основных разделах
            </label>
            {save.error && <ErrorNotice message={errorMessage(save.error)} />}
            <button className="button primary wide" disabled={save.isPending}>
              {save.isPending ? 'Сохранение…' : 'Сохранить'}
            </button>
          </form>
        </>
      )}
      {tab === 'info' && (
        <>
          <div className="inspector-rate-pair">
            <span>
              TX<strong>{formatRate(d.txBps)}</strong>
            </span>
            <span>
              RX<strong>{formatRate(d.rxBps)}</strong>
            </span>
          </div>
          <div className="details-section">
            <div className="section-label">
              ОБ УСТРОЙСТВЕ
              <button
                className="icon-button"
                aria-label="Скопировать MAC-адрес"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(d.macAddress)
                    .then(() => notify('MAC-адрес скопирован'))
                    .catch(() =>
                      notify('Буфер обмена недоступен. Выделите и скопируйте адрес вручную.'),
                    );
                }}
              >
                <Copy size={13} />
              </button>
            </div>
            <dl className="detail-list">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {d.locallyAdministered && (
              <p className="fine-print">
                Локальный MAC-адрес. При смене случайного адреса устройство появится как новое.
              </p>
            )}
            <p className="fine-print">
              TX и RX указаны как в API маршрутизатора. Направления передачи пока не проверены.
            </p>
          </div>
        </>
      )}
      {tab === 'history' && (
        <>
          <div className="details-section">
            <h3>Активность за час</h3>
            {metricsError ? (
              <ErrorNotice message={errorMessage(metricsError)} />
            ) : (
              <MetricChart data={metrics} height={160} />
            )}
          </div>
          <div className="details-section">
            <h3>История подключений</h3>
            {eventsError ? (
              <ErrorNotice message={errorMessage(eventsError)} />
            ) : (
              <EventList events={events.slice(0, 12)} compact />
            )}
          </div>
        </>
      )}
    </>
  );
}
export function DeviceDetails() {
  const id = useUI((s) => s.selectedId);
  const select = useUI((s) => s.selectDevice);
  const { data: s } = useSnapshot();
  const d = s?.devices.find((d) => d.id === id);
  return (
    <Dialog.Root
      modal={false}
      open={!!d}
      onOpenChange={(v) => {
        if (!v) select(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Content
          className="details-dialog"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <Dialog.Close
            className="icon-button dialog-close"
            aria-label="Закрыть сведения об устройстве"
          >
            <X size={19} />
          </Dialog.Close>
          {d && <Details key={d.id} device={d} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
