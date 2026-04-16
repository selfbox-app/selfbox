use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

/// Build the system tray icon and its menu.
pub fn setup_tray(app: &AppHandle) -> tauri::Result<TrayIcon> {
    let menu = build_tray_menu(app)?;

    // `tray-icon` fixes macOS status-item images to 18pt high, so use the
    // tight @3x source for sharper scaling and to force Rust to re-embed it.
    let icon = tauri::include_image!("icons/tray@3x.png");

    TrayIconBuilder::with_id("selfbox")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .icon(icon)
        .icon_as_template(true)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_event)
        .build(app)
}

fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let status = MenuItem::with_id(app, "status", "● Selfbox", false, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;

    let open_folder = MenuItem::with_id(
        app,
        "open_folder",
        "Open Sync Folder",
        true,
        None::<&str>,
    )?;
    let open_web = MenuItem::with_id(app, "open_web", "Open Selfbox on Web", true, None::<&str>)?;

    let separator2 = PredefinedMenuItem::separator(app)?;

    let pause = MenuItem::with_id(app, "pause", "Pause Sync", true, None::<&str>)?;
    let show_window =
        MenuItem::with_id(app, "show_window", "Show Selfbox", true, Some("CmdOrCtrl+S"))?;
    let prefs = MenuItem::with_id(app, "preferences", "Preferences…", true, Some("CmdOrCtrl+,"))?;

    let separator3 = PredefinedMenuItem::separator(app)?;

    let about = MenuItem::with_id(app, "about", "About Selfbox", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Selfbox", true, Some("CmdOrCtrl+Q"))?;

    let menu = Menu::with_items(
        app,
        &[
            &status,
            &separator1,
            &open_folder,
            &open_web,
            &separator2,
            &pause,
            &show_window,
            &prefs,
            &separator3,
            &about,
            &quit,
        ],
    )?;

    Ok(menu)
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id.as_ref() {
        "show_window" => show_main_window(app),
        "preferences" => {
            show_main_window(app);
            let _ = app.emit_to("main", "tray:navigate", "settings");
        }
        "open_folder" => {
            let _ = app.emit("tray:open_folder", ());
        }
        "open_web" => {
            let _ = app.emit("tray:open_web", ());
        }
        "pause" => {
            let _ = app.emit("tray:toggle_pause", ());
        }
        "about" => {
            show_main_window(app);
            let _ = app.emit_to("main", "tray:navigate", "settings");
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

fn handle_tray_event(tray: &TrayIcon, event: TrayIconEvent) {
    // Left-click shows the menu (configured above); double-click opens the window.
    if let TrayIconEvent::DoubleClick { .. } = event {
        show_main_window(&tray.app_handle().clone());
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.unminimize();
    }
}
