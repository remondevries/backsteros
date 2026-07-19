//! Spotlight-style overlay window (⌘⌥K palette, ⌘⌥C compose).

use std::sync::Mutex;

use tauri::{
    App, AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri::window::Color;

pub const OVERLAY_PALETTE_PATH: &str = "/desktop-overlay/palette";
pub const OVERLAY_COMPOSE_PATH: &str = "/desktop-overlay/compose";
const OVERLAY_WIDTH: f64 = 672.0;
const OVERLAY_HEIGHT_MIN: f64 = 120.0;
const OVERLAY_HEIGHT_PALETTE_INITIAL: f64 = 280.0;
const OVERLAY_HEIGHT_PALETTE_MAX: f64 = 520.0;
const OVERLAY_HEIGHT_COMPOSE_INITIAL: f64 = 320.0;
const OVERLAY_HEIGHT_COMPOSE_MAX: f64 = 620.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OverlayMode {
    None,
    Palette,
    Compose,
}

pub struct OverlayState(pub Mutex<OverlayMode>);

fn show_overlay_window(app: &AppHandle, overlay: &WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;

        if let Ok(panel) = app.get_webview_panel("overlay") {
            panel.show();
            return Ok(());
        }
    }

    overlay.show().map_err(|error| error.to_string())?;
    overlay.set_focus().map_err(|error| error.to_string())
}

fn hide_overlay_window(app: &AppHandle, overlay: &WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::ManagerExt;

        if let Ok(panel) = app.get_webview_panel("overlay") {
            panel.order_out(None);
            return Ok(());
        }
    }

    overlay.hide().map_err(|error| error.to_string())
}

fn app_web_base_url(app: &AppHandle) -> Result<String, String> {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        return Ok("http://localhost:1420".to_string());
    }

    #[cfg(not(debug_assertions))]
    {
        if let Some(main) = app.get_webview_window("main") {
            if let Ok(url) = main.url() {
                let host = url.host_str().unwrap_or("localhost");
                let port = url
                    .port()
                    .map(|port| format!(":{port}"))
                    .unwrap_or_default();
                return Ok(format!("{}://{host}{port}", url.scheme()));
            }
        }
        Ok("tauri://localhost".to_string())
    }
}

fn parse_app_url(base: &str, path: &str) -> Result<tauri::Url, String> {
    tauri::Url::parse(&format!("{base}{path}")).map_err(|error| error.to_string())
}

fn center_overlay_window(
    overlay: &WebviewWindow,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let monitor = overlay
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| overlay.primary_monitor().ok().flatten())
        .ok_or("Could not determine the active monitor for the overlay")?;

    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let scale = monitor.scale_factor();

    let width_px = width * scale;
    let height_px = height * scale;
    let x = monitor_pos.x as f64 + ((monitor_size.width as f64 - width_px) / 2.0);
    let y = monitor_pos.y as f64 + ((monitor_size.height as f64 - height_px) / 4.0);

    overlay
        .set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn overlay_height_for_mode(mode: OverlayMode) -> f64 {
    match mode {
        OverlayMode::Compose => OVERLAY_HEIGHT_COMPOSE_INITIAL,
        OverlayMode::Palette => OVERLAY_HEIGHT_PALETTE_INITIAL,
        OverlayMode::None => OVERLAY_HEIGHT_MIN,
    }
}

fn overlay_height_max_for_mode(mode: OverlayMode) -> f64 {
    match mode {
        OverlayMode::Compose => OVERLAY_HEIGHT_COMPOSE_MAX,
        OverlayMode::Palette | OverlayMode::None => OVERLAY_HEIGHT_PALETTE_MAX,
    }
}

fn layout_overlay_window(overlay: &WebviewWindow, mode: OverlayMode) -> Result<(), String> {
    use tauri::LogicalSize;

    let height = overlay_height_for_mode(mode);
    overlay
        .set_size(LogicalSize::new(OVERLAY_WIDTH, height))
        .map_err(|error| error.to_string())?;

    center_overlay_window(overlay, OVERLAY_WIDTH, height)
}

fn layout_overlay_window_with_height(
    overlay: &WebviewWindow,
    height: f64,
) -> Result<(), String> {
    use tauri::LogicalSize;

    overlay
        .set_size(LogicalSize::new(OVERLAY_WIDTH, height))
        .map_err(|error| error.to_string())?;

    center_overlay_window(overlay, OVERLAY_WIDTH, height)
}

/// Swizzles the overlay into a non-activating NSPanel (Spotlight-style).
#[cfg(target_os = "macos")]
fn convert_overlay_to_panel(overlay: &WebviewWindow) -> Result<(), String> {
    use tauri_nspanel::WebviewWindowExt;

    #[allow(non_upper_case_globals)]
    const NS_WINDOW_STYLE_MASK_NONACTIVATING_PANEL: i32 = 1 << 7;

    let panel = overlay
        .to_panel()
        .map_err(|_| "Failed to convert overlay window to an NSPanel".to_string())?;
    panel.set_style_mask(NS_WINDOW_STYLE_MASK_NONACTIVATING_PANEL);

    Ok(())
}

fn main_window_context_path(app: &AppHandle) -> Option<String> {
    let main = app.get_webview_window("main")?;
    let url = main.url().ok()?;
    let path = url.path().to_string();

    if path.starts_with("/desktop-overlay") {
        return None;
    }

    if path.is_empty() {
        return Some("/".to_string());
    }

    Some(path)
}

fn overlay_url_with_context(
    base: &str,
    overlay_path: &str,
    context_path: Option<String>,
) -> Result<tauri::Url, String> {
    let mut url = parse_app_url(base, overlay_path)?;

    if let Some(context) = context_path {
        url.query_pairs_mut().append_pair("ctx", &context);
    }

    Ok(url)
}

/// Ask the overlay SPA to switch route / ctx without a full webview reload
/// (avoids remounting Clerk and flashing the loading screen).
fn push_overlay_frontend_route(
    overlay: &WebviewWindow,
    path: &str,
    ctx: Option<String>,
) -> Result<(), String> {
    let path_json = serde_json::to_string(path).map_err(|error| error.to_string())?;
    let ctx_json =
        serde_json::to_string(ctx.as_deref().unwrap_or("/")).map_err(|error| error.to_string())?;
    let script = format!(
        "window.dispatchEvent(new CustomEvent('backsteros:desktop-overlay-show',{{detail:{{path:{path_json},ctx:{ctx_json}}}}}));"
    );
    overlay.eval(&script).map_err(|error| error.to_string())
}

fn show_desktop_overlay(app: &AppHandle, mode: OverlayMode, path: &str) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or("BacksterOS overlay window is missing")?;

    let state = app.state::<OverlayState>();
    let visible = overlay.is_visible().unwrap_or(false);
    let current_mode = *state.0.lock().expect("overlay state lock");

    if visible && current_mode == mode {
        hide_overlay_window(app, &overlay)?;
        *state.0.lock().expect("overlay state lock") = OverlayMode::None;
        return Ok(());
    }

    let base_url = app_web_base_url(app)?;
    let ctx = main_window_context_path(app);
    let current_url = overlay.url().ok();
    let current_path = current_url.as_ref().map(|url| url.path().to_string());
    let already_on_overlay = current_path
        .as_ref()
        .is_some_and(|path| path.starts_with("/desktop-overlay"));

    if already_on_overlay {
        // Client-side route change — keep the React/Clerk tree alive.
        push_overlay_frontend_route(&overlay, path, ctx)?;
    } else {
        // Cold load only (should be rare after create_overlay_window).
        let target_url = overlay_url_with_context(&base_url, path, ctx)?;
        overlay
            .navigate(target_url)
            .map_err(|error| error.to_string())?;
    }

    *state.0.lock().expect("overlay state lock") = mode;

    layout_overlay_window(&overlay, mode)?;
    show_overlay_window(app, &overlay)?;

    Ok(())
}

pub fn create_overlay_window(app: &App) -> Result<(), String> {
    let base_url = app_web_base_url(app.handle())?;
    let url = parse_app_url(&base_url, OVERLAY_PALETTE_PATH)?;
    let builder = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::External(url))
        .title("")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .visible(false)
        .skip_taskbar(true)
        .focused(false)
        .resizable(false)
        .shadow(false)
        .visible_on_all_workspaces(true)
        .background_color(Color(0, 0, 0, 0))
        .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT_MIN)
        .center();

    builder.build().map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    {
        let overlay = app
            .get_webview_window("overlay")
            .ok_or("Overlay window missing after build")?;
        convert_overlay_to_panel(&overlay)?;
    }

    Ok(())
}

pub fn register_desktop_global_shortcuts(
    app: &AppHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    let palette_shortcut =
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyK);
    let compose_shortcut =
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyC);

    app.plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

    app.global_shortcut()
        .on_shortcut(palette_shortcut, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            let handle = app.clone();
            let handle_for_main = app.clone();
            let _ = handle.run_on_main_thread(move || {
                let _ = show_desktop_overlay(
                    &handle_for_main,
                    OverlayMode::Palette,
                    OVERLAY_PALETTE_PATH,
                );
            });
        })?;

    app.global_shortcut()
        .on_shortcut(compose_shortcut, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            let handle = app.clone();
            let handle_for_main = app.clone();
            let _ = handle.run_on_main_thread(move || {
                let _ = show_desktop_overlay(
                    &handle_for_main,
                    OverlayMode::Compose,
                    OVERLAY_COMPOSE_PATH,
                );
            });
        })?;

    Ok(())
}

#[tauri::command]
pub fn resize_desktop_overlay(app: AppHandle, height: f64) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or("BacksterOS overlay window is missing")?;

    let mode = *app
        .state::<OverlayState>()
        .0
        .lock()
        .expect("overlay state lock");

    let max_height = overlay_height_max_for_mode(mode);
    let clamped_height = height.clamp(OVERLAY_HEIGHT_MIN, max_height);

    layout_overlay_window_with_height(&overlay, clamped_height)
}

#[tauri::command]
pub fn hide_desktop_overlay(app: AppHandle) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or("BacksterOS overlay window is missing")?;

    hide_overlay_window(&app, &overlay)?;
    *app
        .state::<OverlayState>()
        .0
        .lock()
        .expect("overlay state lock") = OverlayMode::None;

    Ok(())
}

#[tauri::command]
pub fn focus_main_window(app: AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or("BacksterOS main window is missing")?;

    let handle = app.clone();
    handle
        .run_on_main_thread(move || {
            #[cfg(target_os = "macos")]
            {
                use objc2::MainThreadMarker;
                use objc2_app_kit::NSApplication;

                if let Some(mtm) = MainThreadMarker::new() {
                    let ns_app = NSApplication::sharedApplication(mtm);
                    #[allow(deprecated)]
                    ns_app.activateIgnoringOtherApps(true);
                }
            }

            let _ = main.unminimize();
            let _ = main.show();
            let _ = main.set_focus();
        })
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn toggle_desktop_overlay_palette(app: AppHandle) -> Result<(), String> {
    show_desktop_overlay(&app, OverlayMode::Palette, OVERLAY_PALETTE_PATH)
}

#[tauri::command]
pub fn toggle_desktop_overlay_compose(app: AppHandle) -> Result<(), String> {
    show_desktop_overlay(&app, OverlayMode::Compose, OVERLAY_COMPOSE_PATH)
}
