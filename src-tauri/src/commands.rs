use crate::{error::CommandError, models::*, services::Engine};
use std::sync::Arc;
use tauri::{Manager, State};
type EngineState<'a> = State<'a, Arc<Engine>>;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopStatus {
    platform: &'static str,
    alcove_installed: bool,
    autostart_enabled: bool,
}

#[tauri::command]
pub fn get_desktop_status(app: tauri::AppHandle) -> Result<DesktopStatus, CommandError> {
    use tauri_plugin_autostart::ManagerExt;
    Ok(DesktopStatus {
        platform: std::env::consts::OS,
        alcove_installed: cfg!(target_os = "macos")
            && (std::path::Path::new("/Applications/Alcove.app").exists()
                || app
                    .path()
                    .home_dir()
                    .is_ok_and(|home| home.join("Applications/Alcove.app").exists())),
        autostart_enabled: app
            .autolaunch()
            .is_enabled()
            .map_err(|_| crate::error::Error::Autostart)?,
    })
}

#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<DesktopStatus, CommandError> {
    use tauri_plugin_autostart::ManagerExt;
    let result = if enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    };
    result.map_err(|_| crate::error::Error::Autostart)?;
    get_desktop_status(app)
}

#[tauri::command]
pub fn test_desktop_notification(app: tauri::AppHandle) -> Result<(), CommandError> {
    use tauri_plugin_notification::NotificationExt;
    app.notification().builder().title("NetScope")
        .body(if cfg!(target_os = "macos") { "NetScope работает в фоне. Разрешите его уведомления в Alcove, чтобы видеть события возле чёлки." } else { "NetScope работает в фоне. Управление наблюдением доступно в системном трее." })
        .show().map_err(|_| crate::error::Error::Notification.into())
}

#[tauri::command]
pub fn open_feedback(app: tauri::AppHandle) -> Result<(), CommandError> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url("https://t.me/allllllIlIl", None::<&str>)
        .map_err(|_| crate::error::Error::ExternalOpen.into())
}

#[tauri::command]
pub async fn check_router_connection(
    address: String,
) -> Result<crate::adapters::dlink::client::ConnectionCheck, CommandError> {
    crate::adapters::dlink::client::DLinkAdapter::check_connection(&address)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_snapshot<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Snapshot, CommandError> {
    let engine = app
        .try_state::<Arc<Engine>>()
        .ok_or(crate::error::Error::Database)?
        .inner()
        .clone();
    Ok(engine.snapshot().await)
}
#[tauri::command]
pub async fn connect_router(
    engine: EngineState<'_>,
    mode: String,
    address: String,
    username: String,
    password: String,
) -> Result<Snapshot, CommandError> {
    engine
        .connect(&mode, &address, username, password)
        .await
        .map_err(Into::into)
}
#[tauri::command]
pub async fn disconnect_router(engine: EngineState<'_>) -> Result<(), CommandError> {
    engine.disconnect().await.map_err(Into::into)
}
#[tauri::command]
pub async fn refresh_network(engine: EngineState<'_>) -> Result<Snapshot, CommandError> {
    engine.refresh().await.map_err(Into::into)
}
#[tauri::command]
pub async fn set_paused(engine: EngineState<'_>, paused: bool) -> Result<(), CommandError> {
    engine.pause(paused).await.map_err(Into::into)
}
#[tauri::command]
pub async fn get_settings(engine: EngineState<'_>) -> Result<Settings, CommandError> {
    Ok(engine.settings().await)
}
#[tauri::command]
pub async fn save_settings(
    engine: EngineState<'_>,
    settings: Settings,
) -> Result<(), CommandError> {
    engine.save_settings(settings).await.map_err(Into::into)
}
#[tauri::command]
pub async fn update_device(
    engine: EngineState<'_>,
    patch: DevicePatch,
) -> Result<Device, CommandError> {
    engine.patch_device(patch).await.map_err(Into::into)
}
#[tauri::command]
pub async fn get_events(
    engine: EngineState<'_>,
    device_id: Option<String>,
    context: NetworkContext,
) -> Result<Vec<NetworkEvent>, CommandError> {
    engine
        .events(device_id.as_deref(), Some(&context))
        .await
        .map_err(Into::into)
}
#[tauri::command]
pub async fn get_metrics(
    engine: EngineState<'_>,
    device_id: Option<String>,
    seconds: i64,
    context: NetworkContext,
) -> Result<Vec<Metric>, CommandError> {
    engine
        .metrics(device_id.as_deref(), seconds, Some(&context))
        .await
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};

    #[test]
    fn command_round_trip_connect_measure_restore_and_stop() {
        let dir = tempfile::tempdir().unwrap();
        let engine = tauri::async_runtime::block_on(Engine::new(dir.path())).unwrap();
        let app = mock_builder()
            .manage(engine.clone())
            .invoke_handler(tauri::generate_handler![
                get_snapshot,
                connect_router,
                get_metrics,
                get_events,
                set_paused,
                refresh_network,
                disconnect_router
            ])
            .build(mock_context(noop_assets()))
            .unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let call = |cmd: &str, args: Value| {
            get_ipc_response(
                &window,
                tauri::webview::InvokeRequest {
                    cmd: cmd.into(),
                    callback: tauri::ipc::CallbackFn(0),
                    error: tauri::ipc::CallbackFn(1),
                    url: if cfg!(windows) {
                        "http://tauri.localhost"
                    } else {
                        "tauri://localhost"
                    }
                    .parse()
                    .unwrap(),
                    body: tauri::ipc::InvokeBody::Json(args),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.to_string(),
                },
            )
            .map(|b| b.deserialize::<Value>().unwrap())
        };
        let s = call(
            "connect_router",
            json!({"mode":"demo","address":"","username":"","password":""}),
        )
        .unwrap();
        assert_eq!(s["devices"].as_array().unwrap().len(), 8);
        assert_eq!(s["mode"], "demo");
        assert!(!call(
            "get_metrics",
            json!({"seconds":300,"deviceId":null,"context":{"mode":"demo","routerId":"demo"}})
        )
        .unwrap()
        .as_array()
        .unwrap()
        .is_empty());
        call("set_paused", json!({"paused":true})).unwrap();
        assert_eq!(
            call("refresh_network", json!({})).unwrap_err()["code"],
            "paused"
        );
        call("set_paused", json!({"paused":false})).unwrap();
        call("refresh_network", json!({})).unwrap();
        assert!(!call(
            "get_events",
            json!({"deviceId":null,"context":{"mode":"demo","routerId":"demo"}})
        )
        .unwrap()
        .as_array()
        .unwrap()
        .is_empty());
        call("disconnect_router", json!({})).unwrap();
        assert_eq!(
            call("get_snapshot", json!({})).unwrap()["connection"],
            "disconnected"
        );
        tauri::async_runtime::block_on(engine.shutdown());
        let restored = tauri::async_runtime::block_on(Engine::new(dir.path())).unwrap();
        // A demo session cannot overwrite the user's saved live router profile.
        assert!(tauri::async_runtime::block_on(restored.snapshot())
            .router
            .is_none());
        tauri::async_runtime::block_on(restored.shutdown());
    }
}
