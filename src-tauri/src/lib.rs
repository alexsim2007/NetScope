mod adapters;
mod commands;
mod database;
mod error;
mod models;
mod services;

use services::Engine;
use std::sync::{atomic::Ordering, Arc};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

fn show(app: &tauri::AppHandle, page: Option<&str>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    if let Some(page) = page {
        let _ = app.emit("netscope://navigate", page);
    }
}

#[cfg(target_os = "macos")]
fn native_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    use tauri::menu::{PredefinedMenuItem as Native, Submenu};
    let about = MenuItem::with_id(app, "about-netscope", "О NetScope", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "app-settings", "Настройки…", true, Some("CmdOrCtrl+,"))?;
    let app_menu = Submenu::with_items(
        app,
        "NetScope",
        true,
        &[
            &about,
            &settings,
            &Native::separator(app)?,
            &Native::hide(app, Some("Скрыть NetScope"))?,
            &Native::hide_others(app, Some("Скрыть остальные"))?,
            &Native::show_all(app, Some("Показать все"))?,
            &Native::separator(app)?,
            &Native::quit(app, Some("Выйти из NetScope"))?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Правка",
        true,
        &[
            &Native::undo(app, Some("Отменить"))?,
            &Native::redo(app, Some("Повторить"))?,
            &Native::separator(app)?,
            &Native::cut(app, Some("Вырезать"))?,
            &Native::copy(app, Some("Скопировать"))?,
            &Native::paste(app, Some("Вставить"))?,
            &Native::select_all(app, Some("Выбрать всё"))?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        "Окно",
        true,
        &[
            &Native::minimize(app, Some("Свернуть"))?,
            &Native::maximize(app, Some("Развернуть"))?,
            &Native::close_window(app, Some("Закрыть окно"))?,
        ],
    )?;
    Menu::with_items(app, &[&app_menu, &edit, &window])
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show(app, None)
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .setup(|app| {
            let initialized = (|| -> std::result::Result<(), Box<dyn std::error::Error>> {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let logs = app.path().app_log_dir()?;
            std::fs::create_dir_all(&logs)?;
            let writer = tracing_appender::rolling::Builder::new()
                .rotation(tracing_appender::rolling::Rotation::DAILY)
                .filename_prefix("netscope")
                .filename_suffix("log")
                .max_log_files(7)
                .build(logs)?;
            let _ = tracing_subscriber::fmt()
                .with_ansi(false)
                .with_max_level(tracing::Level::INFO)
                .with_writer(writer)
                .try_init();
            let engine = tauri::async_runtime::block_on(Engine::new(&dir))?;
            engine.attach(app.handle().clone());
            app.manage(engine);
            let open = MenuItem::with_id(app, "open", "Открыть NetScope", true, None::<&str>)?;
            let status = MenuItem::with_id(app, "status", "Состояние сети", true, None::<&str>)?;
            let devices =
                MenuItem::with_id(app, "devices", "Устройства в сети", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Приостановить наблюдение", true, None::<&str>)?;
            let resume = MenuItem::with_id(app, "resume", "Продолжить наблюдение", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Настройки", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Выйти из NetScope", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open, &status, &devices, &pause, &resume, &settings, &quit],
            )?;
            let mut tray = TrayIconBuilder::with_id("network")
                .tooltip("NetScope · Монитор сети")
                .menu(&menu)
                .show_menu_on_left_click(true);
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "open" | "status" => show(app, Some("/")),
                "devices" => show(app, Some("/devices")),
                "settings" => show(app, Some("/settings")),
                "quit" => app.exit(0),
                "pause" | "resume" => {
                    let engine = app.state::<Arc<Engine>>().inner().clone();
                    let paused = event.id.as_ref() == "pause";
                    tauri::async_runtime::spawn(async move {
                        let _ = engine.pause(paused).await;
                    });
                }
                _ => (),
            })
            .build(app)?;
            tracing::info!("NetScope started");
            Ok(())
            })();
            if initialized.is_err() {
                tracing::error!("Desktop initialization failed");
                app.dialog().message("Не удалось открыть хранилище или системные функции. Проверьте свободное место и права доступа, затем перезапустите NetScope. Сохранённые данные не удалены.")
                    .title("Не удалось запустить NetScope").kind(MessageDialogKind::Error).show(|_| {});
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let Some(engine) = window.try_state::<Arc<Engine>>() else { return; };
                if engine.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    api.prevent_close();
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::open_feedback,
            commands::get_desktop_status,
            commands::set_autostart,
            commands::test_desktop_notification,
            commands::check_router_connection,
            commands::connect_router,
            commands::disconnect_router,
            commands::refresh_network,
            commands::set_paused,
            commands::get_settings,
            commands::save_settings,
            commands::update_device,
            commands::get_events,
            commands::get_metrics
        ]);
    #[cfg(target_os = "macos")]
    let builder = builder.menu(native_menu).on_menu_event(|app, event| {
        match event.id.as_ref() {
            "about-netscope" => app.dialog().message("NetScope\nМониторинг локальной сети.\n\nДоступ к маршрутизатору только для чтения. Данные хранятся на вашем компьютере.\n\nЛицензия MIT").title("О NetScope").show(|_| {}),
            "app-settings" => show(app, Some("/settings")),
            _ => (),
        }
    });
    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(_) => {
            eprintln!("Не удалось запустить NetScope. Переустановите приложение или проверьте разрешения системы.");
            return;
        }
    };
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let Some(state) = app.try_state::<Arc<Engine>>() else {
                return;
            };
            let engine = state.inner().clone();
            if !engine.exit_ready.load(Ordering::SeqCst) {
                api.prevent_exit();
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    engine.shutdown().await;
                    handle.exit(0);
                });
            }
        }
    });
}
