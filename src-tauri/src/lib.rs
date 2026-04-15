use tauri::Manager;

mod commands;
mod credentials;
mod decay;
mod enrichment;
mod persistence;
mod preferences;
mod steam;
mod telemetry;
mod touch_keyboard;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let base = persistence::app_data_dir(app.handle());
            persistence::ensure_dir(&base);
            commands::session_log::prune_session_log(&base);

            // Fire-and-forget telemetry ping
            let telemetry_base = base.clone();
            tauri::async_runtime::spawn(async move {
                telemetry::send_launch_ping(&telemetry_base).await;
            });

            // Enable touch keyboard focus tracking (Windows only)
            touch_keyboard::enable_focus_tracking();

            // Show window after setup completes (avoids white flash)
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Data persistence
            commands::data::get_data,
            commands::data::save_data,
            commands::data::reset_games_data,
            // Showcase & Warehouse
            commands::showcase::get_showcase,
            commands::showcase::save_showcase,
            commands::showcase::search_warehouse,
            commands::showcase::sample_warehouse,
            commands::showcase::reset_explore_limit,
            // Session log
            commands::session_log::append_session_log,
            commands::session_log::export_session_log,
            // Window
            commands::window::minimize_window,
            commands::window::close_window,
            commands::window::get_app_version,
            commands::window::launch_game,
            // Steam
            commands::steam::check_steam_available,
            commands::steam::request_onboarding_sync,
            commands::steam::perform_background_snapshot,
            // IGDB
            commands::igdb::save_igdb_credentials,
            commands::igdb::load_igdb_credentials,
            commands::igdb::test_igdb_credentials,
            commands::igdb::clear_igdb_credentials,
            // License
            commands::license::save_license_key,
            commands::license::load_license_key,
            commands::license::check_license,
            // Telemetry
            telemetry::get_telemetry_enabled,
            telemetry::set_telemetry_enabled,
            // Preferences
            preferences::get_frozen_guard_duration,
            preferences::set_frozen_guard_duration,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Maida");
}
