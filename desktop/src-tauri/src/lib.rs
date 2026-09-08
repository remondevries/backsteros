mod cursor_usage;
mod overlay;
mod system_stats;
mod whoop;

use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

use overlay::{
    focus_main_window, hide_desktop_overlay, register_desktop_global_shortcuts,
    resize_desktop_overlay, toggle_desktop_overlay_compose, toggle_desktop_overlay_palette,
    OverlayMode, OverlayState,
};

/// Shared WKWebView data store for main + overlay (macOS 14+ / iOS 17+).
/// Without this, Tauri gives each window its own store — the overlay would not
/// share localStorage / IndexedDB with main. Changing this value resets that store.
#[cfg(any(target_os = "macos", target_os = "ios"))]
const APP_WEBVIEW_DATA_STORE_ID: [u8; 16] = [
    0xb4, 0xc7, 0x5e, 0x20, 0x05, 0xde, 0x4b, 0x0a, 0x9e, 0x11, 0x82, 0x3f,
    0x6d, 0x41, 0xc0, 0x01,
];

/// Dispatched into the webview when the native ⌘K / Ctrl+K menu accelerator fires.
/// WKWebView on macOS often swallows Cmd+K before JS `keydown` listeners see it.
const TOGGLE_COMMAND_PALETTE_JS: &str =
    "window.dispatchEvent(new CustomEvent('backsteros:toggle-command-palette'))";

/// Dispatched when ⌘L / Ctrl+L fires — focus the agent Browser tab address bar.
/// Needed because a focused child browser webview swallows keydowns before the
/// main shell's JS listeners see them.
const FOCUS_BROWSER_ADDRESS_JS: &str =
    "window.dispatchEvent(new CustomEvent('backsteros:focus-browser-address'))";

/// Dispatched when ⌘A / Ctrl+A fires. Native Edit → Select All would otherwise
/// select all page text and never reach list multi-select handlers.
const SELECT_ALL_JS: &str =
    "window.dispatchEvent(new CustomEvent('backsteros:select-all'))";

/// Dispatched when ⌘E / Ctrl+E fires. WKWebView swallows ⌘E while a text
/// field / CodeMirror is focused ("Use Selection for Find") unless the app
/// menu claims the accelerator — same class of bug as ⌘K / ⌘A.
const TOGGLE_CONTENT_VIEW_MODE_JS: &str =
    "window.dispatchEvent(new CustomEvent('backsteros:toggle-content-view-mode'))";

/// Dispatched when ⌘P / Ctrl+P fires. WKWebView otherwise opens Print.
const FORCE_CONTENT_PREVIEW_JS: &str =
    "window.dispatchEvent(new CustomEvent('backsteros:force-content-preview'))";

/// Dispatched when ⌘R / Ctrl+R fires. WKWebView otherwise reloads the page.
const TITLE_RENAME_JS: &str =
    "window.dispatchEvent(new CustomEvent('backsteros:title-rename'))";

fn is_app_origin(url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" | "asset" | "data" | "blob" => true,
        "http" | "https" => matches!(
            url.host_str(),
            Some("localhost" | "127.0.0.1" | "tauri.localhost")
        ),
        _ => false,
    }
}

/// Keep the main shell on the app origin. External links use the system opener
/// via `on_new_window` — never navigate the main webview away from the SPA.
fn allow_main_navigation(url: &tauri::Url) -> bool {
    is_app_origin(url)
}

fn install_app_menu(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();

    // First submenu becomes the app menu on macOS (About / Quit live here).
    let app_submenu = SubmenuBuilder::new(handle, "BacksterOS")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let search_item = MenuItemBuilder::with_id("command-palette", "Search")
        .accelerator("CmdOrCtrl+K")
        .build(handle)?;

    // WKWebView often swallows plain ⌘K before the menu accelerator runs;
    // ⌘⇧K is a second native path that still reaches the app menu.
    let search_item_shift =
        MenuItemBuilder::with_id("command-palette-shift", "Search")
            .accelerator("CmdOrCtrl+Shift+K")
            .build(handle)?;

    let open_location_item = MenuItemBuilder::with_id("browser-address", "Open Location")
        .accelerator("CmdOrCtrl+L")
        .build(handle)?;

    // Custom Select All so ⌘A reaches JS (list multi-select). The stock
    // `.select_all()` selects page text in the webview and never notifies us.
    let select_all_item = MenuItemBuilder::with_id("select-all", "Select All")
        .accelerator("CmdOrCtrl+A")
        .build(handle)?;

    // Claim ⌘E so WKWebView cannot swallow it as "Use Selection for Find"
    // while the markdown / draft editor is focused.
    let toggle_view_mode_item =
        MenuItemBuilder::with_id("toggle-content-view-mode", "Toggle Edit/Preview")
            .accelerator("CmdOrCtrl+E")
            .build(handle)?;

    // Claim ⌘P so WKWebView cannot open the system Print dialog.
    let force_preview_item =
        MenuItemBuilder::with_id("force-content-preview", "Preview")
            .accelerator("CmdOrCtrl+P")
            .build(handle)?;

    // Claim ⌘R so WKWebView cannot Reload while an editor / title field is focused.
    let title_rename_item = MenuItemBuilder::with_id("title-rename", "Rename")
        .accelerator("CmdOrCtrl+R")
        .build(handle)?;

    let edit_submenu = SubmenuBuilder::new(handle, "Edit")
        .item(&search_item)
        .item(&search_item_shift)
        .item(&open_location_item)
        .item(&toggle_view_mode_item)
        .item(&force_preview_item)
        .item(&title_rename_item)
        .separator()
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .item(&select_all_item)
        .build()?;

    // Do not add Close Window — its default accelerator is ⌘W, which must
    // close product tabs in the webview (including while the agent chat
    // composer is focused). Quit the app with ⌘Q via the app menu above.
    let window_submenu = SubmenuBuilder::new(handle, "Window")
        .minimize()
        .maximize()
        .build()?;

    let menu = MenuBuilder::new(handle)
        .item(&app_submenu)
        .item(&edit_submenu)
        .item(&window_submenu)
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}

fn dispatch_toggle_command_palette(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // Child browser webviews can hold keyboard focus; pull it back so the
        // palette input can receive keystrokes after the toggle event.
        let _ = window.set_focus();
        let _ = window.eval(TOGGLE_COMMAND_PALETTE_JS);
    }
}

fn dispatch_focus_browser_address(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // Child browser webviews steal keyboard focus; pull it back to the shell
        // so the address-bar <input> can receive keystrokes.
        let _ = window.set_focus();
        let _ = window.eval(FOCUS_BROWSER_ADDRESS_JS);
    }
}

fn dispatch_select_all(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.eval(SELECT_ALL_JS);
    }
}

fn dispatch_toggle_content_view_mode(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.eval(TOGGLE_CONTENT_VIEW_MODE_JS);
    }
}

fn dispatch_force_content_preview(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.eval(FORCE_CONTENT_PREVIEW_JS);
    }
}

fn dispatch_title_rename(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.eval(TITLE_RENAME_JS);
    }
}

const EXTERNAL_OPEN_HREF_EVENT: &str = "external-open-href";
const OPEN_HREF_TMP: &str = "/tmp/backsteros-open-href";
const OPEN_HREF_HOME_REL: &str = ".config/backsteros/open-href";

fn read_open_href_trigger() -> Option<String> {
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    let home_path = home.map(|h| h.join(OPEN_HREF_HOME_REL));
    let raw = home_path
        .as_ref()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .or_else(|| std::fs::read_to_string(OPEN_HREF_TMP).ok())?;
    let stamp = raw.trim();
    if stamp.is_empty() {
        return None;
    }
    Some(stamp.to_string())
}

fn href_from_open_trigger(stamp: &str) -> Option<String> {
    for line in stamp.lines() {
        let href = line.trim();
        if href.starts_with('/') && !href.starts_with("//") {
            return Some(href.to_string());
        }
    }
    None
}

/// Dynamic Island writes `~/.config/backsteros/open-href` (and `/tmp/...`).
/// Navigate the main window to that in-app path.
fn start_external_open_href_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_stamp = String::new();
        // Seed so a leftover file from a previous session does not auto-navigate
        // on launch — only fresh writes after startup.
        if let Some(stamp) = read_open_href_trigger() {
            last_stamp = stamp;
        }
        eprintln!(
            "[desktop] watching external open-href → {OPEN_HREF_HOME_REL}, {OPEN_HREF_TMP}"
        );

        loop {
            std::thread::sleep(Duration::from_millis(200));
            let Some(stamp) = read_open_href_trigger() else {
                continue;
            };
            if stamp == last_stamp {
                continue;
            }
            last_stamp = stamp.clone();
            let Some(href) = href_from_open_trigger(&stamp) else {
                continue;
            };

            let Some(main) = app.get_webview_window("main") else {
                continue;
            };
            eprintln!("[desktop] external open-href → {href}");
            let _ = main.emit(EXTERNAL_OPEN_HREF_EVENT, &href);
            // Also drive client navigation directly in case the React listener
            // is not mounted yet (eval reaches the SPA router).
            let href_json = serde_json::to_string(&href).unwrap_or_else(|_| "\"/\"".into());
            let script = format!(
                "(function(href){{\
                  try {{\
                    if (typeof window.__BACKSTEROS_NAVIGATE__==='function') {{\
                      window.__BACKSTEROS_NAVIGATE__(href); return;\
                    }}\
                  }} catch (e) {{}}\
                  window.dispatchEvent(new CustomEvent('backsteros:external-open-href',{{detail:{{href:href}}}}));\
                }})({href_json});"
            );
            let _ = main.eval(&script);
            let _ = main.set_focus();
            let _ = focus_main_window(app.clone());
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            whoop::whoop_status,
            whoop::whoop_fetch_day,
            system_stats::system_stats,
            system_stats::set_system_stats_disk_path,
            cursor_usage::cursor_usage,
            hide_desktop_overlay,
            resize_desktop_overlay,
            focus_main_window,
            toggle_desktop_overlay_palette,
            toggle_desktop_overlay_compose,
        ])
        .on_menu_event(|app, event| {
            if event.id() == "command-palette" || event.id() == "command-palette-shift" {
                dispatch_toggle_command_palette(app);
            } else if event.id() == "browser-address" {
                dispatch_focus_browser_address(app);
            } else if event.id() == "select-all" {
                dispatch_select_all(app);
            } else if event.id() == "toggle-content-view-mode" {
                dispatch_toggle_content_view_mode(app);
            } else if event.id() == "force-content-preview" {
                dispatch_force_content_preview(app);
            } else if event.id() == "title-rename" {
                dispatch_title_rename(app);
            }
        })
        .setup(|app| {
            app.manage(OverlayState(Mutex::new(OverlayMode::None)));
            app.manage(system_stats::SystemStatsDiskPath(Mutex::new(
                std::env::var_os("HOME")
                    .or_else(|| std::env::var_os("USERPROFILE"))
                    .map(std::path::PathBuf::from)
                    .unwrap_or_else(|| std::path::PathBuf::from(".")),
            )));
            system_stats::start_system_stats_watch(app.handle().clone());

            install_app_menu(app)?;

            let handle = app.handle().clone();
            let config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .expect("tauri.conf.json must define a main window");

            let mut main_builder = WebviewWindowBuilder::from_config(app, &config)?;
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            {
                main_builder = main_builder.data_store_identifier(APP_WEBVIEW_DATA_STORE_ID);
            }
            // Prefer HTML5 drag/drop (letter PDF dropzone, agent image drop, etc.).
            // Tauri's native file-drop handler is mutually exclusive with DOM drops.
            main_builder = main_builder.disable_drag_drop_handler();
            main_builder
                .on_navigation(|url| allow_main_navigation(url))
                .on_new_window(move |url, _features| {
                    // Attachments / external links: open in the system browser.
                    let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                })
                .build()?;

            // Overlay webview is created on first palette/compose overlay
            // command — avoid a second SPA cold load during app setup.

            register_desktop_global_shortcuts(app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;

            start_external_open_href_watcher(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
