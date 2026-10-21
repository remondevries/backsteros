use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, TitleBarStyle,
    WebviewUrl, WindowEvent,
};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::window::Color;

/// Double-press window for ⌘Q (same idea as BacksterDev `QUIT_DOUBLE_PRESS_MS`).
const QUIT_DOUBLE_PRESS_MS: u64 = 500;

struct QuitArm {
    last_at: Option<Instant>,
}

impl Default for QuitArm {
    fn default() -> Self {
        Self { last_at: None }
    }
}

const CHROME_HEIGHT: f64 = 48.0;
/// Match BacksterOS `.content-frame` (margin 8px, radius 8px, 0.5px border).
const CONTENT_INSET: f64 = 8.0;
const CONTENT_BORDER: f64 = 0.5;
const CONTENT_RADIUS: f64 = 8.0;
const TRAFFIC_LIGHT_X: f64 = 16.0;
const CHROME_LABEL: &str = "chrome";
const DESIGN_LABEL: &str = "design";
const WINDOW_LABEL: &str = "main";

/// Timer menu rect in chrome CSS pixels (top-left origin), while the menu is open.
/// The Penpot webview gets a matching hole so the menu (drawn in chrome HTML)
/// shows through without lifting the whole chrome sheet.
#[derive(Clone, Copy)]
struct MenuHole {
    open: bool,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

static TIMER_MENU_HOLE: Mutex<MenuHole> = Mutex::new(MenuHole {
    open: false,
    x: 0.0,
    y: 0.0,
    width: 0.0,
    height: 0.0,
});

/// Design-view pointer plus the menu hole in that view's bounds (bottom-left).
/// `hitTest:` returns nil inside the hole so the click reaches the chrome webview.
#[cfg(target_os = "macos")]
#[derive(Clone, Copy)]
struct HitHole {
    view: usize,
    rect: objc2_foundation::NSRect,
}

#[cfg(target_os = "macos")]
static HIT_HOLE: Mutex<Option<HitHole>> = Mutex::new(None);

#[cfg(target_os = "macos")]
static HIT_TEST_ORIGINAL: AtomicUsize = AtomicUsize::new(0);

#[cfg(target_os = "macos")]
static HIT_TEST_HOOKED: AtomicBool = AtomicBool::new(false);

fn penpot_public_uri() -> String {
    std::env::var("PENPOT_PUBLIC_URI")
        .or_else(|_| std::env::var("VITE_PENPOT_PUBLIC_URI"))
        // Dev builds → local devenv; release builds → hosted fork.
        .unwrap_or_else(|_| {
            if cfg!(debug_assertions) {
                "https://localhost:3449".to_string()
            } else {
                "https://design.lemo-design.com".to_string()
            }
        })
        .trim_end_matches('/')
        .to_string()
}

fn penpot_frame_url() -> Result<url::Url, String> {
    let base = penpot_public_uri();
    let mut url = url::Url::parse(&base).map_err(|e| e.to_string())?;
    // Bust WKWebView HTTP cache so devenv cljs-runtime modules are not stale
    // after a shadow-cljs rebuild (dev only — release pins a fixed host build).
    let bust = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("tauri-desktop", "1");
        if cfg!(debug_assertions) {
            pairs.append_pair("_cb", &bust.to_string());
        }
    }
    Ok(url)
}

fn content_frame_rect(width: f64, height: f64, chrome_h: f64) -> (f64, f64, f64, f64) {
    // Sit inside the CSS border so the chrome webview's frame ring stays visible.
    let inset = CONTENT_INSET + CONTENT_BORDER;
    let x = inset;
    let y = chrome_h + inset;
    let w = (width - 2.0 * inset).max(0.0);
    let h = (height - chrome_h - 2.0 * inset).max(0.0);
    (x, y, w, h)
}

fn layout_webviews(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_window(WINDOW_LABEL)
        .ok_or_else(|| "main window missing".to_string())?;

    let factor = window.scale_factor().map_err(|e| e.to_string())?;
    let size = window
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(factor);

    let chrome_h = CHROME_HEIGHT.min(size.height);

    // Full-window chrome paints the tab strip + content-frame border/fill.
    if let Some(chrome) = app.get_webview(CHROME_LABEL) {
        chrome
            .set_position(LogicalPosition::new(0.0, 0.0))
            .map_err(|e| e.to_string())?;
        chrome
            .set_size(LogicalSize::new(size.width, size.height))
            .map_err(|e| e.to_string())?;
    }

    let (x, y, w, h) = content_frame_rect(size.width, size.height, chrome_h);
    if let Some(design) = app.get_webview(DESIGN_LABEL) {
        design
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        design
            .set_size(LogicalSize::new(w, h))
            .map_err(|e| e.to_string())?;
        apply_design_corner_radius(&design);
    }

    // AppKit resets traffic lights on layout / title changes — re-apply inset.
    let _ = apply_traffic_light_inset(app, TRAFFIC_LIGHT_X);
    let hole = TIMER_MENU_HOLE.lock().ok().and_then(|guard| {
        if guard.open {
            Some(*guard)
        } else {
            None
        }
    });
    if let Some(hole) = hole {
        let _ = apply_timer_menu_hole(app, &hole);
    }

    Ok(())
}

/// Cut a hole in the Penpot webview over the timer menu and let clicks fall
/// through to the chrome HTML underneath. Reordering the full chrome webview
/// flashes the content frame, so the dashboard view stays put.
fn apply_timer_menu_hole(app: &AppHandle, hole: &MenuHole) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let design = app
            .get_webview(DESIGN_LABEL)
            .ok_or_else(|| "design webview missing".to_string())?;
        let ptr = ns_view_ptr(&design)?;
        unsafe {
            punch_timer_menu_hole(&*ptr, hole);
        }
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (app, hole);

    Ok(())
}

#[cfg(target_os = "macos")]
fn ns_view_ptr(webview: &tauri::Webview) -> Result<*mut objc2_app_kit::NSView, String> {
    // `with_webview` wants a `'static + Send` closure, so the pointer rides
    // out in an `Arc`. It is only read on this thread, right after the call.
    let slot = std::sync::Arc::new(std::sync::Mutex::new(0usize));
    let slot_in = slot.clone();
    webview
        .with_webview(move |inner| {
            let ptr = inner.inner();
            if !ptr.is_null() {
                if let Ok(mut guard) = slot_in.lock() {
                    *guard = ptr as usize;
                }
            }
        })
        .map_err(|e| e.to_string())?;
    let value = slot
        .lock()
        .map_err(|e| e.to_string())
        .map(|guard| *guard)?;
    if value == 0 {
        return Err("native view missing".to_string());
    }
    Ok(value as *mut objc2_app_kit::NSView)
}

#[cfg(target_os = "macos")]
fn punch_timer_menu_hole(view: &objc2_app_kit::NSView, hole: &MenuHole) {
    use objc2_app_kit::NSView;
    use objc2_core_graphics::{CGPath, CGMutablePath};
    use objc2_quartz_core::{CALayer, CAShapeLayer};

    // Undo any prior full-hide experiment so Penpot stays visible.
    view.setHidden(false);
    view.setWantsLayer(true);
    let Some(layer) = view.layer() else {
        return;
    };
    let layer: &CALayer = &*layer;

    if !hole.open || hole.width < 8.0 || hole.height < 8.0 {
        if let Ok(mut guard) = HIT_HOLE.lock() {
            *guard = None;
        }
        unsafe {
            layer.setMask(None);
        }
        return;
    }

    let Some(window) = view.window() else {
        return;
    };
    let Some(content) = window.contentView() else {
        return;
    };
    // Room for the menu shadow + right-edge nav chevron (top-left origin).
    const PAD_X: f64 = 36.0;
    const PAD_TOP: f64 = 14.0;
    const PAD_BOTTOM: f64 = 40.0;
    let content_h = NSView::bounds(&content).size.height;
    let menu_in_content = objc2_foundation::NSRect {
        origin: objc2_foundation::NSPoint {
            x: hole.x - PAD_X,
            y: content_h - (hole.y - PAD_TOP) - (hole.height + PAD_TOP + PAD_BOTTOM),
        },
        size: objc2_foundation::NSSize {
            width: hole.width + PAD_X * 2.0,
            height: hole.height + PAD_TOP + PAD_BOTTOM,
        },
    };
    let local = view.convertRect_fromView(menu_in_content, Some(&content));
    let bounds = NSView::bounds(view);

    let full = CGMutablePath::new();
    let cut = CGMutablePath::new();
    unsafe {
        // NSRect is CGRect on macOS.
        CGMutablePath::add_rect(Some(&full), std::ptr::null(), bounds);
        CGMutablePath::add_rect(Some(&cut), std::ptr::null(), local);
    }
    let Some(path) = CGPath::new_copy_by_subtracting_path(Some(&full), Some(&cut), false) else {
        return;
    };

    let mask = CAShapeLayer::new();
    mask.setFrame(bounds);
    mask.setPath(Some(&path));
    unsafe {
        layer.setMask(Some(&mask));
    }
    if let Ok(mut guard) = HIT_HOLE.lock() {
        *guard = Some(HitHole {
            view: view as *const NSView as usize,
            rect: local,
        });
    }
    install_hit_test_hook(view);
}

#[cfg(target_os = "macos")]
fn install_hit_test_hook(view: &objc2_app_kit::NSView) {
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};

    if HIT_TEST_HOOKED.swap(true, Ordering::SeqCst) {
        return;
    }
    let any = unsafe { &*(view as *const objc2_app_kit::NSView as *const AnyObject) };
    let sel = Sel::register(c"hitTest:");
    let Some(method) = any.class().instance_method(sel) else {
        HIT_TEST_HOOKED.store(false, Ordering::SeqCst);
        return;
    };
    // Keep NSView's implementation. Add the hook only on this webview class
    // so other AppKit views keep the original hit test.
    let previous = method.implementation();
    HIT_TEST_ORIGINAL.store(previous as usize, Ordering::SeqCst);
    let hooked: Imp =
        unsafe { std::mem::transmute::<*const (), Imp>(hit_test_hook as *const ()) };
    let encoding = unsafe { objc2::ffi::method_getTypeEncoding(method) };
    let class = any.class() as *const AnyClass as *mut AnyClass;
    let added = unsafe { objc2::ffi::class_addMethod(class, sel, hooked, encoding) };
    if !added.as_bool() {
        HIT_TEST_HOOKED.store(false, Ordering::SeqCst);
    }
}

#[cfg(target_os = "macos")]
unsafe extern "C-unwind" fn hit_test_hook(
    this: *mut objc2::runtime::AnyObject,
    sel: objc2::runtime::Sel,
    point: objc2_foundation::NSPoint,
) -> *mut objc2::runtime::AnyObject {
    if hit_hole_contains(this, point) {
        return std::ptr::null_mut();
    }
    let original = HIT_TEST_ORIGINAL.load(Ordering::SeqCst);
    if original == 0 {
        return std::ptr::null_mut();
    }
    let original: unsafe extern "C-unwind" fn(
        *mut objc2::runtime::AnyObject,
        objc2::runtime::Sel,
        objc2_foundation::NSPoint,
    ) -> *mut objc2::runtime::AnyObject = std::mem::transmute(original);
    original(this, sel, point)
}

#[cfg(target_os = "macos")]
fn hit_hole_contains(this: *mut objc2::runtime::AnyObject, point: objc2_foundation::NSPoint) -> bool {
    use objc2_app_kit::NSView;

    let Some(hole) = HIT_HOLE.lock().ok().and_then(|guard| *guard) else {
        return false;
    };
    if hole.view != this as usize {
        return false;
    }
    let view = unsafe { &*(this as *const NSView) };
    let Some(parent) = (unsafe { view.superview() }) else {
        return false;
    };
    let local = view.convertPoint_fromView(point, Some(&parent));
    let rect = hole.rect;
    local.x >= rect.origin.x
        && local.y >= rect.origin.y
        && local.x < rect.origin.x + rect.size.width
        && local.y < rect.origin.y + rect.size.height
}

#[cfg(target_os = "macos")]
fn apply_design_corner_radius(design: &tauri::Webview) {
    use objc2_app_kit::NSView;
    use objc2_quartz_core::CALayer;

    let _ = design.with_webview(|webview| unsafe {
        let ptr = webview.inner();
        if ptr.is_null() {
            return;
        }
        let view: &NSView = &*(ptr as *const NSView);
        view.setWantsLayer(true);
        let Some(layer) = view.layer() else {
            return;
        };
        let layer: &CALayer = &*layer;
        // Inner radius so the 0.5px CSS border still reads as a clean ring.
        layer.setCornerRadius(CONTENT_RADIUS - CONTENT_BORDER);
        layer.setMasksToBounds(true);
    });
}

#[cfg(not(target_os = "macos"))]
fn apply_design_corner_radius(_design: &tauri::Webview) {}

fn create_shell(app: &AppHandle) -> Result<(), String> {
    if app.get_window(WINDOW_LABEL).is_some() {
        return Ok(());
    }

    let width = 1440.0;
    let height = 900.0;

    let window = tauri::window::WindowBuilder::new(app, WINDOW_LABEL)
        .title("BacksterDESIGN")
        .inner_size(width, height)
        .min_inner_size(960.0, 640.0)
        .resizable(true)
        .hidden_title(true)
        .title_bar_style(TitleBarStyle::Overlay)
        .background_color(Color(0x0a, 0x0a, 0x0a, 0xff))
        .build()
        .map_err(|e| e.to_string())?;

    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Resized(_) = event {
            let _ = layout_webviews(&handle);
        }
    });

    let chrome_h = CHROME_HEIGHT;
    let (dx, dy, dw, dh) = content_frame_rect(width, height, chrome_h);

    window
        .add_child(
            tauri::webview::WebviewBuilder::new(
                CHROME_LABEL,
                WebviewUrl::App("index.html".into()),
            )
            .background_color(Color(0x0a, 0x0a, 0x0a, 0xff)),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(width, height),
        )
        .map_err(|e| e.to_string())?;

    let design_url = penpot_frame_url()?;
    window
        .add_child(
            tauri::webview::WebviewBuilder::new(
                DESIGN_LABEL,
                WebviewUrl::External(design_url),
            )
            .initialization_script(include_str!("../scripts/design-init.js"))
            .background_color(Color(0x11, 0x11, 0x12, 0xff)),
            LogicalPosition::new(dx, dy),
            LogicalSize::new(dw, dh),
        )
        .map_err(|e| e.to_string())?;

    layout_webviews(app)?;
    let _ = apply_traffic_light_inset(app, TRAFFIC_LIGHT_X);
    let _ = app.emit("bd-design-ready", penpot_public_uri());
    Ok(())
}

fn apply_traffic_light_inset(app: &AppHandle, x: f64) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSView, NSWindow, NSWindowButton};

        let chrome = app
            .get_webview(CHROME_LABEL)
            .ok_or_else(|| "chrome webview missing".to_string())?;

        chrome
            .with_webview(move |webview| unsafe {
                let ns_window = &*(webview.ns_window() as *const NSWindow);
                let Some(close) =
                    ns_window.standardWindowButton(NSWindowButton::CloseButton)
                else {
                    return;
                };
                let Some(minimize) =
                    ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton)
                else {
                    return;
                };
                let zoom = ns_window.standardWindowButton(NSWindowButton::ZoomButton);
                let Some(close_superview) = close.superview() else {
                    return;
                };
                let Some(title_bar) = close_superview.superview() else {
                    return;
                };
                let Some(content) = ns_window.contentView() else {
                    return;
                };

                // Center the cluster in the black band above the rounded content.
                let content_top = CHROME_HEIGHT + CONTENT_INSET;
                let button_h = NSView::frame(&close).size.height;
                let title_bar_height = content_top.max(button_h);
                let mut title_bar_rect = NSView::frame(&title_bar);
                title_bar_rect.size.height = title_bar_height;
                title_bar_rect.origin.y = ns_window.frame().size.height - title_bar_height;
                title_bar.setFrame(title_bar_rect);

                let content_h = NSView::bounds(&content).size.height;
                let origin_from_top = (content_top - button_h) / 2.0;
                let origin_in_content = objc2_foundation::NSPoint {
                    x,
                    y: content_h - origin_from_top - button_h,
                };
                let local = close_superview.convertPoint_fromView(origin_in_content, Some(&content));

                let spacing = NSView::frame(&minimize).origin.x
                    - NSView::frame(&close).origin.x;
                let mut buttons = vec![close, minimize];
                if let Some(zoom) = zoom {
                    buttons.push(zoom);
                }
                for (index, button) in buttons.into_iter().enumerate() {
                    button.setFrameOrigin(objc2_foundation::NSPoint {
                        x: local.x + index as f64 * spacing,
                        y: local.y,
                    });
                }
            })
            .map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (app, x);

    Ok(())
}

#[tauri::command]
fn set_traffic_light_position(app: AppHandle, x: f64, y: Option<f64>) -> Result<(), String> {
    let _ = y;
    apply_traffic_light_inset(&app, x)
}

#[tauri::command]
fn mount_design_webview(app: AppHandle) -> Result<String, String> {
    create_shell(&app)?;
    layout_webviews(&app)?;
    Ok(penpot_public_uri())
}

#[tauri::command]
fn design_post_message(app: AppHandle, message: serde_json::Value) -> Result<(), String> {
    let webview = app
        .get_webview(DESIGN_LABEL)
        .ok_or_else(|| "design webview not mounted".to_string())?;
    let payload = serde_json::to_string(&message).map_err(|e| e.to_string())?;
    let script = format!("window.postMessage({payload}, '*');");
    webview.eval(&script).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_penpot_public_uri() -> String {
    penpot_public_uri()
}

#[tauri::command]
fn set_timer_menu_overlay(
    app: AppHandle,
    open: bool,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    let hole = MenuHole {
        open,
        x: x.unwrap_or(0.0),
        y: y.unwrap_or(0.0),
        width: width.unwrap_or(0.0),
        height: height.unwrap_or(0.0),
    };
    if let Ok(mut guard) = TIMER_MENU_HOLE.lock() {
        *guard = hole;
    }
    // Punch a click-through hole in the Penpot webview over the menu only —
    // keep the design content visible underneath.
    apply_timer_menu_hole(&app, &hole)
}

#[tauri::command]
fn reload_design_webview(app: AppHandle) -> Result<(), String> {
    let webview = app
        .get_webview(DESIGN_LABEL)
        .ok_or_else(|| "design webview not mounted".to_string())?;
    let url = penpot_frame_url()?;
    webview.navigate(url).map_err(|e| e.to_string())
}

fn backsteros_is_running() -> bool {
    std::process::Command::new("/usr/bin/pgrep")
        .args(["-x", "backsteros-desktop"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn focus_backsteros() {
    let _ = std::process::Command::new("/usr/bin/open")
        .args(["-a", "BacksterOS"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
}

fn write_open_href_trigger(href: &str) -> Result<(), String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let body = format!("{stamp}\n{href}\n");
    if let Some(home) = std::env::var_os("HOME") {
        let path = std::path::PathBuf::from(home).join(".config/backsteros/open-href");
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, &body).map_err(|e| e.to_string())?;
    }
    let _ = std::fs::write("/tmp/backsteros-open-href", &body);
    Ok(())
}

/// Ask BacksterOS to open an in-app path (`/projects/OS/tasks/os-111`).
/// Same trigger file BacksterDEV writes. Launches BacksterOS when it is closed;
/// a cold start seeds the current file and ignores it, so the path is written
/// again after the watcher is up.
#[tauri::command]
fn open_backsteros_href(href: String) -> Result<(), String> {
    let href = href.trim().to_string();
    if !href.starts_with('/') || href.starts_with("//") {
        return Err("href must be an in-app path".to_string());
    }
    if backsteros_is_running() {
        write_open_href_trigger(&href)?;
        focus_backsteros();
        return Ok(());
    }
    focus_backsteros();
    std::thread::spawn(move || {
        for _ in 0..50 {
            if backsteros_is_running() {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        // Watcher seeds whatever is on disk at launch. Write after that.
        std::thread::sleep(Duration::from_millis(1500));
        for wait in [0_u64, 2_000, 4_000] {
            if wait > 0 {
                std::thread::sleep(Duration::from_millis(wait));
            }
            let _ = write_open_href_trigger(&href);
        }
    });
    Ok(())
}

/// Dispatched when ⌘E / Ctrl+E fires. WKWebView swallows ⌘E while a text
/// field / CodeMirror is focused ("Use Selection for Find") unless the app
/// menu claims the accelerator — same approach as BacksterOS.
const TOGGLE_CONTENT_VIEW_MODE_JS: &str =
    "window.dispatchEvent(new CustomEvent('backsteros:toggle-content-view-mode'))";

/// Dispatched when ⌘P / Ctrl+P fires. WKWebView otherwise opens Print.
const FORCE_CONTENT_PREVIEW_JS: &str =
    "window.dispatchEvent(new CustomEvent('backsteros:force-content-preview'))";

/// Eval a script in the Penpot (design) webview where the React island lives.
fn eval_in_design(app: &AppHandle, script: &str) {
    if let Some(webview) = app.get_webview(DESIGN_LABEL) {
        let _ = webview.eval(script);
    }
}

fn dispatch_toggle_content_view_mode(app: &AppHandle) {
    eval_in_design(app, TOGGLE_CONTENT_VIEW_MODE_JS);
}

fn dispatch_force_content_preview(app: &AppHandle) {
    eval_in_design(app, FORCE_CONTENT_PREVIEW_JS);
}

/// Custom menu: no Close Window (its ⌘W must close file tabs, not the app).
/// Quit uses a custom item so ⌘Q can require a double press (BacksterDev).
fn install_app_menu(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();

    let quit_item = MenuItemBuilder::with_id("quit-app", "Quit BacksterDESIGN")
        .accelerator("CmdOrCtrl+Q")
        .build(handle)?;

    let app_submenu = SubmenuBuilder::new(handle, "BacksterDESIGN")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit_item)
        .build()?;

    let close_tab_item = MenuItemBuilder::with_id("close-tab", "Close Tab")
        .accelerator("CmdOrCtrl+W")
        .build(handle)?;

    // Claim ⌘E so WKWebView cannot swallow it as "Use Selection for Find"
    // while the markdown editor is focused (BacksterOS parity).
    let toggle_view_mode_item =
        MenuItemBuilder::with_id("toggle-content-view-mode", "Toggle Edit/Preview")
            .accelerator("CmdOrCtrl+E")
            .build(handle)?;

    // Claim ⌘P so WKWebView cannot open the system Print dialog.
    let force_preview_item =
        MenuItemBuilder::with_id("force-content-preview", "Preview")
            .accelerator("CmdOrCtrl+P")
            .build(handle)?;

    let edit_submenu = SubmenuBuilder::new(handle, "Edit")
        .item(&toggle_view_mode_item)
        .item(&force_preview_item)
        .separator()
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // Intentionally omit Close Window — default ⌘W would kill the window.
    let window_submenu = SubmenuBuilder::new(handle, "Window")
        .item(&close_tab_item)
        .separator()
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

fn handle_quit_shortcut(app: &AppHandle, arm: &Mutex<QuitArm>) {
    let now = Instant::now();
    let mut guard = match arm.lock() {
        Ok(g) => g,
        Err(_) => {
            app.exit(0);
            return;
        }
    };
    if let Some(prev) = guard.last_at {
        if now.duration_since(prev) <= Duration::from_millis(QUIT_DOUBLE_PRESS_MS) {
            guard.last_at = None;
            drop(guard);
            app.exit(0);
            return;
        }
    }
    guard.last_at = Some(now);
    drop(guard);
    let _ = app.emit("bd-quit-armed", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(QuitArm::default()))
        .setup(|app| {
            install_app_menu(app)?;
            create_shell(app.handle())?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "close-tab" => {
                    let _ = app.emit("bd-close-active-tab", ());
                }
                "quit-app" => {
                    let arm = app.state::<Mutex<QuitArm>>();
                    handle_quit_shortcut(app, &arm);
                }
                "toggle-content-view-mode" => {
                    dispatch_toggle_content_view_mode(app);
                }
                "force-content-preview" => {
                    dispatch_force_content_preview(app);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_traffic_light_position,
            mount_design_webview,
            design_post_message,
            get_penpot_public_uri,
            reload_design_webview,
            set_timer_menu_overlay,
            open_backsteros_href,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
