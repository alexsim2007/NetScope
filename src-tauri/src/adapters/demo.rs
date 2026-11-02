use crate::{
    adapters::RouterAdapter,
    error::Result,
    models::{now, Device, RouterInfo, Status},
};

#[derive(Default)]
pub struct DemoAdapter {
    tick: u64,
    tx: [u64; 8],
    rx: [u64; 8],
}
#[async_trait::async_trait]
impl RouterAdapter for DemoAdapter {
    fn info(&self) -> RouterInfo {
        RouterInfo {
            id: "demo".into(),
            name: "Демонстрационная сеть".into(),
            address: "192.168.50.1 (демо)".into(),
            adapter: "demo".into(),
            manufacturer: "D-Link".into(),
            model: "DIR-815S".into(),
            hardware_revision: "S1 · демо".into(),
            firmware: None,
            capabilities: [
                "device_discovery",
                "wifi_clients",
                "network_neighbors",
                "traffic_counters",
            ]
            .map(String::from)
            .to_vec(),
        }
    }
    async fn poll(&mut self) -> Result<Vec<Device>> {
        self.tick += 1;
        let ts = now();
        for i in 0..8 {
            let wave = 1.0 + 0.65 * (self.tick as f64 / 5.0 + i as f64 / 2.0).sin();
            self.tx[i] += (210_000.0 * (i + 1) as f64 * wave) as u64;
            self.rx[i] += (68_000.0 * (i + 1) as f64 * (2.0 - wave / 2.0)) as u64;
        }
        let names = [
            ("Studio MacBook", "laptop", "5 GHz", 866.0),
            ("Personal iPhone", "smartphone", "5 GHz", 433.0),
            ("Living room TV", "tv", "5 GHz", 390.0),
            ("Workstation", "desktop", "5 GHz", 702.0),
            ("HomePod mini", "smart_home", "2.4 GHz", 144.0),
            ("iPad Air", "tablet", "5 GHz", 650.0),
            ("Reading lamp", "smart_home", "2.4 GHz", 72.0),
            ("Home server", "server", "", 0.0),
        ];
        Ok(names
            .iter()
            .enumerate()
            .filter(|(i, _)| !(*i == 6 && (self.tick / 24) % 2 == 1))
            .map(|(i, (name, kind, band, rate))| {
                let mac = format!("02:00:00:00:00:{:02X}", i + 1);
                let mut d = Device::new(&mac, "demo", ts);
                d.hostname = Some((*name).into());
                d.device_type = (*kind).into();
                d.ipv4_addresses = vec![format!("192.168.50.{}", 21 + i)];
                d.status = Status::Online;
                d.connection_type = if band.is_empty() { "unknown" } else { "wifi" }.into();
                if !band.is_empty() {
                    d.wifi_client = true;
                    d.wifi_band = Some((*band).into());
                    d.ssid = Some("Studio".into());
                    d.wifi_standard = Some("11ac".into());
                    d.link_rate = Some(*rate);
                    d.rssi_raw = Some(56.0 + ((self.tick + i as u64) % 22) as f64);
                    d.tx_bytes = Some(self.tx[i] + 1_000_000);
                    d.rx_bytes = Some(self.rx[i] + 500_000);
                    d.online_seconds = Some(3600 + self.tick * 5);
                    d.sleep = Some(false);
                }
                d
            })
            .collect())
    }
}
