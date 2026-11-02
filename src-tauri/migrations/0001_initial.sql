PRAGMA foreign_keys = ON;
CREATE TABLE routers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL,
  manufacturer TEXT NOT NULL, model TEXT NOT NULL, hardware_revision TEXT NOT NULL,
  adapter_type TEXT NOT NULL, last_connected_at INTEGER NOT NULL, data_json TEXT NOT NULL
);
CREATE TABLE devices (
  id TEXT PRIMARY KEY, router_id TEXT NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  mac_address TEXT NOT NULL, hostname TEXT, custom_name TEXT, device_type TEXT NOT NULL,
  first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, current_status TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL,
  UNIQUE(router_id, mac_address)
);
CREATE TABLE device_addresses (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL, ip_version INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  PRIMARY KEY(device_id, ip_address)
);
CREATE TABLE device_metrics (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE, timestamp INTEGER NOT NULL,
  link_rate REAL, rssi_raw REAL, tx_bytes INTEGER, rx_bytes INTEGER, tx_bps REAL, rx_bps REAL,
  PRIMARY KEY(device_id, timestamp)
);
CREATE INDEX metrics_time ON device_metrics(timestamp);
CREATE TABLE metric_rollups (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE, timestamp INTEGER NOT NULL,
  tx_bps REAL, rx_bps REAL, link_rate REAL, rssi_raw REAL,
  PRIMARY KEY(device_id, timestamp)
);
CREATE TABLE network_samples (
  router_id TEXT NOT NULL REFERENCES routers(id) ON DELETE CASCADE, timestamp INTEGER NOT NULL,
  connected_devices REAL NOT NULL, PRIMARY KEY(router_id, timestamp)
);
CREATE TABLE network_rollups (
  router_id TEXT NOT NULL REFERENCES routers(id) ON DELETE CASCADE, timestamp INTEGER NOT NULL,
  connected_devices REAL NOT NULL, PRIMARY KEY(router_id, timestamp)
);
CREATE TABLE network_events (
  id TEXT PRIMARY KEY, router_id TEXT NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX events_router_time ON network_events(router_id, created_at DESC);
CREATE INDEX events_device_time ON network_events(device_id, created_at DESC);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
