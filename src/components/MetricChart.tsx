import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity } from 'lucide-react';
import type { Metric } from '../types';
import { formatRate } from '../services/format';
import { Empty } from './ui';
export type ChartMetric = 'traffic' | 'linkRate' | 'rssiRaw' | 'connectedDevices';
const labels = {
  txBps: 'TX маршрутизатора',
  rxBps: 'RX маршрутизатора',
  linkRate: 'Скорость Wi-Fi',
  rssiRaw: 'RSSI (исходный)',
  connectedDevices: 'Устройства в сети',
};
export function MetricChart({
  data,
  metric = 'traffic',
  height = 210,
  zoom = false,
}: {
  data: Metric[];
  metric?: ChartMetric;
  height?: number;
  zoom?: boolean;
}) {
  const hasData = data.some((m) =>
    metric === 'traffic' ? m.txBps != null || m.rxBps != null : m[metric] != null,
  );
  if (!hasData)
    return (
      <Empty icon={<Activity size={25} />} title="Ожидание данных">
        {metric === 'traffic'
          ? 'Для расчёта нужны два последовательных замера. История появится во время наблюдения.'
          : 'За выбранный период данных нет.'}
      </Empty>
    );
  const tick = (v: number) =>
    new Date(v).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const axis = {
    tick: { fill: 'var(--muted)', fontSize: 10 },
    axisLine: false,
    tickLine: false,
  };
  const tooltip = (
    <Tooltip
      contentStyle={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        fontSize: 11,
        color: 'var(--text)',
      }}
      labelFormatter={(v) => new Date(Number(v)).toLocaleString('ru-RU')}
      formatter={(value, key) => {
        const number = typeof value === 'number' ? value : Number(value);
        return [
          metric === 'traffic'
            ? formatRate(number)
            : `${Number.isFinite(number) ? number.toFixed(1) : '—'}${metric === 'linkRate' ? ' Мбит/с' : ''}`,
          labels[key as keyof typeof labels] || key,
        ];
      }}
    />
  );
  const common = (
    <>
      <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
      <XAxis
        dataKey="timestamp"
        type="number"
        domain={['dataMin', 'dataMax']}
        scale="time"
        tickFormatter={tick}
        {...axis}
        minTickGap={45}
      />
      <YAxis
        {...axis}
        width={48}
        tickFormatter={(v) =>
          metric === 'traffic' ? `${(Number(v) / 1e6).toFixed(1)}` : String(Math.round(Number(v)))
        }
      />
      {tooltip}
      {zoom && data.length > 12 && (
        <Brush
          dataKey="timestamp"
          height={18}
          stroke="var(--border-strong)"
          fill="var(--surface-alt)"
          tickFormatter={tick}
        />
      )}
    </>
  );
  return (
    <div
      className="chart-wrap"
      style={{ height }}
      role="img"
      aria-label={`${metric === 'traffic' ? 'Трафик по счётчикам' : labels[metric]} — история`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {metric === 'traffic' ? (
          <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            {common}
            <Area
              type="monotone"
              dataKey="txBps"
              stroke="var(--accent)"
              strokeWidth={1.6}
              fill="var(--accent)"
              fillOpacity={0.08}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="rxBps"
              stroke="var(--chart-rx)"
              strokeWidth={1.3}
              fill="none"
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            {common}
            <Line
              type="monotone"
              dataKey={metric}
              stroke="var(--accent)"
              strokeWidth={1.6}
              dot={data.length < 3}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
