import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleDot,
  CircleHelp,
  Plug,
  Radio,
  Unplug,
} from 'lucide-react';
import type { NetworkEvent } from '../types';
import { dateTime, humanize, eventMessage } from '../services/format';
import { useUI } from '../stores/ui';
import { Empty } from './ui';
const icons = {
  device_discovered: CircleDot,
  device_online: ArrowDownLeft,
  device_offline: ArrowUpRight,
  router_connected: Plug,
  router_disconnected: Unplug,
  router_reconnected: Radio,
  collection_error: CircleHelp,
};
export function EventList({
  events,
  compact = false,
}: {
  events: NetworkEvent[];
  compact?: boolean;
}) {
  const selectDevice = useUI((s) => s.selectDevice);
  if (!events.length)
    return (
      <Empty title="Событий пока нет">
        Здесь будут подключения, отключения и новые устройства.
      </Empty>
    );
  return (
    <div className={`event-list ${compact ? 'compact-events' : ''}`}>
      {events.map((e) => {
        const Icon = icons[e.eventType as keyof typeof icons] || CircleDot;
        return (
          <button
            key={e.id}
            className="event-row"
            disabled={!e.deviceId}
            onClick={() => selectDevice(e.deviceId)}
          >
            <span className="event-icon">
              <Icon size={15} strokeWidth={1.5} />
            </span>
            <span className="event-text">
              <strong>{humanize(e.eventType)}</strong>
              <span>{eventMessage(e)}</span>
            </span>
            <time dateTime={new Date(e.createdAt).toISOString()}>{dateTime(e.createdAt)}</time>
          </button>
        );
      })}
    </div>
  );
}
