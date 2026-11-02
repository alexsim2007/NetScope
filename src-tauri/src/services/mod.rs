pub mod registry;
use crate::{
    adapters::{demo::DemoAdapter, dlink::DLinkAdapter, RouterAdapter},
    database::Database,
    error::{Error, Result},
    models::*,
};
use std::{
    collections::BTreeMap,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, OnceLock,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::{Mutex, Notify, RwLock};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
struct Runtime {
    adapter: Option<Box<dyn RouterAdapter>>,
    demo: bool,
    paused: bool,
    failures: u32,
    terminal: bool,
    maintenance_at: i64,
}

pub struct Engine {
    live: Database,
    demo: Database,
    runtime: Mutex<Runtime>,
    snapshot: RwLock<Snapshot>,
    settings: RwLock<Settings>,
    pub close_to_tray: AtomicBool,
    pub exit_ready: AtomicBool,
    wake: Notify,
    stop: CancellationToken,
    app: OnceLock<AppHandle>,
    notification_times: std::sync::Mutex<BTreeMap<String, i64>>,
}
impl Engine {
    pub async fn new(dir: &Path) -> Result<Arc<Self>> {
        let live = Database::open(&dir.join("netscope.sqlite")).await?;
        let demo = Database::open(&dir.join("demo.sqlite")).await?;
        let mut snapshot = Snapshot::default();
        let settings = match live.settings().await {
            Ok(s) => s,
            Err(_) => {
                snapshot.error = Some("Не удалось прочитать настройки. Используются значения по умолчанию; сохраните настройки заново.".into());
                Settings::default()
            }
        };
        if let Some(router) = live.last_router().await? {
            snapshot.devices = live.devices(&router.id).await?;
            Self::unknown(&mut snapshot.devices);
            snapshot.router = Some(router);
        }
        Ok(Arc::new(Self {
            live,
            demo,
            runtime: Mutex::new(Runtime::default()),
            snapshot: RwLock::new(snapshot),
            close_to_tray: AtomicBool::new(settings.close_to_tray),
            exit_ready: AtomicBool::new(false),
            settings: RwLock::new(settings),
            wake: Notify::new(),
            stop: CancellationToken::new(),
            app: OnceLock::new(),
            notification_times: std::sync::Mutex::new(BTreeMap::new()),
        }))
    }
    pub fn attach(self: &Arc<Self>, app: AppHandle) {
        let _ = self.app.set(app);
        let engine = self.clone();
        tauri::async_runtime::spawn(async move {
            engine.monitor().await;
        });
    }
    fn db(&self, demo: bool) -> &Database {
        if demo {
            &self.demo
        } else {
            &self.live
        }
    }
    fn unknown(devices: &mut [Device]) {
        for d in devices {
            if d.status != Status::Unknown {
                d.last_known_status = d.status;
            }
            d.status = Status::Unknown;
            d.tx_bps = None;
            d.rx_bps = None;
            d.link_rate = None;
            d.rssi_raw = None;
        }
    }
    fn emit(&self, snapshot: &Snapshot) {
        if let Some(app) = self.app.get() {
            let _ = app.emit("netscope://snapshot", snapshot);
            if let Some(tray) = app.tray_by_id("network") {
                let count = snapshot
                    .devices
                    .iter()
                    .filter(|d| d.status == Status::Online)
                    .count();
                let _ = tray.set_tooltip(Some(format!(
                    "NetScope · {} · в сети: {count}",
                    match snapshot.connection.as_str() {
                        "connected" => "Подключено",
                        "paused" => "На паузе",
                        "reconnecting" => "Повторное подключение",
                        _ => "Нет подключения",
                    }
                )));
            }
        }
    }
    pub async fn snapshot(&self) -> Snapshot {
        self.snapshot.read().await.clone()
    }
    pub async fn settings(&self) -> Settings {
        self.settings.read().await.clone()
    }
    pub async fn save_settings(&self, settings: Settings) -> Result<()> {
        settings.validate()?;
        self.live.save_settings(&settings).await?;
        self.close_to_tray
            .store(settings.close_to_tray, Ordering::Relaxed);
        *self.settings.write().await = settings;
        Ok(())
    }
    pub async fn connect(
        &self,
        mode: &str,
        address: &str,
        username: String,
        password: String,
    ) -> Result<Snapshot> {
        let password = zeroize::Zeroizing::new(password);
        let mut rt = self.runtime.lock().await;
        let demo = mode == "demo";
        let mut adapter: Box<dyn RouterAdapter> = match mode {
            "demo" => Box::<DemoAdapter>::default(),
            "live" => Box::new(DLinkAdapter::new(address, username, password.to_string())?),
            _ => return Err(Error::Settings),
        };
        // Verify before replacing a working session. No demo fallback on failure.
        let mut observations = tokio::select! {
            _ = self.stop.cancelled() => return Err(Error::Cancelled),
            result = adapter.poll() => result?,
        };
        let ts = now();
        Self::stamp(&mut observations, ts);
        let router = adapter.info();
        let db = self.db(demo);
        let mut previous = db.devices(&router.id).await?;
        Self::unknown(&mut previous);
        let settings = self.settings().await;
        let (devices, mut events) = registry::reconcile(
            &previous,
            observations,
            &router.id,
            ts,
            settings.offline_seconds as i64 * 1000,
        );
        events.push(NetworkEvent::new(
            &router.id,
            None,
            "router_connected",
            "Наблюдение за сетью запущено".into(),
            ts,
        ));
        db.persist(&router, &devices, &events, ts, true).await?;
        let snapshot = Snapshot {
            mode: mode.into(),
            connection: "connected".into(),
            router: Some(router),
            devices,
            updated_at: Some(ts),
            error: None,
            next_retry_seconds: None,
        };
        *rt = Runtime {
            adapter: Some(adapter),
            demo,
            maintenance_at: 0,
            ..Default::default()
        };
        *self.snapshot.write().await = snapshot.clone();
        self.emit(&snapshot);
        Ok(snapshot)
    }
    fn stamp(devices: &mut [Device], ts: i64) {
        for d in devices {
            d.last_observed = ts;
            if !d.ipv4_addresses.is_empty() || !d.ipv6_addresses.is_empty() {
                d.addresses_observed_at = Some(ts);
            }
            if d.status == Status::Online {
                d.last_seen = ts;
            }
        }
    }
    pub async fn disconnect(&self) -> Result<()> {
        let mut rt = self.runtime.lock().await;
        let mut s = self.snapshot.write().await;
        let stored = if let Some(router) = &s.router {
            let e = NetworkEvent::new(
                &router.id,
                None,
                "router_disconnected",
                "Наблюдение за сетью завершено".into(),
                now(),
            );
            self.db(rt.demo)
                .persist(router, &s.devices, &[e], now(), false)
                .await
        } else {
            Ok(())
        };
        rt.adapter = None;
        rt.paused = false;
        rt.failures = 0;
        rt.terminal = false;
        s.connection = "disconnected".into();
        s.error = stored.as_ref().err().map(ToString::to_string);
        s.next_retry_seconds = None;
        Self::unknown(&mut s.devices);
        self.emit(&s);
        stored
    }
    pub async fn pause(&self, paused: bool) -> Result<()> {
        let mut rt = self.runtime.lock().await;
        if rt.adapter.is_none() {
            return Err(Error::NotConnected);
        }
        rt.paused = paused;
        let mut s = self.snapshot.write().await;
        s.connection = if paused {
            "paused"
        } else if rt.terminal {
            "authentication_required"
        } else {
            "reconnecting"
        }
        .into();
        Self::unknown(&mut s.devices);
        let stored = if let Some(router) = &s.router {
            let ts = now();
            let event = NetworkEvent::new(
                &router.id,
                None,
                if paused {
                    "monitoring_paused"
                } else {
                    "monitoring_resumed"
                },
                if paused {
                    "Наблюдение приостановлено пользователем"
                } else {
                    "Наблюдение возобновлено пользователем"
                }
                .into(),
                ts,
            );
            self.db(rt.demo)
                .persist(router, &s.devices, &[event], ts, false)
                .await
        } else {
            Ok(())
        };
        if let Err(e) = &stored {
            s.error = Some(e.to_string());
        }
        self.emit(&s);
        if !paused {
            self.wake.notify_one();
        }
        stored
    }
    pub async fn refresh(&self) -> Result<Snapshot> {
        let mut rt = self.runtime.lock().await;
        if rt.adapter.is_none() {
            return Err(Error::NotConnected);
        }
        if rt.paused {
            return Err(Error::Paused);
        }
        if rt.terminal {
            return Err(Error::Authentication);
        }
        self.collect(&mut rt).await?;
        Ok(self.snapshot().await)
    }
    async fn collect(&self, rt: &mut Runtime) -> Result<()> {
        let Some(adapter) = rt.adapter.as_mut() else {
            return Ok(());
        };
        let result = tokio::select! {
            _ = self.stop.cancelled() => return Err(Error::Cancelled),
            result = adapter.poll() => result,
        };
        let ts = now();
        let settings = self.settings().await;
        let mut s = self.snapshot().await;
        let router = s.router.clone().ok_or(Error::NotConnected)?;
        let db = self.db(rt.demo);
        match result {
            Ok(mut observations) => {
                Self::stamp(&mut observations, ts);
                // Invalidate the baseline after sleep, loss of connectivity, or a long scheduling gap.
                if s.updated_at
                    .is_some_and(|t| ts - t > (settings.poll_seconds as i64 * 3000).max(30_000))
                {
                    Self::unknown(&mut s.devices);
                }
                let (devices, mut events) = registry::reconcile(
                    &s.devices,
                    observations,
                    &router.id,
                    ts,
                    settings.offline_seconds as i64 * 1000,
                );
                if rt.failures > 0 {
                    events.push(NetworkEvent::new(
                        &router.id,
                        None,
                        "router_reconnected",
                        "Связь с маршрутизатором восстановлена".into(),
                        ts,
                    ));
                }
                // Commit before publishing: the UI never presents an unpersisted sample as saved.
                if let Err(e) = db.persist(&router, &devices, &events, ts, true).await {
                    s.error = Some(e.to_string());
                    s.connection = "storage_error".into();
                    Self::unknown(&mut s.devices);
                    *self.snapshot.write().await = s.clone();
                    self.emit(&s);
                    return Err(e);
                }
                s.devices = devices;
                s.connection = "connected".into();
                s.error = None;
                s.updated_at = Some(ts);
                s.next_retry_seconds = None;
                rt.failures = 0;
                if !rt.demo {
                    self.notify(&events, &s.devices, &settings);
                }
                if ts - rt.maintenance_at > 600_000 {
                    if db.maintain(ts, settings.retention_days).await.is_err() {
                        s.error =
                            Some("Не удалось очистить историю. Проверьте свободное место.".into());
                    }
                    rt.maintenance_at = ts;
                }
                *self.snapshot.write().await = s.clone();
                self.emit(&s);
                Ok(())
            }
            Err(e) => {
                rt.failures = rt.failures.saturating_add(1);
                rt.terminal = matches!(e, Error::Authentication | Error::Digest | Error::Forbidden);
                s.connection = if rt.terminal {
                    "authentication_required"
                } else {
                    "reconnecting"
                }
                .into();
                s.error = Some(e.to_string());
                s.next_retry_seconds = if rt.terminal {
                    None
                } else {
                    Some(backoff(rt.failures, settings.poll_seconds))
                };
                Self::unknown(&mut s.devices);
                if rt.failures == 1 {
                    let event = NetworkEvent::new(
                        &router.id,
                        None,
                        "router_disconnected",
                        e.to_string(),
                        ts,
                    );
                    let collection_error = NetworkEvent::new(
                        &router.id,
                        None,
                        "collection_error",
                        "Не удалось обновить данные. Доступность устройств неизвестна.".into(),
                        ts,
                    );
                    let events = [event, collection_error];
                    if db
                        .persist(&router, &s.devices, &events, ts, false)
                        .await
                        .is_err()
                    {
                        tracing::warn!("Could not persist collection failure");
                    }
                    if !rt.demo {
                        self.notify(&events, &s.devices, &settings);
                    }
                }
                tracing::warn!(attempt = rt.failures, "Router observation failed");
                *self.snapshot.write().await = s.clone();
                self.emit(&s);
                Err(e)
            }
        }
    }
    fn notify(&self, events: &[NetworkEvent], devices: &[Device], settings: &Settings) {
        if !settings.notifications {
            return;
        }
        let Some(app) = self.app.get() else {
            return;
        };
        let mut times = self
            .notification_times
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let messages = notification_messages(events, devices, settings, &mut times, now());
        if !messages.is_empty() {
            let _ = app
                .notification()
                .builder()
                .title("NetScope")
                .body(messages.join("\n"))
                .show();
        }
    }
    async fn monitor(self: Arc<Self>) {
        loop {
            let wait = {
                let rt = self.runtime.lock().await;
                backoff(rt.failures, self.settings.read().await.poll_seconds)
            };
            tokio::select! {
                _ = self.stop.cancelled() => break,
                _ = tokio::time::sleep(Duration::from_secs(wait)) => (),
                _ = self.wake.notified() => (),
            }
            let mut rt = self.runtime.lock().await;
            if self.stop.is_cancelled() {
                break;
            }
            if rt.adapter.is_some() && !rt.paused && !rt.terminal {
                let _ = self.collect(&mut rt).await;
            }
        }
    }
    pub async fn events(
        &self,
        device: Option<&str>,
        context: Option<&NetworkContext>,
    ) -> Result<Vec<NetworkEvent>> {
        let s = self.snapshot().await;
        Self::validate_context(&s, context)?;
        let Some(router) = s.router else {
            return Ok(vec![]);
        };
        self.db(s.mode == "demo").events(&router.id, device).await
    }
    pub async fn metrics(
        &self,
        device: Option<&str>,
        seconds: i64,
        context: Option<&NetworkContext>,
    ) -> Result<Vec<Metric>> {
        if ![300, 3600, 86400, 604800].contains(&seconds) {
            return Err(Error::Settings);
        }
        let s = self.snapshot().await;
        Self::validate_context(&s, context)?;
        let Some(router) = s.router else {
            return Ok(vec![]);
        };
        let ts = now();
        self.db(s.mode == "demo")
            .metrics(&router.id, device, ts - seconds * 1000, ts)
            .await
    }
    fn validate_context(snapshot: &Snapshot, context: Option<&NetworkContext>) -> Result<()> {
        if let Some(context) = context {
            if context.mode != snapshot.mode
                || snapshot
                    .router
                    .as_ref()
                    .is_none_or(|r| r.id != context.router_id)
            {
                return Err(Error::Context);
            }
        }
        Ok(())
    }
    pub async fn patch_device(&self, patch: DevicePatch) -> Result<Device> {
        let _rt = self.runtime.lock().await;
        if patch
            .custom_name
            .as_ref()
            .is_some_and(|s| s.chars().count() > 80)
            || ![
                "router",
                "desktop",
                "laptop",
                "smartphone",
                "tablet",
                "smartwatch",
                "tv",
                "smart_home",
                "server",
                "unknown",
            ]
            .contains(&patch.device_type.as_str())
            || ![
                "auto",
                "laptop",
                "smartphone",
                "tv",
                "server",
                "wifi",
                "desktop",
                "tablet",
                "smartwatch",
                "smart_home",
            ]
            .contains(&patch.icon.as_str())
        {
            return Err(Error::Device);
        }
        let mut s = self.snapshot.write().await;
        let demo = s.mode == "demo";
        let d = s
            .devices
            .iter_mut()
            .find(|d| d.id == patch.id)
            .ok_or(Error::Device)?;
        let mut updated = d.clone();
        updated.custom_name = patch
            .custom_name
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());
        updated.device_type = patch.device_type;
        updated.icon = patch.icon;
        updated.favorite = patch.favorite;
        updated.hidden = patch.hidden;
        self.db(demo).save_device(&updated).await?;
        *d = updated.clone();
        self.emit(&s);
        Ok(updated)
    }
    pub async fn shutdown(&self) {
        self.stop.cancel();
        self.wake.notify_waiters();
        let mut rt = self.runtime.lock().await;
        rt.adapter = None;
        drop(rt);
        self.live.close().await;
        self.demo.close().await;
        self.exit_ready.store(true, Ordering::SeqCst);
    }
}
fn backoff(failures: u32, interval: u64) -> u64 {
    if failures == 0 {
        interval
    } else {
        interval.saturating_mul(1u64 << failures.min(5)).min(300)
    }
}

fn notification_messages<'a>(
    events: &'a [NetworkEvent],
    devices: &[Device],
    settings: &Settings,
    times: &mut BTreeMap<String, i64>,
    ts: i64,
) -> Vec<&'a str> {
    if !settings.notifications {
        return vec![];
    }
    times.retain(|_, last| ts - *last < 300_000);
    events
        .iter()
        .filter(|e| {
            let allowed = match e.event_type.as_str() {
                "device_discovered" => settings.notify_discovery,
                "device_offline" => settings.notify_offline,
                "router_disconnected" | "router_reconnected" => settings.notify_router,
                _ => false,
            };
            if !allowed
                || (settings.favorite_notifications_only
                    && e.device_id
                        .as_ref()
                        .is_some_and(|id| !devices.iter().any(|d| &d.id == id && d.favorite)))
            {
                return false;
            }
            let key = format!(
                "{}:{}:{}",
                e.router_id,
                e.event_type,
                e.device_id.as_deref().unwrap_or("router")
            );
            if times.get(&key).is_some_and(|last| ts - *last < 30_000) {
                return false;
            }
            times.insert(key, ts);
            true
        })
        .take(3)
        .map(|e| e.message.as_str())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    struct WaitingAdapter(Arc<Notify>);
    #[async_trait::async_trait]
    impl RouterAdapter for WaitingAdapter {
        fn info(&self) -> RouterInfo {
            DemoAdapter::default().info()
        }
        async fn poll(&mut self) -> Result<Vec<Device>> {
            self.0.notify_one();
            std::future::pending().await
        }
    }
    #[tokio::test]
    async fn quitting_cancels_a_pending_router_request_without_recording_an_outage() {
        let temp = tempfile::tempdir().unwrap();
        let engine = Engine::new(temp.path()).await.unwrap();
        engine
            .connect("demo", "", "".into(), "".into())
            .await
            .unwrap();
        let started = Arc::new(Notify::new());
        engine.runtime.lock().await.adapter = Some(Box::new(WaitingAdapter(started.clone())));
        let worker = engine.clone();
        let refresh = tokio::spawn(async move { worker.refresh().await });
        started.notified().await;
        tokio::time::timeout(Duration::from_secs(1), engine.shutdown())
            .await
            .unwrap();
        assert!(matches!(refresh.await.unwrap(), Err(Error::Cancelled)));
        assert!(engine.snapshot().await.error.is_none());
    }
    #[tokio::test]
    async fn rejects_history_requests_for_a_network_that_was_switched_away() {
        let temp = tempfile::tempdir().unwrap();
        let engine = Engine::new(temp.path()).await.unwrap();
        engine
            .connect("demo", "", "".into(), "".into())
            .await
            .unwrap();
        let wrong = NetworkContext {
            mode: "live".into(),
            router_id: "demo".into(),
        };
        assert!(matches!(
            engine.metrics(None, 300, Some(&wrong)).await,
            Err(Error::Context)
        ));
        assert!(matches!(
            engine.events(None, Some(&wrong)).await,
            Err(Error::Context)
        ));
        let correct = NetworkContext {
            mode: "demo".into(),
            router_id: "demo".into(),
        };
        assert!(!engine
            .metrics(None, 300, Some(&correct))
            .await
            .unwrap()
            .is_empty());
        engine.shutdown().await;
    }
    struct FailingAdapter;
    #[async_trait::async_trait]
    impl RouterAdapter for FailingAdapter {
        fn info(&self) -> RouterInfo {
            DemoAdapter::default().info()
        }
        async fn poll(&mut self) -> Result<Vec<Device>> {
            Err(Error::Network)
        }
    }
    #[tokio::test]
    async fn router_outage_is_unknown_not_a_mass_disconnect_and_recovers() {
        let temp = tempfile::tempdir().unwrap();
        let engine = Engine::new(temp.path()).await.unwrap();
        engine
            .connect("demo", "", "".into(), "".into())
            .await
            .unwrap();
        engine.runtime.lock().await.adapter = Some(Box::new(FailingAdapter));
        assert!(matches!(engine.refresh().await, Err(Error::Network)));
        let s = engine.snapshot().await;
        assert_eq!(s.connection, "reconnecting");
        assert!(s
            .devices
            .iter()
            .all(|d| d.status == Status::Unknown && d.tx_bps.is_none()));
        let events = engine.events(None, None).await.unwrap();
        assert_eq!(
            events
                .iter()
                .filter(|e| e.event_type == "router_disconnected")
                .count(),
            1
        );
        assert!(!events.iter().any(|e| e.event_type == "device_offline"));
        assert!(engine.refresh().await.is_err());
        assert_eq!(
            engine
                .events(None, None)
                .await
                .unwrap()
                .iter()
                .filter(|e| e.event_type == "router_disconnected")
                .count(),
            1
        );
        engine.runtime.lock().await.adapter = Some(Box::<DemoAdapter>::default());
        engine.refresh().await.unwrap();
        assert_eq!(engine.snapshot().await.connection, "connected");
        assert!(engine
            .events(None, None)
            .await
            .unwrap()
            .iter()
            .any(|e| e.event_type == "router_reconnected"));
        engine.shutdown().await;
    }
    #[tokio::test]
    async fn disconnect_drops_the_session_even_when_event_storage_fails() {
        let temp = tempfile::tempdir().unwrap();
        let engine = Engine::new(temp.path()).await.unwrap();
        engine
            .connect("demo", "", "".into(), "".into())
            .await
            .unwrap();
        engine.demo.close().await;
        assert!(matches!(engine.disconnect().await, Err(Error::Database)));
        assert!(engine.runtime.lock().await.adapter.is_none());
        assert_eq!(engine.snapshot().await.connection, "disconnected");
        engine.shutdown().await;
    }
    #[test]
    fn notification_filters_and_duplicate_suppression() {
        let mut d = Device::new("02:00:00:00:00:01", "test", 0);
        d.favorite = false;
        let event = NetworkEvent::new(
            "test",
            Some(&d.id),
            "device_discovered",
            "New device".into(),
            0,
        );
        let router_event =
            NetworkEvent::new("test", None, "router_reconnected", "Restored".into(), 0);
        let events = [event, router_event];
        let mut times = BTreeMap::new();
        let mut settings = Settings {
            notifications: true,
            favorite_notifications_only: true,
            ..Default::default()
        };
        assert_eq!(
            notification_messages(&events, &[d.clone()], &settings, &mut times, 1000),
            vec!["Restored"]
        );
        d.favorite = true;
        assert_eq!(
            notification_messages(&events, &[d.clone()], &settings, &mut times, 2000),
            vec!["New device"]
        );
        assert!(
            notification_messages(&events, &[d.clone()], &settings, &mut times, 3000).is_empty()
        );
        settings.notify_discovery = false;
        settings.notify_router = false;
        assert!(notification_messages(&events, &[d], &settings, &mut times, 60_000).is_empty());
    }
    #[tokio::test]
    async fn session_lifecycle_isolated_demo_and_device_customization() {
        let temp = tempfile::tempdir().unwrap();
        let e = Engine::new(temp.path()).await.unwrap();
        assert!(e.snapshot().await.router.is_none());
        let s = e.connect("demo", "", "".into(), "".into()).await.unwrap();
        assert_eq!(s.mode, "demo");
        assert_eq!(s.devices.len(), 8);
        e.patch_device(DevicePatch {
            id: s.devices[0].id.clone(),
            custom_name: Some("My Mac".into()),
            device_type: "laptop".into(),
            icon: "auto".into(),
            favorite: true,
            hidden: false,
        })
        .await
        .unwrap();
        e.pause(true).await.unwrap();
        assert!(matches!(e.refresh().await, Err(Error::Paused)));
        e.pause(false).await.unwrap();
        e.refresh().await.unwrap();
        assert_eq!(
            e.snapshot().await.devices[0].custom_name.as_deref(),
            Some("My Mac")
        );
        assert!(!e.metrics(None, 300, None).await.unwrap().is_empty());
        assert!(!e.events(None, None).await.unwrap().is_empty());
        assert!(e.live.last_router().await.unwrap().is_none());
        e.disconnect().await.unwrap();
        assert_eq!(e.snapshot().await.connection, "disconnected");
        e.shutdown().await;
        assert!(e.exit_ready.load(Ordering::SeqCst));
    }
}
