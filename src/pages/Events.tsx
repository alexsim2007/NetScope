import { useState } from 'react';
import { ListFilter, Search } from 'lucide-react';
import { useEvents } from '../services/queries';
import { errorMessage } from '../services/ipc';
import { humanize, eventMessage } from '../services/format';
import { EventList } from '../components/EventList';
import { ErrorNotice, Panel } from '../components/ui';
export default function Events() {
  const { data = [], error } = useEvents();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const events = data.filter(
    (e) =>
      (filter === 'all' || e.eventType === filter) &&
      `${humanize(e.eventType)} ${eventMessage(e)}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="device-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Поиск событий"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск в истории сети…"
          />
        </label>
        <ListFilter size={15} className="muted" />
        <label className="sr-only" htmlFor="event-filter">
          Тип события
        </label>
        <select id="event-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Все события</option>
          {[
            'device_discovered',
            'device_online',
            'device_offline',
            'router_connected',
            'router_disconnected',
            'router_reconnected',
            'collection_error',
            'monitoring_paused',
            'monitoring_resumed',
          ].map((v) => (
            <option key={v} value={v}>
              {humanize(v)}
            </option>
          ))}
        </select>
        <span className="muted event-count">Событий: {events.length}</span>
      </div>
      <Panel title="Лента событий" subtitle="Сначала новые · до 1 000 событий">
        {error ? <ErrorNotice message={errorMessage(error)} /> : <EventList events={events} />}
      </Panel>
      <p className="fine-print">
        Колебания сигнала не создают событий. Срок хранения задаётся в настройках.
      </p>
    </>
  );
}
