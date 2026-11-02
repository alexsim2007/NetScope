import { Heart, Wifi } from 'lucide-react';
import type { Device } from '../types';
import { displayName } from '../types';
import { dateTime, formatBand } from '../services/format';
import { useUI } from '../stores/ui';
import { DeviceIcon, Status } from './ui';

export function DeviceTable({
  devices,
  expanded = false,
}: {
  devices: Device[];
  expanded?: boolean;
}) {
  const select = useUI((s) => s.selectDevice);
  return (
    <div className="table-scroll">
      <table className="device-table">
        <thead>
          <tr>
            <th>Устройство</th>
            <th>Подключение</th>
            <th>Состояние</th>
            {expanded && <th>Последняя активность</th>}
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id}>
              <td>
                <button className="device-name" onClick={() => select(d.id)}>
                  <span className={`device-avatar kind-${d.deviceType}`}>
                    <DeviceIcon device={d} size={20} />
                  </span>
                  <span>
                    <strong>
                      {displayName(d)}
                      {d.favorite && <Heart size={11} fill="currentColor" />}
                    </strong>
                    <small
                      className="device-address"
                      title={
                        d.addressesObservedAt
                          ? `Last reported ${dateTime(d.addressesObservedAt)}`
                          : undefined
                      }
                    >
                      {d.ipv4Addresses[0] || d.ipv6Addresses[0] || 'Адрес не получен'}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <span
                  className={`connection-label ${d.connectionType === 'wifi' ? `wireless ${d.wifiBand?.startsWith('2.4') ? 'band-24' : ''}` : ''}`}
                >
                  {d.connectionType === 'wifi' && <Wifi size={13} />}
                  {d.connectionType === 'wifi' ? formatBand(d.wifiBand) : 'Сосед сети'}
                </span>
              </td>
              <td>
                <Status value={d.status} />
              </td>
              {expanded && <td className="muted">{dateTime(d.lastSeen)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
