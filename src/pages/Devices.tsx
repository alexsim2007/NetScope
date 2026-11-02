import { DeviceTable } from '../components/DeviceTable';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSnapshot } from '../services/queries';
import { humanize, formatBand } from '../services/format';
import { displayName } from '../types';
import { Empty, PageTitle } from '../components/ui';
import { NetworkActions } from '../components/NetworkActions';
export default function Devices() {
  const { data: s } = useSnapshot();
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [band, setBand] = useState('all');
  const [sort, setSort] = useState('name');
  const all = s?.devices || [];
  const devices = all
    .filter(
      (d) =>
        (filter === 'hidden' ? d.hidden : !d.hidden) &&
        (filter === 'all' ||
          filter === 'hidden' ||
          (filter === 'favorites' ? d.favorite : d.status === filter)) &&
        (band === 'all' || d.wifiBand === band) &&
        [displayName(d), d.macAddress, ...d.ipv4Addresses, ...d.ipv6Addresses].some((v) =>
          v.toLowerCase().includes(search.toLowerCase()),
        ),
    )
    .sort((a, b) =>
      sort === 'lastSeen'
        ? b.lastSeen - a.lastSeen
        : sort === 'linkRate'
          ? (b.linkRate ?? -1) - (a.linkRate ?? -1)
          : displayName(a).localeCompare(displayName(b)),
    );
  return (
    <>
      <PageTitle title="Устройства" action={<NetworkActions />}>
        Устройства, которые появлялись в вашей сети.
      </PageTitle>
      <div className="device-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Поиск устройств"
            autoFocus={params.has('search')}
            placeholder="Имя, IP-адрес или MAC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>⌘ K</kbd>
        </label>
        <label className="sr-only" htmlFor="device-status">
          Состояние устройств
        </label>
        <select id="device-status" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {['all', 'online', 'stale', 'offline', 'unknown', 'favorites', 'hidden'].map((v) => (
            <option key={v} value={v}>
              {v === 'all' ? 'Все устройства' : humanize(v)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="band-filter">
          Диапазон Wi-Fi
        </label>
        <select id="band-filter" value={band} onChange={(e) => setBand(e.target.value)}>
          <option value="all">Все диапазоны</option>
          {[...new Set(all.flatMap((d) => (d.wifiBand ? [d.wifiBand] : [])))].map((v) => (
            <option key={v} value={v}>
              {formatBand(v)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="device-sort">
          Порядок устройств
        </label>
        <select id="device-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">По имени</option>
          <option value="lastSeen">Последняя активность</option>
          <option value="linkRate">Скорость соединения</option>
        </select>
      </div>
      <div className="result-count">
        Устройств: {devices.length}
        <span>В сети: {all.filter((d) => d.status === 'online').length}</span>
      </div>
      {!devices.length ? (
        <div className="panel">
          <Empty title={search || filter !== 'all' ? 'Ничего не найдено' : 'Пока нет устройств'}>
            Измените фильтр или подключите маршрутизатор.
          </Empty>
        </div>
      ) : (
        <div className="panel">
          <DeviceTable devices={devices} expanded />
        </div>
      )}
      <p className="fine-print">
        Записи в таблице соседей могут устаревать. Случайный MAC-адрес может принадлежать знакомому
        устройству.
      </p>
    </>
  );
}
