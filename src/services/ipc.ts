import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  Device,
  DevicePatch,
  Metric,
  NetworkContext,
  NetworkEvent,
  Settings,
  Snapshot,
} from '../types';

export const desktopAvailable = () => isTauri();
export function errorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message;
  return 'Не удалось выполнить запрос. Повторите попытку.';
}
async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    throw new Error('Откройте установленный NetScope или запустите npm run tauri dev.');
  try {
    return await invoke<T>(name, args);
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}
export const api = {
  desktopStatus: () =>
    command<{ platform: string; alcoveInstalled: boolean; autostartEnabled: boolean }>(
      'get_desktop_status',
    ),
  setAutostart: (enabled: boolean) =>
    command<{ platform: string; alcoveInstalled: boolean; autostartEnabled: boolean }>(
      'set_autostart',
      { enabled },
    ),
  testNotification: () => command<void>('test_desktop_notification'),
  openFeedback: () => command<void>('open_feedback'),
  snapshot: () => command<Snapshot>('get_snapshot'),
  checkConnection: (address: string) =>
    command<{ httpStatus: number; digestAvailable: boolean }>('check_router_connection', {
      address,
    }),
  connect: (mode: 'live' | 'demo', address: string, username: string, password: string) =>
    command<Snapshot>('connect_router', { mode, address, username, password }),
  disconnect: () => command<void>('disconnect_router'),
  refresh: () => command<Snapshot>('refresh_network'),
  pause: (paused: boolean) => command<void>('set_paused', { paused }),
  settings: () => command<Settings>('get_settings'),
  saveSettings: (settings: Settings) => command<void>('save_settings', { settings }),
  updateDevice: (patch: DevicePatch) => command<Device>('update_device', { patch }),
  events: (deviceId: string | null, context: NetworkContext) =>
    command<NetworkEvent[]>('get_events', { deviceId, context }),
  metrics: (seconds: number, deviceId: string | null, context: NetworkContext) =>
    command<Metric[]>('get_metrics', { seconds, deviceId, context }),
  subscribe: (callback: (snapshot: Snapshot) => void) =>
    listen<Snapshot>('netscope://snapshot', (e) => callback(e.payload)),
  navigate: (callback: (path: string) => void) =>
    listen<string>('netscope://navigate', (e) => callback(e.payload)),
};
