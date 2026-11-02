// Frontend-only QA harness. Vite removes this import from production builds.
// All data is synthetic and the workspace remains explicitly marked DEMO MODE.
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import type {
  Device,
  DevicePatch,
  Metric,
  NetworkContext,
  NetworkEvent,
  Settings,
  Snapshot,
} from '../../src/types';
import { device, settings as defaults } from '../fixtures/network';

export function installDemoHarness() {
  Object.defineProperty(globalThis, 'isTauri', { value: true, configurable: true });
  mockWindows('main');
  document.title = 'NetScope · Demo UI test';
  const now = Date.now();
  const names = [
    ['MacBook Pro', 'laptop', '5 GHz'],
    ['iPhone', 'smartphone', '5 GHz'],
    ['Workstation', 'desktop', '5 GHz'],
    ['Living room TV', 'tv', '5 GHz'],
    ['iPad', 'tablet', '5 GHz'],
    ['HomePod', 'smart_home', '2.4 GHz'],
    ['Desk lamp', 'smart_home', '2.4 GHz'],
    ['Home server', 'server', ''],
  ] as const;
  let preferences: Settings = { ...defaults };
  const devices: Device[] = names.map(([name, kind, band], i) => ({
    ...device,
    id: `demo/02:00:00:00:00:${String(i + 1).padStart(2, '0')}`,
    routerId: 'demo',
    macAddress: `02:00:00:00:00:${String(i + 1).padStart(2, '0')}`,
    hostname: name,
    deviceType: kind,
    ipv4Addresses: [`192.168.50.${21 + i}`],
    ipv6Addresses: [],
    addressesObservedAt: now,
    wifiBand: band || null,
    wifiClient: !!band,
    connectionType: band ? 'wifi' : 'unknown',
    status: i === 6 ? 'stale' : i === 7 ? 'offline' : 'online',
    txBps: i < 6 ? (i + 1) * 220000 : null,
    rxBps: i < 6 ? (i + 1) * 83000 : null,
    linkRate: band ? [866, 433, 702, 390, 650, 144, 72, 0][i] : null,
    firstSeen: now - 86400000,
    lastSeen: i === 7 ? now - 900000 : now,
    lastObserved: now,
  }));
  let state: Snapshot = {
    mode: 'demo',
    connection: 'connected',
    router: {
      id: 'demo',
      name: 'D-Link DIR-815S',
      address: 'http://192.168.50.1',
      adapter: 'demo',
      manufacturer: 'D-Link',
      model: 'DIR-815S',
      hardwareRevision: 'S1 · demo',
      firmware: null,
      capabilities: ['device_discovery', 'wifi_clients', 'network_neighbors', 'traffic_counters'],
    },
    devices,
    updatedAt: now,
    error: null,
    nextRetrySeconds: null,
  };
  const events: NetworkEvent[] = [
    {
      id: 'qa-connect',
      routerId: 'demo',
      deviceId: null,
      eventType: 'router_connected',
      message: 'Monitoring started',
      createdAt: now - 180000,
    },
    {
      id: 'qa-join',
      routerId: 'demo',
      deviceId: devices[4].id,
      eventType: 'device_discovered',
      message: 'iPad joined the network',
      createdAt: now - 140000,
    },
    {
      id: 'qa-offline',
      routerId: 'demo',
      deviceId: devices[7].id,
      eventType: 'device_offline',
      message: 'Home server is no longer observed',
      createdAt: now - 90000,
    },
  ].sort((a, b) => b.createdAt - a.createdAt);
  if (new URLSearchParams(location.search).has('setup'))
    state = { ...state, router: null, devices: [], connection: 'disconnected' };
  if (new URLSearchParams(location.search).has('offline'))
    state = {
      ...state,
      connection: 'disconnected',
      devices: devices
        .slice(0, 5)
        .map((d) => ({ ...d, status: 'unknown', txBps: null, rxBps: null })),
    };
  const publish = () => {
    void emit('netscope://snapshot', structuredClone(state));
  };
  mockIPC(
    (command, args) => {
      const input = args as Record<string, unknown> | undefined;
      switch (command) {
        case 'plugin:window|set_theme':
        case 'plugin:window|set_background_color':
          return null;
        case 'get_desktop_status':
          return { platform: 'macos', alcoveInstalled: true, autostartEnabled: false };
        case 'open_feedback':
        case 'test_desktop_notification':
          return null;
        case 'check_router_connection':
          return { httpStatus: 401, digestAvailable: true };
        case 'get_snapshot':
          return structuredClone(state);
        case 'get_settings':
          return { ...preferences };
        case 'save_settings':
          preferences = input?.settings as Settings;
          return null;
        case 'refresh_network':
          state.updatedAt = Date.now();
          publish();
          return structuredClone(state);
        case 'set_paused':
          state.connection = input?.paused ? 'paused' : 'connected';
          publish();
          return null;
        case 'disconnect_router':
          state.connection = 'disconnected';
          publish();
          return null;
        case 'connect_router': {
          if (input?.mode !== 'demo')
            throw new Error('Live connections are available only in the native desktop app.');
          state = {
            ...state,
            mode: 'demo',
            connection: 'connected',
            router: {
              id: 'demo',
              name: 'D-Link DIR-815S',
              address: 'http://192.168.50.1',
              adapter: 'demo',
              manufacturer: 'D-Link',
              model: 'DIR-815S',
              hardwareRevision: 'S1 · demo',
              firmware: null,
              capabilities: [
                'device_discovery',
                'wifi_clients',
                'network_neighbors',
                'traffic_counters',
              ],
            },
            devices,
            updatedAt: Date.now(),
          };
          publish();
          return structuredClone(state);
        }
        case 'update_device': {
          const patch = input?.patch as DevicePatch;
          state.devices = state.devices.map((d) => (d.id === patch.id ? { ...d, ...patch } : d));
          publish();
          return state.devices.find((d) => d.id === patch.id);
        }
        case 'get_events':
        case 'get_metrics': {
          const context = input?.context as NetworkContext;
          if (context.mode !== 'demo' || context.routerId !== 'demo')
            throw new Error('The active network changed.');
          if (command === 'get_events')
            return events.filter((e) => !input?.deviceId || e.deviceId === input.deviceId);
          return Array.from({ length: 61 }, (_, i): Metric => ({
            timestamp: now - 300000 + i * 5000,
            txBps: (1.5 + Math.sin(i / 7) * 0.6 + Math.sin(i / 2) * 0.12) * 1e6,
            rxBps: (0.5 + Math.cos(i / 8) * 0.15) * 1e6,
            linkRate: 702,
            rssiRaw: 65 + Math.sin(i / 5) * 8,
            connectedDevices: input?.deviceId ? null : i < 35 ? 5 : 6,
          }));
        }
        default:
          if (command.startsWith('plugin:notification|'))
            return command.includes('request_permission') ? 'granted' : true;
          throw new Error(`Unsupported UI test command: ${command}`);
      }
    },
    { shouldMockEvents: true },
  );
}
