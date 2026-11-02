import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useMetrics, useSnapshot } from '../services/queries';
import { displayName } from '../types';
import { formatRate } from '../services/format';
import { errorMessage } from '../services/ipc';
import { MetricChart, type ChartMetric } from '../components/MetricChart';
import { ErrorNotice, Panel } from '../components/ui';
export default function Analytics() {
  const { data: s } = useSnapshot();
  const [seconds, setSeconds] = useState(3600);
  const [device, setDevice] = useState('');
  const [metric, setMetric] = useState<ChartMetric>('traffic');
  const { data = [], error } = useMetrics(seconds, device || null);
  const names = {
    traffic: 'Активность сети',
    linkRate: 'Скорость Wi-Fi',
    rssiRaw: 'RSSI (исходный)',
    connectedDevices: 'Устройства в сети',
  };
  const latest = data.at(-1);
  return (
    <>
      <div className="analytics-toolbar">
        <label>
          Устройство
          <select
            aria-label="Устройство на графике"
            value={device}
            onChange={(e) => {
              setDevice(e.target.value);
              if (e.target.value && metric === 'connectedDevices') setMetric('traffic');
            }}
          >
            <option value="">Вся сеть</option>
            {s?.devices.map((d) => (
              <option key={d.id} value={d.id}>
                {displayName(d)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Показатель
          <select
            aria-label="Показатель"
            value={metric}
            onChange={(e) => setMetric(e.target.value as ChartMetric)}
          >
            {Object.entries(names).map(([k, v]) => (
              <option key={k} value={k} disabled={k === 'connectedDevices' && !!device}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="range-selector">
          {[
            [300, '5 минут'],
            [3600, '1 час'],
            [86400, '24 часа'],
            [604800, '7 дней'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={seconds === v ? 'active' : ''}
              onClick={() => setSeconds(Number(v))}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="traffic-readings">
        <div className="stat-card">
          <div className="stat-label">
            TX маршрутизатора
            <ArrowUpRight size={16} />
          </div>
          <div className="stat-value activity-value">{formatRate(latest?.txBps)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            RX маршрутизатора
            <ArrowDownLeft size={16} />
          </div>
          <div className="stat-value activity-value">{formatRate(latest?.rxBps)}</div>
        </div>
      </div>
      <Panel
        title={names[metric]}
        subtitle={
          metric === 'traffic'
            ? 'Мбит/с · счётчики маршрутизатора, направления не проверены'
            : metric === 'linkRate'
              ? 'Мбит/с · скорость соединения Wi-Fi, не интернета'
              : metric === 'rssiRaw'
                ? 'Исходные значения прошивки · не dBm и не проценты'
                : 'Устройства в сети при успешном обновлении'
        }
        action={
          <span className="tag subdued">{device ? 'ИСТОРИЯ УСТРОЙСТВА' : 'ИСТОРИЯ СЕТИ'}</span>
        }
      >
        {error ? (
          <ErrorNotice message={errorMessage(error)} />
        ) : (
          <MetricChart data={data} metric={metric} height={340} zoom />
        )}
        {metric === 'traffic' && (
          <div className="chart-legend">
            <span>
              <i />
              TX маршрутизатора
            </span>
            <span>
              <i className="dim" />
              RX маршрутизатора
            </span>
          </div>
        )}
      </Panel>
      <p className="fine-print">
        При потере данных на графике остаются пропуски. Направления TX/RX требуют проверки.
      </p>
    </>
  );
}
