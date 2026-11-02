import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ArrowDownLeft, Network, Wifi } from 'lucide-react';
import { useMetrics, useSnapshot } from '../services/queries';
import { errorMessage } from '../services/ipc';
import { formatRate, formatBand } from '../services/format';
import { displayName } from '../types';
import { useUI } from '../stores/ui';
import { DeviceIcon, Empty, ErrorNotice, PageTitle, Panel, Status } from '../components/ui';
import { NetworkGraph } from '../components/NetworkGraph';
import { MetricChart } from '../components/MetricChart';
import { NetworkActions } from '../components/NetworkActions';

export default function Overview() {
  const { data: snapshot } = useSnapshot();
  const { data: metrics = [], error } = useMetrics(300);
  const select = useUI((s) => s.selectDevice);
  if (!snapshot) return null;
  const connected = snapshot.connection === 'connected';
  const online = snapshot.devices.filter((d) => d.status === 'online');
  const wifi = online.filter((d) => d.wifiClient);
  const band24 = wifi.filter((d) => d.wifiBand?.startsWith('2.4')).length;
  const band5 = wifi.filter((d) => d.wifiBand?.startsWith('5')).length;
  const devices = snapshot.devices
    .filter((d) => !d.hidden)
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        Number(b.status === 'online') - Number(a.status === 'online') ||
        displayName(a).localeCompare(displayName(b)),
    );
  const aggregate = (field: 'txBps' | 'rxBps') =>
    connected && online.some((d) => d[field] != null)
      ? online.reduce((sum, d) => sum + (d[field] ?? 0), 0)
      : null;
  const split = wifi.length ? (band5 / wifi.length) * 360 : 0;
  const split24 = wifi.length ? ((band5 + band24) / wifi.length) * 360 : 0;
  return (
    <div className="network-dashboard">
      <PageTitle title="Обзор" action={<NetworkActions pause />}>
        Устройства и активность вашей сети.
      </PageTitle>
      <section className="network-readings" aria-label="Состояние сети">
        <div>
          <span>
            <i className={`reading-dot ${connected ? 'live' : ''}`} /> В сети
          </span>
          <strong>
            {connected ? online.length : '—'} <small>устройств</small>
          </strong>
        </div>
        <div>
          <span>
            <Wifi size={13} /> Wi-Fi
          </span>
          <strong>
            {connected ? wifi.length : '—'} <small>клиентов</small>
          </strong>
        </div>
        <div className="reading-tx">
          <span>
            <ArrowDownLeft size={13} /> TX маршрутизатора
          </span>
          <strong>{formatRate(aggregate('txBps'))}</strong>
        </div>
        <div className="reading-rx">
          <span>
            <ArrowUpRight size={13} /> RX маршрутизатора
          </span>
          <strong>{formatRate(aggregate('rxBps'))}</strong>
        </div>
      </section>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <Panel
            title="Топология сети"
            subtitle={snapshot.router?.model || 'Маршрутизатор не подключён'}
            className="topology-panel"
            action={
              <Link to="/network" className="text-link">
                Открыть карту <ArrowUpRight size={14} />
              </Link>
            }
          >
            <NetworkGraph snapshot={snapshot} compact />
            <div className="topology-footer">
              <span>
                <i className="legend-line" /> Wi-Fi
              </span>
              <span>
                <i className="legend-line dashed" /> Сосед сети
              </span>
              <span className="push-right">Только чтение</span>
            </div>
          </Panel>
          <Panel
            title="Активность сети"
            subtitle="По доступным счётчикам · направления TX/RX не проверены"
            className="dashboard-history"
            action={
              <Link to="/activity" className="text-link">
                За 5 минут <ArrowRight size={13} />
              </Link>
            }
          >
            {error ? (
              <ErrorNotice message={errorMessage(error)} />
            ) : (
              <MetricChart data={metrics} height={160} />
            )}
          </Panel>
        </div>
        <aside className="dashboard-side">
          <Panel
            title="Подключение"
            action={<Network size={15} className="muted" />}
            className="connection-panel"
          >
            <div className="connection-profile">
              <strong>{snapshot.router?.name || 'Моя сеть'}</strong>
              <Status value={snapshot.connection} />
            </div>
            <div className="band-distribution">
              <div
                className="band-ring"
                style={{
                  background: wifi.length
                    ? `conic-gradient(var(--accent) 0deg ${split}deg, var(--cyan) ${split}deg ${split24}deg, var(--border-strong) ${split24}deg 360deg)`
                    : 'var(--border)',
                }}
              >
                <div>
                  <strong>{connected ? wifi.length : '—'}</strong>
                  <span>Wi-Fi</span>
                </div>
              </div>
              <div className="band-ring-legend">
                <span>
                  <i /> {formatBand('5 GHz')} <b>{connected ? band5 : '—'}</b>
                </span>
                <span>
                  <i /> {formatBand('2.4 GHz')} <b>{connected ? band24 : '—'}</b>
                </span>
                {wifi.length > band5 + band24 && (
                  <span>
                    Другой диапазон <b>{wifi.length - band5 - band24}</b>
                  </span>
                )}
              </div>
            </div>
            <Link to="/router" className="connection-details-link">
              Сведения о маршрутизаторе <ArrowRight size={13} />
            </Link>
          </Panel>
          <Panel
            title="Устройства"
            action={<span className="count-label">{devices.length}</span>}
            className="dashboard-clients"
          >
            {devices.length ? (
              devices.slice(0, 6).map((d) => (
                <button key={d.id} className="client-preview" onClick={() => select(d.id)}>
                  <span className={`device-avatar kind-${d.deviceType}`}>
                    <DeviceIcon device={d} size={18} />
                  </span>
                  <span>
                    <strong>{displayName(d)}</strong>
                    <small>{d.ipv4Addresses[0] || d.ipv6Addresses[0] || 'Адрес не получен'}</small>
                  </span>
                  <i
                    className={`client-state ${d.status}`}
                    title={
                      d.status === 'online'
                        ? 'В сети'
                        : d.status === 'offline'
                          ? 'Не в сети'
                          : 'Нет свежих данных'
                    }
                  />
                </button>
              ))
            ) : (
              <Empty title="Пока нет устройств">Подключите маршрутизатор.</Empty>
            )}
            <Link to="/devices" className="all-clients">
              Все устройства <ArrowRight size={13} />
            </Link>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
