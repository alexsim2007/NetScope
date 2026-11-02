use crate::{
    error::{Error, Result},
    models::{Device, Metric, NetworkEvent, RouterInfo, Settings, Status},
};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    Row, SqlitePool,
};
use std::{path::Path, str::FromStr, time::Duration};

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}
impl Database {
    pub async fn open(path: &Path) -> Result<Self> {
        let options = SqliteConnectOptions::from_str("sqlite:")
            .map_err(|_| Error::Database)?
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(3)
            .connect_with(options)
            .await?;
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|_| Error::Database)?;
        Ok(Self { pool })
    }
    pub async fn settings(&self) -> Result<Settings> {
        let raw: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key='app'")
            .fetch_optional(&self.pool)
            .await?;
        match raw {
            None => Ok(Settings::default()),
            Some(s) => {
                let settings: Settings = serde_json::from_str(&s).map_err(|_| Error::Database)?;
                settings.validate()?;
                Ok(settings)
            }
        }
    }
    pub async fn save_settings(&self, s: &Settings) -> Result<()> {
        s.validate()?;
        sqlx::query("INSERT INTO settings(key,value) VALUES('app',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(serde_json::to_string(s)?).execute(&self.pool).await?;
        Ok(())
    }
    pub async fn last_router(&self) -> Result<Option<RouterInfo>> {
        let raw: Option<String> = sqlx::query_scalar(
            "SELECT data_json FROM routers ORDER BY last_connected_at DESC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await?;
        raw.map(|s| serde_json::from_str(&s).map_err(|_| Error::Database))
            .transpose()
    }
    pub async fn devices(&self, router: &str) -> Result<Vec<Device>> {
        let rows: Vec<String> = sqlx::query_scalar(
            "SELECT data_json FROM devices WHERE router_id=? ORDER BY first_seen",
        )
        .bind(router)
        .fetch_all(&self.pool)
        .await?;
        rows.iter()
            .map(|s| serde_json::from_str(s).map_err(|_| Error::Database))
            .collect()
    }
    pub async fn save_device(&self, d: &Device) -> Result<()> {
        sqlx::query("UPDATE devices SET custom_name=?, device_type=?, favorite=?, hidden=?, data_json=? WHERE id=?")
            .bind(&d.custom_name).bind(&d.device_type).bind(d.favorite).bind(d.hidden)
            .bind(serde_json::to_string(d)?).bind(&d.id).execute(&self.pool).await?;
        Ok(())
    }
    pub async fn persist(
        &self,
        router: &RouterInfo,
        devices: &[Device],
        events: &[NetworkEvent],
        ts: i64,
        measure: bool,
    ) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO routers(id,name,address,manufacturer,model,hardware_revision,adapter_type,last_connected_at,data_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_connected_at=excluded.last_connected_at,data_json=excluded.data_json")
            .bind(&router.id).bind(&router.name).bind(&router.address).bind(&router.manufacturer).bind(&router.model)
            .bind(&router.hardware_revision).bind(&router.adapter).bind(ts).bind(serde_json::to_string(router)?)
            .execute(&mut *tx).await?;
        for d in devices {
            sqlx::query("INSERT INTO devices(id,router_id,mac_address,hostname,custom_name,device_type,first_seen,last_seen,current_status,favorite,hidden,data_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET hostname=excluded.hostname,custom_name=excluded.custom_name,device_type=excluded.device_type,last_seen=excluded.last_seen,current_status=excluded.current_status,favorite=excluded.favorite,hidden=excluded.hidden,data_json=excluded.data_json")
                .bind(&d.id).bind(&d.router_id).bind(&d.mac_address).bind(&d.hostname).bind(&d.custom_name)
                .bind(&d.device_type).bind(d.first_seen).bind(d.last_seen).bind(format!("{:?}",d.status).to_lowercase())
                .bind(d.favorite).bind(d.hidden).bind(serde_json::to_string(d)?).execute(&mut *tx).await?;
            if measure && d.last_observed == ts {
                if d.addresses_observed_at == Some(ts) {
                    for (version, addresses) in [(4, &d.ipv4_addresses), (6, &d.ipv6_addresses)] {
                        for address in addresses {
                            sqlx::query("INSERT INTO device_addresses(device_id,ip_address,ip_version,last_seen) VALUES(?,?,?,?) ON CONFLICT(device_id,ip_address) DO UPDATE SET last_seen=excluded.last_seen")
                            .bind(&d.id).bind(address).bind(version).bind(ts).execute(&mut *tx).await?;
                        }
                    }
                }
                sqlx::query("INSERT OR REPLACE INTO device_metrics(device_id,timestamp,link_rate,rssi_raw,tx_bytes,rx_bytes,tx_bps,rx_bps) VALUES(?,?,?,?,?,?,?,?)")
                    .bind(&d.id).bind(ts).bind(d.link_rate).bind(d.rssi_raw)
                    .bind(d.tx_bytes.and_then(|n| i64::try_from(n).ok())).bind(d.rx_bytes.and_then(|n| i64::try_from(n).ok()))
                    .bind(d.tx_bps).bind(d.rx_bps).execute(&mut *tx).await?;
            }
        }
        for e in events {
            sqlx::query("INSERT OR IGNORE INTO network_events(id,router_id,device_id,event_type,message,created_at) VALUES(?,?,?,?,?,?)")
                .bind(&e.id).bind(&e.router_id).bind(&e.device_id).bind(&e.event_type).bind(&e.message).bind(e.created_at)
                .execute(&mut *tx).await?;
        }
        if measure {
            sqlx::query("INSERT OR REPLACE INTO network_samples(router_id,timestamp,connected_devices) VALUES(?,?,?)")
                .bind(&router.id).bind(ts).bind(devices.iter().filter(|d| d.status == Status::Online).count() as i64).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }
    pub async fn events(&self, router: &str, device: Option<&str>) -> Result<Vec<NetworkEvent>> {
        let rows = sqlx::query("SELECT * FROM network_events WHERE router_id=? AND (? IS NULL OR device_id=?) ORDER BY created_at DESC LIMIT 1000")
            .bind(router).bind(device).bind(device).fetch_all(&self.pool).await?;
        Ok(rows
            .iter()
            .map(|r| NetworkEvent {
                id: r.get("id"),
                router_id: r.get("router_id"),
                device_id: r.get("device_id"),
                event_type: r.get("event_type"),
                message: r.get("message"),
                created_at: r.get("created_at"),
            })
            .collect())
    }
    pub async fn metrics(
        &self,
        router: &str,
        device: Option<&str>,
        since: i64,
        until: i64,
    ) -> Result<Vec<Metric>> {
        let bucket = ((until - since) / 480).max(1000);
        let rows = sqlx::query_as::<_, Metric>(r#"
          WITH source AS (
            SELECT m.timestamp,m.tx_bps,m.rx_bps,m.link_rate,m.rssi_raw FROM device_metrics m JOIN devices d ON d.id=m.device_id
              WHERE d.router_id=?1 AND (?2 IS NULL OR d.id=?2) AND m.timestamp BETWEEN ?3 AND ?4
            UNION ALL
            SELECT m.timestamp,m.tx_bps,m.rx_bps,m.link_rate,m.rssi_raw FROM metric_rollups m JOIN devices d ON d.id=m.device_id
              WHERE d.router_id=?1 AND (?2 IS NULL OR d.id=?2) AND m.timestamp BETWEEN ?3 AND ?4
          ), by_time AS (
            SELECT timestamp,SUM(tx_bps) tx_bps,SUM(rx_bps) rx_bps,AVG(link_rate) link_rate,AVG(rssi_raw) rssi_raw FROM source GROUP BY timestamp
          ), metrics AS (
            SELECT (timestamp/?5)*?5 timestamp,AVG(tx_bps) tx_bps,AVG(rx_bps) rx_bps,AVG(link_rate) link_rate,AVG(rssi_raw) rssi_raw FROM by_time GROUP BY timestamp/?5
          ), counts_source AS (
            SELECT timestamp,connected_devices FROM network_samples WHERE router_id=?1 AND timestamp BETWEEN ?3 AND ?4
            UNION ALL SELECT timestamp,connected_devices FROM network_rollups WHERE router_id=?1 AND timestamp BETWEEN ?3 AND ?4
          ), counts AS (
            SELECT (timestamp/?5)*?5 timestamp,AVG(connected_devices) connected_devices FROM counts_source GROUP BY timestamp/?5
          ), gaps AS (
            SELECT (created_at/?5)*?5 timestamp FROM network_events WHERE router_id=?1 AND created_at BETWEEN ?3 AND ?4
              AND (event_type IN ('router_disconnected','monitoring_paused') OR (event_type='device_offline' AND ?2 IS NOT NULL AND device_id=?2))
            GROUP BY created_at/?5
          ), times AS (SELECT timestamp FROM metrics UNION SELECT timestamp FROM counts WHERE ?2 IS NULL UNION SELECT timestamp FROM gaps)
          SELECT t.timestamp,
            CASE WHEN g.timestamp IS NULL THEN m.tx_bps ELSE NULL END tx_bps,
            CASE WHEN g.timestamp IS NULL THEN m.rx_bps ELSE NULL END rx_bps,
            CASE WHEN g.timestamp IS NULL THEN m.link_rate ELSE NULL END link_rate,
            CASE WHEN g.timestamp IS NULL THEN m.rssi_raw ELSE NULL END rssi_raw,
            CASE WHEN ?2 IS NULL AND g.timestamp IS NULL THEN c.connected_devices ELSE NULL END connected_devices
          FROM times t LEFT JOIN metrics m ON m.timestamp=t.timestamp LEFT JOIN counts c ON c.timestamp=t.timestamp LEFT JOIN gaps g ON g.timestamp=t.timestamp ORDER BY t.timestamp
        "#).bind(router).bind(device).bind(since).bind(until).bind(bucket).fetch_all(&self.pool).await?;
        Ok(rows)
    }
    /// Compact raw observations after 24h and bound history by retention and row count.
    pub async fn maintain(&self, ts: i64, retention_days: u32) -> Result<()> {
        let raw_cutoff = ((ts - 86_400_000) / 300_000) * 300_000;
        let cutoff = ts - i64::from(retention_days) * 86_400_000;
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT OR REPLACE INTO metric_rollups SELECT device_id,(timestamp/300000)*300000,AVG(tx_bps),AVG(rx_bps),AVG(link_rate),AVG(rssi_raw) FROM device_metrics WHERE timestamp<? GROUP BY device_id,timestamp/300000")
            .bind(raw_cutoff).execute(&mut *tx).await?;
        sqlx::query("INSERT OR REPLACE INTO network_rollups SELECT router_id,(timestamp/300000)*300000,AVG(connected_devices) FROM network_samples WHERE timestamp<? GROUP BY router_id,timestamp/300000")
            .bind(raw_cutoff).execute(&mut *tx).await?;
        for table in ["device_metrics", "network_samples"] {
            sqlx::query(&format!("DELETE FROM {table} WHERE timestamp<?"))
                .bind(raw_cutoff.max(cutoff))
                .execute(&mut *tx)
                .await?;
        }
        for table in ["metric_rollups", "network_rollups"] {
            sqlx::query(&format!("DELETE FROM {table} WHERE timestamp<?"))
                .bind(cutoff)
                .execute(&mut *tx)
                .await?;
        }
        sqlx::query("DELETE FROM network_events WHERE created_at<?")
            .bind(cutoff)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM device_addresses WHERE last_seen<?")
            .bind(cutoff)
            .execute(&mut *tx)
            .await?;
        // Bounds also apply if a pathological router reports thousands of unique clients.
        for table in [
            "device_metrics",
            "metric_rollups",
            "network_samples",
            "network_rollups",
        ] {
            sqlx::query(&format!("DELETE FROM {table} WHERE rowid IN (SELECT rowid FROM {table} ORDER BY timestamp DESC LIMIT -1 OFFSET 500000)"))
                .execute(&mut *tx).await?;
        }
        sqlx::query("DELETE FROM network_events WHERE id IN (SELECT id FROM network_events ORDER BY created_at DESC LIMIT -1 OFFSET 50000)").execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn close(&self) {
        self.pool.close().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn router_outages_create_null_history_gaps_for_every_metric() {
        use crate::adapters::{demo::DemoAdapter, RouterAdapter};
        let temp = tempfile::tempdir().unwrap();
        let db = Database::open(&temp.path().join("test.sqlite"))
            .await
            .unwrap();
        let mut demo = DemoAdapter::default();
        let router = demo.info();
        let mut d = demo.poll().await.unwrap();
        for item in &mut d {
            item.last_observed = 10_000;
        }
        db.persist(&router, &d, &[], 10_000, true).await.unwrap();
        let outage = NetworkEvent::new(
            "demo",
            None,
            "router_disconnected",
            "Connection interrupted".into(),
            20_000,
        );
        db.persist(&router, &d, &[outage], 20_000, false)
            .await
            .unwrap();
        for item in &mut d {
            item.last_observed = 30_000;
        }
        db.persist(&router, &d, &[], 30_000, true).await.unwrap();
        for device in [None, Some(d[0].id.as_str())] {
            let points = db.metrics("demo", device, 0, 40_000).await.unwrap();
            assert_eq!(points.len(), 3);
            assert!(
                points[1].tx_bps.is_none()
                    && points[1].rssi_raw.is_none()
                    && points[1].link_rate.is_none()
                    && points[1].connected_devices.is_none()
            );
            assert!(points[0].link_rate.is_some() && points[2].link_rate.is_some());
        }
    }
    #[tokio::test]
    async fn compaction_waits_for_complete_buckets_and_preserves_previous_rollups() {
        use crate::adapters::{demo::DemoAdapter, RouterAdapter};
        let temp = tempfile::tempdir().unwrap();
        let db = Database::open(&temp.path().join("test.sqlite"))
            .await
            .unwrap();
        let mut demo = DemoAdapter::default();
        let router = demo.info();
        let mut device = demo.poll().await.unwrap().remove(0);
        let base = 900_000;
        for (ts, value) in [(base + 10_000, 100.0), (base + 200_000, 200.0)] {
            device.last_observed = ts;
            device.link_rate = Some(value);
            db.persist(&router, &[device.clone()], &[], ts, true)
                .await
                .unwrap();
        }
        db.maintain(base + 86_400_000 + 100_000, 7).await.unwrap();
        assert_eq!(
            db.metrics("demo", Some(&device.id), base, base + 300_000)
                .await
                .unwrap()
                .len(),
            2
        );
        db.maintain(base + 86_400_000 + 400_000, 7).await.unwrap();
        let points = db
            .metrics("demo", Some(&device.id), base, base + 300_000)
            .await
            .unwrap();
        assert_eq!(points.len(), 1);
        assert_eq!(points[0].link_rate, Some(150.0));
        db.maintain(base + 90_000_000, 7).await.unwrap();
        assert_eq!(
            db.metrics("demo", Some(&device.id), base, base + 300_000)
                .await
                .unwrap()[0]
                .link_rate,
            Some(150.0)
        );
    }
    #[tokio::test]
    async fn persists_registry_metrics_events_and_settings_across_restart() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.sqlite");
        let db = Database::open(&path).await.unwrap();
        let ts = 1_000_000;
        let mut demo = crate::adapters::demo::DemoAdapter::default();
        use crate::adapters::RouterAdapter;
        let router = demo.info();
        let mut d = demo.poll().await.unwrap();
        for item in &mut d {
            item.last_observed = ts;
        }
        let e = NetworkEvent::new("demo", None, "router_connected", "Connected".into(), ts);
        db.persist(&router, &d, &[e], ts, true).await.unwrap();
        let settings = Settings {
            poll_seconds: 10,
            ..Default::default()
        };
        db.save_settings(&settings).await.unwrap();
        db.close().await;
        let db = Database::open(&path).await.unwrap();
        assert_eq!(db.devices("demo").await.unwrap().len(), 8);
        assert_eq!(db.settings().await.unwrap().poll_seconds, 10);
        assert_eq!(db.events("demo", None).await.unwrap().len(), 1);
        assert_eq!(
            db.metrics("demo", None, 0, 2_000_000).await.unwrap().len(),
            1
        );
        assert_eq!(
            db.metrics("demo", None, 0, 2_000_000).await.unwrap()[0].connected_devices,
            Some(8.0)
        );
        assert!(db.events("other", None).await.unwrap().is_empty());
        db.maintain(ts + 100_000_000, 7).await.unwrap();
        assert_eq!(
            db.metrics("demo", None, 0, ts + 100_000_000)
                .await
                .unwrap()
                .len(),
            1
        );
        db.maintain(ts + 800_000_000, 7).await.unwrap();
        assert!(db
            .metrics("demo", None, 0, ts + 800_000_000)
            .await
            .unwrap()
            .is_empty());
    }
}
