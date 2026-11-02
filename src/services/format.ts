import type { NetworkEvent } from '../types';
const number = (value: number, digits: number) =>
  value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export function formatRate(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value >= 1e9) return `${number(value / 1e9, 2)} Гбит/с`;
  if (value >= 1e6) return `${number(value / 1e6, 2)} Мбит/с`;
  return `${number(value / 1e3, 1)} Кбит/с`;
}
export function formatBytes(value: number | null | undefined) {
  if (value == null) return '—';
  if (value >= 1e9) return `${number(value / 1e9, 2)} ГБ`;
  if (value >= 1e6) return `${number(value / 1e6, 1)} МБ`;
  return `${number(value / 1e3, 1)} КБ`;
}
export const time = (value: number | null) =>
  value == null
    ? 'Ещё не обновлялось'
    : new Date(value).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
export const dateTime = (value: number) =>
  new Date(value).toLocaleString('ru-RU', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
export const duration = (seconds: number | null) =>
  seconds == null
    ? '—'
    : seconds >= 3600
      ? `${Math.floor(seconds / 3600)} ч ${Math.floor((seconds % 3600) / 60)} мин`
      : `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
const labels: Record<string, string> = {
  online: 'В сети',
  offline: 'Не в сети',
  stale: 'Давно не виден',
  unknown: 'Неизвестно',
  connected: 'Подключено',
  disconnected: 'Отключено',
  connecting: 'Подключение',
  reconnecting: 'Повторное подключение',
  paused: 'На паузе',
  authentication_required: 'Нужен пароль',
  storage_error: 'Ошибка хранения',
  device_discovered: 'Новое устройство',
  device_online: 'Устройство подключилось',
  device_offline: 'Устройство отключилось',
  router_connected: 'Наблюдение запущено',
  router_disconnected: 'Связь потеряна',
  router_reconnected: 'Связь восстановлена',
  collection_error: 'Ошибка обновления',
  monitoring_paused: 'Наблюдение на паузе',
  monitoring_resumed: 'Наблюдение продолжено',
  desktop: 'Компьютер',
  laptop: 'Ноутбук',
  smartphone: 'Смартфон',
  tablet: 'Планшет',
  smartwatch: 'Часы',
  tv: 'Телевизор',
  smart_home: 'Умный дом',
  server: 'Сервер',
  router: 'Маршрутизатор',
  auto: 'Автоматически',
  wifi: 'Wi-Fi',
  all: 'Все устройства',
  favorites: 'Избранные',
  hidden: 'Скрытые',
};
export const humanize = (value: string) => labels[value] ?? value;
export const formatBand = (value: string | null) =>
  value?.replace('2.4', '2,4').replace('GHz', 'ГГц') ?? 'Wi-Fi';
export function eventMessage(event: NetworkEvent) {
  const message = event.message;
  // Preserve historical device names while translating messages from older builds.
  if (message.startsWith('Discovered ')) return `Обнаружено: ${message.slice(11)}`;
  if (message.endsWith(' is online')) return `${message.slice(0, -10)} — в сети`;
  if (message.endsWith(' is no longer observed'))
    return `${message.slice(0, -' is no longer observed'.length)} больше не наблюдается`;
  if (/[А-Яа-яЁё]/.test(message)) return message;
  return (
    (
      {
        router_connected: 'Подключение установлено. Данные сети обновляются.',
        router_disconnected: 'Связь с маршрутизатором потеряна.',
        router_reconnected: 'Подключение восстановлено.',
        collection_error: 'Не удалось обновить данные. Доступность устройств неизвестна.',
        monitoring_paused: 'Обновление приостановлено пользователем.',
        monitoring_resumed: 'Обновление возобновлено.',
      } as Record<string, string>
    )[event.eventType] ?? message
  );
}
