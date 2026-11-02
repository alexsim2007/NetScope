use crate::models::{Device, NetworkEvent, Status};
use std::collections::BTreeMap;

pub fn rate(previous: Option<u64>, current: Option<u64>, elapsed_ms: i64) -> Option<f64> {
    if elapsed_ms <= 0 || elapsed_ms > 300_000 {
        return None;
    }
    let delta = current?.checked_sub(previous?)?;
    Some(delta as f64 * 8000.0 / elapsed_ms as f64)
}

pub fn reconcile(
    previous: &[Device],
    observations: Vec<Device>,
    router: &str,
    ts: i64,
    offline_ms: i64,
) -> (Vec<Device>, Vec<NetworkEvent>) {
    let mut devices: BTreeMap<String, Device> = previous
        .iter()
        .cloned()
        .map(|d| (d.id.clone(), d))
        .collect();
    let mut events = vec![];
    let mut observed = std::collections::HashSet::new();
    for mut d in observations {
        observed.insert(d.id.clone());
        if let Some(old) = devices.get(&d.id) {
            let last_known = if old.status == Status::Unknown {
                old.last_known_status
            } else {
                old.status
            };
            d.last_known_status = last_known;
            d.first_seen = old.first_seen;
            d.custom_name.clone_from(&old.custom_name);
            d.favorite = old.favorite;
            d.hidden = old.hidden;
            d.icon.clone_from(&old.icon);
            // A manually assigned type remains authoritative.
            if old.device_type != "unknown" {
                d.device_type.clone_from(&old.device_type);
            }
            if d.hostname.is_none() {
                d.hostname.clone_from(&old.hostname);
            }
            if d.ipv4_addresses.is_empty() && d.ipv6_addresses.is_empty() {
                d.ipv4_addresses.clone_from(&old.ipv4_addresses);
                d.ipv6_addresses.clone_from(&old.ipv6_addresses);
                d.addresses_observed_at = old.addresses_observed_at;
            }
            if d.status != Status::Online {
                d.last_seen = old.last_seen;
            }
            let continuous = old.status == Status::Online
                && d.status == Status::Online
                && old.wifi_band == d.wifi_band
                && old.ssid == d.ssid
                && old.connection_type == d.connection_type
                && match (old.online_seconds, d.online_seconds) {
                    (Some(a), Some(b)) => b >= a,
                    _ => true,
                };
            if continuous {
                d.tx_bps = rate(old.tx_bytes, d.tx_bytes, ts - old.last_observed);
                d.rx_bps = rate(old.rx_bytes, d.rx_bytes, ts - old.last_observed);
            }
            if last_known == Status::Offline && d.status == Status::Online {
                events.push(NetworkEvent::new(
                    router,
                    Some(&d.id),
                    "device_online",
                    format!("{} — в сети", d.display_name()),
                    ts,
                ));
            }
        } else {
            events.push(NetworkEvent::new(
                router,
                Some(&d.id),
                "device_discovered",
                format!("Обнаружено: {}", d.display_name()),
                ts,
            ));
        }
        if d.status != Status::Unknown {
            d.last_known_status = d.status;
        }
        devices.insert(d.id.clone(), d);
    }
    for d in devices.values_mut() {
        if !observed.contains(&d.id) {
            let old = if d.status == Status::Unknown {
                d.last_known_status
            } else {
                d.status
            };
            d.status = if ts - d.last_observed >= offline_ms {
                Status::Offline
            } else {
                Status::Stale
            };
            d.tx_bps = None;
            d.rx_bps = None;
            d.link_rate = None;
            d.rssi_raw = None;
            d.last_known_status = d.status;
            if d.status == Status::Offline && old != Status::Offline {
                events.push(NetworkEvent::new(
                    router,
                    Some(&d.id),
                    "device_offline",
                    format!("{} больше не наблюдается", d.display_name()),
                    ts,
                ));
            }
        }
    }
    (devices.into_values().collect(), events)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn keeps_dated_addresses_when_wifi_observation_has_no_neighbor_entry() {
        let mut old = device(1000);
        old.ipv4_addresses = vec!["192.168.50.21".into()];
        old.addresses_observed_at = Some(1000);
        let current = device(6000);
        let (devices, _) = reconcile(&[old], vec![current], "test", 6000, 30_000);
        assert_eq!(devices[0].ipv4_addresses, vec!["192.168.50.21"]);
        assert_eq!(devices[0].addresses_observed_at, Some(1000));
        assert_eq!(devices[0].last_observed, 6000);
    }
    #[test]
    fn recovering_router_does_not_repeat_old_offline_or_online_events() {
        let mut off = device(1000);
        off.status = Status::Unknown;
        off.last_known_status = Status::Offline;
        let mut online = device(1000);
        online.id = "test/02:00:00:00:00:02".into();
        online.status = Status::Unknown;
        online.last_known_status = Status::Online;
        let mut observation = online.clone();
        observation.status = Status::Online;
        let (devices, events) =
            reconcile(&[off, online], vec![observation], "test", 100_000, 30_000);
        assert!(events.is_empty());
        assert_eq!(
            devices
                .iter()
                .filter(|d| d.status == Status::Offline)
                .count(),
            1
        );
    }
    fn device(ts: i64) -> Device {
        let mut d = Device::new("02:00:00:00:00:01", "test", ts);
        d.status = Status::Online;
        d
    }
    #[test]
    fn rates_handle_resets_time_and_missing_values() {
        assert_eq!(rate(Some(100), Some(200), 1000), Some(800.0));
        for (a, b, t) in [
            (Some(200), Some(100), 1000),
            (None, Some(100), 1000),
            (Some(0), Some(100), 0),
            (Some(0), Some(100), 400_000),
        ] {
            assert_eq!(rate(a, b, t), None);
        }
    }
    #[test]
    fn absence_requires_timeout_and_emits_once() {
        let old = vec![device(1000)];
        let (stale, e) = reconcile(&old, vec![], "test", 6000, 30_000);
        assert_eq!(stale[0].status, Status::Stale);
        assert!(e.is_empty());
        let (off, e) = reconcile(&stale, vec![], "test", 32_000, 30_000);
        assert_eq!(off[0].status, Status::Offline);
        assert_eq!(e[0].event_type, "device_offline");
        assert!(reconcile(&off, vec![], "test", 40_000, 30_000).1.is_empty());
    }
    #[test]
    fn preserves_user_data_and_invalidates_rates_on_reassociation() {
        let mut old = device(1000);
        old.custom_name = Some("My laptop".into());
        old.favorite = true;
        old.tx_bytes = Some(1);
        old.online_seconds = Some(100);
        let mut new = device(6000);
        new.tx_bytes = Some(100);
        new.online_seconds = Some(1);
        let (d, _) = reconcile(&[old], vec![new], "test", 6000, 30_000);
        assert_eq!(d[0].custom_name.as_deref(), Some("My laptop"));
        assert!(d[0].favorite);
        assert_eq!(d[0].tx_bps, None);
    }
}
