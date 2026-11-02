use serde::{Deserialize, Serialize};

pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Online,
    Offline,
    Stale,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub router_id: String,
    pub mac_address: String,
    pub hostname: Option<String>,
    pub custom_name: Option<String>,
    pub device_type: String,
    pub icon: String,
    pub ipv4_addresses: Vec<String>,
    pub ipv6_addresses: Vec<String>,
    #[serde(default)]
    pub addresses_observed_at: Option<i64>,
    pub connection_type: String,
    #[serde(default)]
    pub wifi_client: bool,
    pub wifi_band: Option<String>,
    pub wifi_standard: Option<String>,
    pub ssid: Option<String>,
    pub link_rate: Option<f64>,
    pub rssi_raw: Option<f64>,
    pub tx_bytes: Option<u64>,
    pub rx_bytes: Option<u64>,
    pub tx_bps: Option<f64>,
    pub rx_bps: Option<f64>,
    pub online_seconds: Option<u64>,
    pub sleep: Option<bool>,
    pub first_seen: i64,
    pub last_seen: i64,
    pub last_observed: i64,
    pub status: Status,
    #[serde(default)]
    pub last_known_status: Status,
    pub favorite: bool,
    pub hidden: bool,
    pub locally_administered: bool,
}
impl Device {
    pub fn new(mac: &str, router: &str, timestamp: i64) -> Self {
        Self {
            id: format!("{router}/{mac}"),
            router_id: router.into(),
            mac_address: mac.into(),
            hostname: None,
            custom_name: None,
            device_type: "unknown".into(),
            icon: "auto".into(),
            ipv4_addresses: vec![],
            ipv6_addresses: vec![],
            addresses_observed_at: None,
            connection_type: "unknown".into(),
            wifi_client: false,
            wifi_band: None,
            wifi_standard: None,
            ssid: None,
            link_rate: None,
            rssi_raw: None,
            tx_bytes: None,
            rx_bytes: None,
            tx_bps: None,
            rx_bps: None,
            online_seconds: None,
            sleep: None,
            first_seen: timestamp,
            last_seen: timestamp,
            last_observed: timestamp,
            status: Status::Unknown,
            last_known_status: Status::Unknown,
            favorite: false,
            hidden: false,
            locally_administered: u8::from_str_radix(&mac[..2], 16).is_ok_and(|b| b & 2 != 0),
        }
    }
    pub fn display_name(&self) -> &str {
        self.custom_name
            .as_deref()
            .or(self.hostname.as_deref())
            .unwrap_or(&self.mac_address)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterInfo {
    pub id: String,
    pub name: String,
    pub address: String,
    pub adapter: String,
    pub manufacturer: String,
    pub model: String,
    pub hardware_revision: String,
    pub firmware: Option<String>,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub mode: String,
    pub connection: String,
    pub router: Option<RouterInfo>,
    pub devices: Vec<Device>,
    pub updated_at: Option<i64>,
    pub error: Option<String>,
    pub next_retry_seconds: Option<u64>,
}
impl Default for Snapshot {
    fn default() -> Self {
        Self {
            mode: "live".into(),
            connection: "disconnected".into(),
            router: None,
            devices: vec![],
            updated_at: None,
            error: None,
            next_retry_seconds: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub poll_seconds: u64,
    pub offline_seconds: u64,
    pub retention_days: u32,
    pub close_to_tray: bool,
    pub notifications: bool,
    pub favorite_notifications_only: bool,
    pub notify_discovery: bool,
    pub notify_offline: bool,
    pub notify_router: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            poll_seconds: 5,
            offline_seconds: 90,
            retention_days: 7,
            close_to_tray: true,
            notifications: false,
            favorite_notifications_only: false,
            notify_discovery: true,
            notify_offline: true,
            notify_router: true,
        }
    }
}
impl Settings {
    pub fn validate(&self) -> crate::error::Result<()> {
        if !(5..=300).contains(&self.poll_seconds)
            || !(30..=3600).contains(&self.offline_seconds)
            || self.offline_seconds < self.poll_seconds * 2
            || !(1..=30).contains(&self.retention_days)
        {
            return Err(crate::error::Error::Settings);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkEvent {
    pub id: String,
    pub router_id: String,
    pub device_id: Option<String>,
    pub event_type: String,
    pub message: String,
    pub created_at: i64,
}
impl NetworkEvent {
    pub fn new(router: &str, device: Option<&str>, kind: &str, message: String, ts: i64) -> Self {
        Self {
            id: format!("{ts}/{kind}/{}", device.unwrap_or(router)),
            router_id: router.into(),
            device_id: device.map(String::from),
            event_type: kind.into(),
            message,
            created_at: ts,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    pub timestamp: i64,
    pub tx_bps: Option<f64>,
    pub rx_bps: Option<f64>,
    pub link_rate: Option<f64>,
    pub rssi_raw: Option<f64>,
    pub connected_devices: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkContext {
    pub mode: String,
    pub router_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePatch {
    pub id: String,
    pub custom_name: Option<String>,
    pub device_type: String,
    pub icon: String,
    pub favorite: bool,
    pub hidden: bool,
}
