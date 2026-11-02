export type DeviceStatus = 'online' | 'offline' | 'stale' | 'unknown';
export type DeviceType =
  | 'router'
  | 'desktop'
  | 'laptop'
  | 'smartphone'
  | 'tablet'
  | 'smartwatch'
  | 'tv'
  | 'smart_home'
  | 'server'
  | 'unknown';
export interface Device {
  id: string;
  routerId: string;
  macAddress: string;
  hostname: string | null;
  customName: string | null;
  deviceType: DeviceType;
  icon: string;
  ipv4Addresses: string[];
  ipv6Addresses: string[];
  addressesObservedAt?: number | null;
  connectionType: string;
  wifiClient: boolean;
  wifiBand: string | null;
  wifiStandard: string | null;
  ssid: string | null;
  linkRate: number | null;
  rssiRaw: number | null;
  txBytes: number | null;
  rxBytes: number | null;
  txBps: number | null;
  rxBps: number | null;
  onlineSeconds: number | null;
  sleep: boolean | null;
  firstSeen: number;
  lastSeen: number;
  lastObserved: number;
  status: DeviceStatus;
  lastKnownStatus?: DeviceStatus;
  favorite: boolean;
  hidden: boolean;
  locallyAdministered: boolean;
}
export interface RouterInfo {
  id: string;
  name: string;
  address: string;
  adapter: string;
  manufacturer: string;
  model: string;
  hardwareRevision: string;
  firmware: string | null;
  capabilities: string[];
}
export interface Snapshot {
  mode: 'live' | 'demo';
  connection: string;
  router: RouterInfo | null;
  devices: Device[];
  updatedAt: number | null;
  error: string | null;
  nextRetrySeconds: number | null;
}
export interface Settings {
  pollSeconds: number;
  offlineSeconds: number;
  retentionDays: number;
  closeToTray: boolean;
  notifications: boolean;
  favoriteNotificationsOnly: boolean;
  notifyDiscovery: boolean;
  notifyOffline: boolean;
  notifyRouter: boolean;
}
export interface NetworkEvent {
  id: string;
  routerId: string;
  deviceId: string | null;
  eventType: string;
  message: string;
  createdAt: number;
}
export interface Metric {
  timestamp: number;
  txBps: number | null;
  rxBps: number | null;
  linkRate: number | null;
  rssiRaw: number | null;
  connectedDevices: number | null;
}
export interface NetworkContext {
  mode: 'live' | 'demo';
  routerId: string;
}
export type DevicePatch = Pick<
  Device,
  'id' | 'customName' | 'deviceType' | 'icon' | 'favorite' | 'hidden'
>;
export const displayName = (d: Device) => d.customName || d.hostname || d.macAddress;
