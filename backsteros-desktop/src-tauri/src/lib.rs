mod overlay;
mod whoop;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, WebviewUrl};
use tauri_plugin_opener::OpenerExt;

use overlay::{
    create_overlay_window, focus_main_window, hide_desktop_overlay, register_desktop_global_shortcuts,
    resize_desktop_overlay, toggle_desktop_overlay_compose, toggle_desktop_overlay_palette,
    OverlayMode, OverlayState,
};

static OAUTH_WINDOW_SEQ: AtomicU64 = AtomicU64::new(1);

/// Dispatched into the webview when the native ⌘K / Ctrl+K menu accelerator fires.
/// WKWebView on macOS often swallows Cmd+K before JS `keydown` listeners see it.
const TOGGLE_COMMAND_PALETTE_JS: &str =
    "window.dispatchEvent(new CustomEvent('backsteros:toggle-command-palette'))";

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

fn host_is_oauth_provider(host: &str) -> bool {
    host == "github.com"
        || host.ends_with(".github.com")
        || host.ends_with(".clerk.accounts.dev")
        || host.ends_with(".clerk.com")
        || host == "accounts.google.com"
        || host.ends_with(".google.com")
        || host.ends_with(".microsoftonline.com")
        || host.ends_with(".apple.com")
}

/// Clerk finishes popup OAuth on an accounts `popup-callback` page (postMessage
/// then `window.close()`). WKWebView often ignores `window.close()`, so we close
/// the Tauri window ourselves once that page loads.
///
/// App-origin loads are handled separately: relay the URL into the main shell
/// first (SSO / hash callbacks), then close — do not discard them here.
fn should_close_oauth_window(url: &tauri::Url) -> bool {
    let path = url.path().to_ascii_lowercase();
    path.contains("popup-callback")
        || path.contains("popup_callback")
        || path.contains("popup_auth_callback")
}

fn close_oauth_window_soon(window: tauri::WebviewWindow) {
    // Let Clerk's popup-callback postMessage the session to the opener first.
    // Use a background thread — we don't depend on the tokio crate directly.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(450));
        let _ = window.close();
    });
}

/// When Clerk finishes OAuth by navigating the popup to the app origin (e.g.
/// `https://tauri.localhost/#/sso-callback`), hand that URL to the main shell
/// so hash/SSO callbacks are not lost, then close the popup.
fn relay_oauth_callback_to_main(app: &AppHandle, url: &tauri::Url) {
    if let Some(main) = app.get_webview_window("main") {
        if let Err(error) = main.navigate(url.clone()) {
            eprintln!("[desktop] failed to relay OAuth callback to main: {error}");
            let href = url.as_str();
            let script = format!(
                "window.location.replace({})",
                serde_json::to_string(href).unwrap_or_else(|_| "\"/\"".into())
            );
            let _ = main.eval(&script);
        }
        let _ = main.set_focus();
    }
}

/// Keep the main shell on the app origin. Clerk OAuth should use window.open
/// (see on_new_window). Accidental full-page redirects to IdPs are blocked so
/// the desktop UI is not replaced by GitHub / Google.
fn allow_main_navigation(url: &tauri::Url) -> bool {
    if is_app_origin(url) {
        return true;
    }
    // Allow Clerk frontend API / accounts hosts so hash SSO callbacks can finish
    // if a flow falls back to same-window redirect.
    if let Some(host) = url.host_str() {
        if host.ends_with(".clerk.accounts.dev") || host.ends_with(".clerk.com") {
            return true;
        }
    }
    false
}

#[tauri::command]
fn close_oauth_windows(app: AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with("oauth-") {
            let _ = window.close();
        }
    }
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

    let edit_submenu = SubmenuBuilder::new(handle, "Edit")
        .item(&search_item)
        .separator()
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_submenu = SubmenuBuilder::new(handle, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
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
        let _ = window.eval(TOGGLE_COMMAND_PALETTE_JS);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            whoop::whoop_status,
            whoop::whoop_fetch_day,
            close_oauth_windows,
            hide_desktop_overlay,
            resize_desktop_overlay,
            focus_main_window,
            toggle_desktop_overlay_palette,
            toggle_desktop_overlay_compose,
        ])
        .on_menu_event(|app, event| {
            if event.id() == "command-palette" {
                dispatch_toggle_command_palette(app);
            }
        })
        .setup(|app| {
            app.manage(OverlayState(Mutex::new(OverlayMode::None)));

            install_app_menu(app)?;

            let handle = app.handle().clone();
            let config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .expect("tauri.conf.json must define a main window");

            WebviewWindowBuilder::from_config(app, &config)?
                .on_navigation(|url| allow_main_navigation(url))
                .on_new_window(move |url, features| {
                    // Clerk `oauthFlow="popup"` uses window.open. Build a related
                    // webview window so opener/postMessage keep working through
                    // GitHub (or other IdP) and back to Clerk.
                    let label = format!(
                        "oauth-{}",
                        OAUTH_WINDOW_SEQ.fetch_add(1, Ordering::Relaxed)
                    );
                    let host = url.host_str().unwrap_or("OAuth");
                    let title = if host_is_oauth_provider(host)
                        || host.ends_with(".clerk.accounts.dev")
                        || host.ends_with(".clerk.com")
                    {
                        format!("Sign in — {host}")
                    } else {
                        "Sign in".to_string()
                    };

                    match WebviewWindowBuilder::new(
                        &handle,
                        &label,
                        WebviewUrl::External(url.clone()),
                    )
                    .window_features(features)
                    .title(title)
                    .inner_size(520.0, 780.0)
                    .resizable(true)
                    .center()
                    .on_page_load(|window, payload| {
                        if payload.event() != PageLoadEvent::Finished {
                            return;
                        }
                        let url = payload.url();
                        if is_app_origin(url) {
                            relay_oauth_callback_to_main(&window.app_handle(), url);
                            close_oauth_window_soon(window);
                            return;
                        }
                        if should_close_oauth_window(url) {
                            close_oauth_window_soon(window);
                        }
                    })
                    .build()
                    {
                        Ok(window) => NewWindowResponse::Create { window },
                        Err(error) => {
                            eprintln!("[desktop] failed to open OAuth window: {error}");
                            let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                            NewWindowResponse::Deny
                        }
                    }
                })
                .build()?;

            create_overlay_window(app)
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;

            register_desktop_global_shortcuts(app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
