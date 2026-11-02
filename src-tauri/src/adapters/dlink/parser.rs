use crate::{
    error::{Error, Result},
    models::{Device, Status},
};
use serde_json::Value;
use std::{collections::BTreeMap, net::IpAddr};

pub fn normalize_mac(input: &str) -> Option<String> {
    let hex: String = input
        .chars()
        .filter(|c| !matches!(c, ':' | '-' | '.'))
        .collect();
    if hex.len() != 12 || !hex.is_ascii() || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let bytes: Vec<u8> = (0..12)
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap_or(0))
        .collect();
    if bytes[0] & 1 != 0 || bytes.iter().all(|b| *b == 0) {
        return None;
    }
    Some(
        bytes
            .iter()
            .map(|b| format!("{b:02X}"))
            .collect::<Vec<_>>()
            .join(":"),
    )
}
fn string(v: &Value, key: &str) -> Option<String> {
    v.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().take(200).collect())
}
fn number(v: &Value, key: &str) -> Option<f64> {
    v.get(key)
        .and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok()))
        .filter(|n| n.is_finite())
}
fn counter(v: &Value, key: &str) -> Option<u64> {
    v.get(key)
        .and_then(|v| v.as_u64().or_else(|| v.as_str()?.parse().ok()))
}
pub fn parse(value: &Value, router: &str, ts: i64) -> Result<Vec<Device>> {
    let result = value.get("result").ok_or(Error::Format)?;
    let neighbors = result
        .get("187")
        .and_then(Value::as_array)
        .ok_or(Error::Format)?;
    let wifi = result
        .get("64")
        .and_then(Value::as_array)
        .ok_or(Error::Format)?;
    let mut devices: BTreeMap<String, Device> = BTreeMap::new();
    for row in neighbors {
        let Some(mac) = string(row, "mac").and_then(|m| normalize_mac(&m)) else {
            continue;
        };
        let d = devices
            .entry(mac.clone())
            .or_insert_with(|| Device::new(&mac, router, ts));
        if let Some(host) = string(row, "hostname") {
            d.hostname = Some(host);
        }
        if let Some(ip) = string(row, "ip").and_then(|s| s.parse::<IpAddr>().ok()) {
            let addresses = if ip.is_ipv4() {
                &mut d.ipv4_addresses
            } else {
                &mut d.ipv6_addresses
            };
            let address = ip.to_string();
            if !addresses.contains(&address) {
                addresses.push(address);
            }
        }
        let flags = string(row, "flags").unwrap_or_default().to_lowercase();
        let flags: Vec<&str> = flags.split(|c: char| !c.is_ascii_alphanumeric()).collect();
        let status = if flags.contains(&"reachable") || flags.contains(&"permanent") {
            Status::Online
        } else if flags.contains(&"stale") || flags.contains(&"delay") || flags.contains(&"probe") {
            Status::Stale
        } else {
            Status::Unknown
        };
        if d.status != Status::Online {
            d.status = status;
        }
        if string(row, "name").is_some_and(|s| s.to_uppercase().contains("WLAN")) {
            d.connection_type = "wifi".into();
        }
        // br0 is a bridge, not evidence of a physical Ethernet cable.
    }
    for row in wifi {
        let Some(mac) = string(row, "mac").and_then(|m| normalize_mac(&m)) else {
            continue;
        };
        let d = devices
            .entry(mac.clone())
            .or_insert_with(|| Device::new(&mac, router, ts));
        if let Some(host) = string(row, "hostname") {
            d.hostname = Some(host);
        }
        d.status = Status::Online;
        d.connection_type = "wifi".into();
        d.wifi_client = true;
        d.wifi_band = string(row, "band");
        d.wifi_standard = string(row, "mode");
        d.ssid = string(row, "SSID");
        d.link_rate = number(row, "lastTxRate").filter(|n| *n >= 0.0);
        d.rssi_raw = number(row, "rssi");
        d.tx_bytes = counter(row, "tx_bytes");
        d.rx_bytes = counter(row, "rx_bytes");
        d.online_seconds = counter(row, "online");
        d.sleep = row.get("sleep").and_then(|v| {
            v.as_bool().or_else(|| match v.as_str()? {
                "1" | "true" => Some(true),
                "0" | "false" => Some(false),
                _ => None,
            })
        });
    }
    Ok(devices.into_values().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unreachable_is_not_reachable_and_wlan_neighbor_is_not_wifi_membership() {
        let v = serde_json::json!({"result":{"187":[{"mac":"02:00:00:00:00:01","flags":"unreachable","name":"WLAN"}],"64":[]}});
        let devices = parse(&v, "test", 1000).unwrap();
        assert_eq!(devices[0].status, Status::Unknown);
        assert!(!devices[0].wifi_client);
    }
    #[test]
    fn merges_addresses_and_wifi_by_normalized_mac() {
        let v: Value =
            serde_json::from_str(include_str!("../../../../tests/fixtures/devinfo.json")).unwrap();
        let d = parse(&v, "test", 1000).unwrap();
        assert_eq!(d.len(), 2);
        let mac = &d[0];
        assert_eq!(mac.ipv4_addresses.len(), 1);
        assert_eq!(mac.ipv6_addresses.len(), 1);
        assert_eq!(mac.rssi_raw, Some(78.0));
        assert_eq!(mac.link_rate, Some(702.0));
        assert_eq!(mac.status, Status::Online);
        assert!(mac.locally_administered);
        assert_eq!(d[1].status, Status::Stale);
        assert_eq!(d[1].tx_bytes, None);
    }
    #[test]
    fn empty_is_valid_but_missing_category_is_not() {
        assert!(
            parse(&serde_json::json!({"result":{"187":[],"64":[]}}), "x", 0)
                .unwrap()
                .is_empty()
        );
        assert!(parse(&serde_json::json!({"result":{"187":[]}}), "x", 0).is_err());
    }
    #[test]
    fn mac_validation() {
        assert_eq!(
            normalize_mac("02-00-00-00-00-ab").as_deref(),
            Some("02:00:00:00:00:AB")
        );
        for m in ["x", "FF:FF:FF:FF:FF:FF", "00:00:00:00:00:00", "éééééé"] {
            assert!(normalize_mac(m).is_none());
        }
    }
}
