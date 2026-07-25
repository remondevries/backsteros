//! Thin Tauri shell: native window → local Next.js development console.
//! Opens immediately on a local splash page; starts PTY + Next in the background.
//! Clerk OAuth popups need an `on_new_window` handler (WKWebView otherwise
//! returns null from window.open).

use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use tauri::webview::{NewWindowFeatures, NewWindowResponse, PageLoadEvent, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, TitleBarStyle, WebviewUrl};
use tauri_plugin_opener::OpenerExt;

const CONSOLE_PORT: u16 = 3100;
const CONSOLE_URL: &str = "http://127.0.0.1:3100";

static OAUTH_WINDOW_SEQ: AtomicU64 = AtomicU64::new(1);

fn development_root() -> PathBuf {
    if let Ok(dir) = std::env::var("BACKSTEROS_DEVELOPMENT_DIR") {
        return PathBuf::from(dir);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn launch_script() -> PathBuf {
    development_root().join("scripts/launch-console-app.sh")
}

fn console_ready() -> bool {
    Command::new("curl")
        .args(["-sf", "-o", "/dev/null", "--max-time", "2", CONSOLE_URL])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn set_splash_status(window: &tauri::WebviewWindow, message: &str) {
    let script = format!(
        "window.__setStatus && window.__setStatus({});",
        serde_json::to_string(message).unwrap_or_else(|_| "\"Starting…\"".into())
    );
    let _ = window.eval(&script);
}

fn ensure_console_services() -> Result<(), String> {
    if console_ready() {
        eprintln!("[development] Next already up at {CONSOLE_URL}");
        return Ok(());
    }

    let script = launch_script();
    if !script.is_file() {
        return Err(format!(
            "Launch script missing at {} — set BACKSTEROS_DEVELOPMENT_DIR",
            script.display()
        ));
    }

    eprintln!("[development] Starting PTY + Next via {}", script.display());
    let mut cmd = Command::new("bash");
    cmd.arg(&script)
        .env("CONSOLE_APP_BROWSER", "none")
        .env("PORT", CONSOLE_PORT.to_string())
        .current_dir(development_root());
    if cfg!(debug_assertions) {
        cmd.env("CONSOLE_USE_DEV", "1");
    }
    let status = cmd
        .status()
        .map_err(|error| format!("Failed to run launch script: {error}"))?;

    if !status.success() {
        return Err(format!("Launch script exited with {status}"));
    }

    for _ in 0..30 {
        if console_ready() {
            eprintln!("[development] Ready at {CONSOLE_URL}");
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err(format!("Timed out waiting for {CONSOLE_URL}"))
}

fn open_console_when_ready(app: tauri::AppHandle) {
    thread::spawn(move || {
        let Some(window) = app.get_webview_window("main") else {
            return;
        };

        if console_ready() {
            if let Ok(url) = CONSOLE_URL.parse() {
                let _ = window.navigate(url);
            }
            return;
        }

        set_splash_status(&window, "Starting PTY and Next.js…");
        match ensure_console_services() {
            Ok(()) => {
                set_splash_status(&window, "Opening console…");
                if let Ok(url) = CONSOLE_URL.parse() {
                    let _ = window.navigate(url);
                }
            }
            Err(error) => {
                eprintln!("[development] {error}");
                set_splash_status(
                    &window,
                    &format!("{error}. Check logs in .console-app/"),
                );
            }
        }
    });
}

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
        || host.ends_with(".accounts.dev")
        || host == "accounts.google.com"
        || host.ends_with(".google.com")
        || host.ends_with(".microsoftonline.com")
        || host.ends_with(".apple.com")
}

fn url_is_oauth_navigation(url: &tauri::Url) -> bool {
    match url.scheme() {
        "about" => true, // Clerk may window.open("about:blank") then navigate
        "http" | "https" => url
            .host_str()
            .is_some_and(host_is_oauth_provider),
        _ => false,
    }
}

fn should_close_oauth_window(url: &tauri::Url) -> bool {
    let path = url.path().to_ascii_lowercase();
    path.contains("popup-callback")
        || path.contains("popup_callback")
        || path.contains("popup_auth_callback")
}

fn close_oauth_window_soon(window: tauri::WebviewWindow) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(450));
        let _ = window.close();
    });
}

fn relay_oauth_callback_to_main(app: &AppHandle, url: &tauri::Url) {
    if let Some(main) = app.get_webview_window("main") {
        if let Err(error) = main.navigate(url.clone()) {
            eprintln!("[development] failed to relay OAuth callback to main: {error}");
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

fn allow_main_navigation(url: &tauri::Url) -> bool {
    if is_app_origin(url) {
        return true;
    }
    // Clerk Sign-In often falls back to a same-window redirect when the popup
    // path fails (common in release WKWebView). Allow the OAuth hop so GitHub
    // login is not silently cancelled.
    if url_is_oauth_navigation(url) {
        return true;
    }
    false
}

fn allow_oauth_window_navigation(url: &tauri::Url) -> bool {
    is_app_origin(url) || url_is_oauth_navigation(url)
}

fn open_oauth_window(
    handle: &AppHandle,
    url: &tauri::Url,
    features: NewWindowFeatures,
) -> Result<tauri::WebviewWindow, tauri::Error> {
    let label = format!(
        "oauth-{}",
        OAUTH_WINDOW_SEQ.fetch_add(1, Ordering::Relaxed)
    );
    let host = url.host_str().unwrap_or("");
    let title = if host.is_empty() || host == "blank" {
        "Sign in".to_string()
    } else {
        format!("Sign in — {host}")
    };

    // Prefer a predictable size: Clerk's WindowFeatures can be 0×0 /
    // off-screen in embedded WebViews, which looks like "nothing happened".
    let (width, height) = match features.size() {
        Some(size) if size.width > 200.0 && size.height > 200.0 => (size.width, size.height),
        _ => (520.0, 780.0),
    };

    // window_features is required on macOS so the new WKWebView shares the
    // opener's configuration (cookies / related browsing context).
    WebviewWindowBuilder::new(handle, &label, WebviewUrl::External(url.clone()))
        .window_features(features)
        .title(title)
        .inner_size(width, height)
        .resizable(true)
        .center()
        .on_navigation(|nav_url| allow_oauth_window_navigation(nav_url))
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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .expect("tauri.conf.json must define a main window");

            // from_config reads Overlay/hiddenTitle from tauri.conf.json; re-apply
            // explicitly so the native title string never shows after splash → Next.
            #[cfg(target_os = "macos")]
            let builder = WebviewWindowBuilder::from_config(app, &config)?
                .title_bar_style(TitleBarStyle::Overlay)
                .hidden_title(true)
                .disable_drag_drop_handler();
            #[cfg(not(target_os = "macos"))]
            let builder =
                WebviewWindowBuilder::from_config(app, &config)?.disable_drag_drop_handler();

            let main_window = builder
                .on_navigation(|url| allow_main_navigation(url))
                .on_page_load(|window, payload| {
                    if payload.event() != PageLoadEvent::Finished {
                        return;
                    }
                    #[cfg(target_os = "macos")]
                    {
                        let _ = window.set_title_bar_style(TitleBarStyle::Overlay);
                        let _ = window.set_title("");
                    }
                })
                .on_new_window(move |url, features| {
                    // Clerk / GitHub OAuth uses window.open. Build a related
                    // webview so opener/postMessage keep working through the IdP.
                    if !(url_is_oauth_navigation(&url) || is_app_origin(&url)) {
                        eprintln!(
                            "[development] denying non-OAuth new window: {}",
                            url.as_str()
                        );
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                        return NewWindowResponse::Deny;
                    }

                    match open_oauth_window(&handle, &url, features) {
                        Ok(window) => NewWindowResponse::Create { window },
                        Err(error) => {
                            eprintln!("[development] failed to open OAuth window: {error}");
                            let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                            NewWindowResponse::Deny
                        }
                    }
                })
                .build()?;

            #[cfg(target_os = "macos")]
            {
                let _ = main_window.set_title_bar_style(TitleBarStyle::Overlay);
                let _ = main_window.set_title("");
            }

            open_console_when_ready(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Development ADE");
}
