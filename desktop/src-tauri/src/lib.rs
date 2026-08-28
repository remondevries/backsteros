mod agent_browser;
mod cursor_usage;
mod overlay;
mod system_stats;
mod whoop;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewWindowBuilder};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};
use tauri_plugin_opener::OpenerExt;

use overlay::{
    focus_main_window, hide_desktop_overlay, register_desktop_global_shortcuts,
    resize_desktop_overlay, toggle_desktop_overlay_compose, toggle_desktop_overlay_palette,
    OverlayMode, OverlayState,
};

static OAUTH_WINDOW_SEQ: AtomicU64 = AtomicU64::new(1);

/// Shared WKWebView data store for main + overlay (macOS 14+ / iOS 17+).
/// Without this, Tauri gives each window its own store — the overlay has no
/// Clerk session and renders black. Changing this value resets cookies /
/// IndexedDB for that store (one-time re-sign-in + PowerSync re-sync).
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

fn host_is_oauth_provider(host: &str) -> bool {
    host == "github.com"
        || host == "clerk.accounts.dev"
        || host == "accounts.dev"
        || host == "clerk.com"
        || host == "clerk.shared.lcl.dev"
        || host.ends_with(".github.com")
        || host.ends_with(".clerk.accounts.dev")
        || host.ends_with(".clerk.com")
        || host.ends_with(".accounts.dev")
        // Clerk development OAuth callback (shared): clerk.shared.lcl.dev
        || host.ends_with(".lcl.dev")
        || host == "accounts.google.com"
        || host.ends_with(".google.com")
        || host.ends_with(".microsoftonline.com")
        || host.ends_with(".apple.com")
}

fn url_is_oauth_navigation(url: &tauri::Url) -> bool {
    match url.scheme() {
        "about" => true, // Clerk may window.open("about:blank") then navigate
        "http" | "https" => url.host_str().is_some_and(host_is_oauth_provider),
        // Custom schemes (tauri://) — never silently cancel; GitHub's interstitial
        // hangs when WKWebView blocks the protocol hop back to the app.
        _ => true,
    }
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

/// GitHub's authorize interstitial ("You are being redirected…") often stalls in
/// the packaged WKWebView — the Continue link never fires. Auto-follow **only**
/// that exact GitHub page, once. Broader "redirecting" matching loops OAuth.
fn follow_github_oauth_interstitial(window: &tauri::WebviewWindow, url: &tauri::Url) {
    let Some(host) = url.host_str() else {
        return;
    };
    let on_github = host == "github.com" || host.ends_with(".github.com");
    if !on_github {
        return;
    }
    let script = r#"
      (function () {
        try {
          if (window.__backsterosFollowedGithubInterstitial) return;
          var text = (document.body && document.body.innerText) || "";
          if (!/you are being redirected to the authorized application/i.test(text)) {
            return;
          }
          var links = Array.prototype.slice.call(document.querySelectorAll("a[href]"));
          var preferred = links.find(function (a) {
            var href = a.href || "";
            return /clerk|oauth|callback|accounts\.dev|tauri\.localhost|tauri:\/\/|127\.0\.0\.1|localhost/i.test(href);
          }) || links.find(function (a) {
            return /continue/i.test((a.textContent || "").trim());
          });
          if (preferred && preferred.href) {
            window.__backsterosFollowedGithubInterstitial = true;
            window.location.replace(preferred.href);
          }
        } catch (e) {}
      })();
    "#;
    let _ = window.eval(script);
}

fn log_oauth(note: &str, url: &tauri::Url) {
    let line = format!("{note} {}\n", url.as_str());
    eprint!("[desktop-oauth] {line}");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/backsteros-oauth.log")
    {
        use std::io::Write;
        let _ = file.write_all(line.as_bytes());
    }
}

fn close_oauth_window_after(
    window: tauri::WebviewWindow,
    delay: Duration,
    notify_event: Option<&'static str>,
) {
    // Notify the main shell immediately so session recovery can start while the
    // popup is still alive (cookies + postMessage). Close after `delay`.
    if let Some(event_name) = notify_event {
        notify_main_event(&window.app_handle(), event_name);
    }
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        let _ = window.close();
    });
}

/// Ask the main shell to pick up work from the OAuth popup without remounting.
fn notify_main_event(app: &AppHandle, event_name: &str) {
    if let Some(main) = app.get_webview_window("main") {
        let script = format!(
            "window.dispatchEvent(new CustomEvent({}))",
            serde_json::to_string(event_name).unwrap_or_else(|_| "\"backsteros:oauth-complete\"".into())
        );
        let _ = main.eval(&script);
        let _ = main.set_focus();
    }
}

/// Clerk popup-callback URLs carry `__clerk_handshake` / `__clerk_db_jwt`.
/// Packaged Tauri often has no working `window.opener.postMessage`, so relay
/// those query params into the main shell for a local handshake reload.
fn clerk_oauth_handoff_query(url: &tauri::Url) -> Option<String> {
    let query = url.query()?;
    let mut kept: Vec<&str> = Vec::new();
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let key = pair.split('=').next().unwrap_or("");
        if key.starts_with("__clerk_") {
            kept.push(pair);
        }
    }
    if kept.is_empty() {
        None
    } else {
        Some(kept.join("&"))
    }
}

fn relay_clerk_handshake_to_main(app: &AppHandle, url: &tauri::Url) {
    let Some(query) = clerk_oauth_handoff_query(url) else {
        return;
    };
    log_oauth("handshake-relay", url);
    if let Some(main) = app.get_webview_window("main") {
        let script = format!(
            "window.dispatchEvent(new CustomEvent('backsteros:clerk-handshake', {{ detail: {{ query: {} }} }}))",
            serde_json::to_string(&query).unwrap_or_else(|_| "\"\"".into())
        );
        let _ = main.eval(&script);
        let _ = main.set_focus();
    }
}

fn path_and_hash(url: &tauri::Url) -> String {
    let mut value = url.path().to_ascii_lowercase();
    if let Some(fragment) = url.fragment() {
        value.push('#');
        value.push_str(&fragment.to_ascii_lowercase());
    }
    value
}

/// GitHub *account linking* return paths only — not Clerk sign-in `/sso-callback`.
fn is_github_connect_return(url: &tauri::Url) -> bool {
    let path = path_and_hash(url);
    path.contains("/oauth/popup-done") || path.contains("/settings/github")
}

fn is_sso_callback_return(url: &tauri::Url) -> bool {
    let path = path_and_hash(url);
    path.contains("sso-callback") || path.contains("sso_callback")
}

/// When the OAuth popup lands on the app origin without a callback route, the
/// full SPA mounts `<SignIn />` again and restarts OAuth → infinite redirect.
fn stop_oauth_spa_reentry(window: &tauri::WebviewWindow) {
    let _ = window.eval(
        r#"
      (function () {
        try {
          if (window.__backsterosOauthSpaStopped) return;
          window.__backsterosOauthSpaStopped = true;
          if (window.stop) window.stop();
          document.open();
          document.write(
            '<!doctype html><html><body style="margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#111;color:#eee">Completing sign-in…</body></html>'
          );
          document.close();
        } catch (e) {}
      })();
    "#,
    );
}

/// Keep the main shell on the app origin. Sign-in / GitHub connect must use
/// `window.open` (oauth popup) — never navigate the main webview to Clerk /
/// GitHub (that caused Clerk dashboard traps and redirect loops).
fn allow_main_navigation(url: &tauri::Url) -> bool {
    is_app_origin(url)
}

/// OAuth popup may hop GitHub → Clerk accounts → app (and custom `tauri://`).
/// Still block the Clerk *dashboard* so a mis-clicked link cannot trap the popup.
fn allow_oauth_window_navigation(url: &tauri::Url) -> bool {
    if is_app_origin(url) || url_is_oauth_navigation(url) {
        if let Some(host) = url.host_str() {
            let host = host.to_ascii_lowercase();
            if host == "dashboard.clerk.com"
                || host == "clerk.com"
                || host == "www.clerk.com"
            {
                return false;
            }
        }
        return true;
    }
    if let Some(host) = url.host_str() {
        if host == "www.githubstatus.com"
            || host == "githubstatus.com"
            || host == "www.recaptcha.net"
            || host == "recaptcha.net"
            || host.ends_with(".recaptcha.net")
            || host.ends_with(".gstatic.com")
        {
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
            close_oauth_windows,
            hide_desktop_overlay,
            resize_desktop_overlay,
            focus_main_window,
            toggle_desktop_overlay_palette,
            toggle_desktop_overlay_compose,
            agent_browser::agent_browser_create,
            agent_browser::agent_browser_set_bounds,
            agent_browser::agent_browser_show,
            agent_browser::agent_browser_hide,
            agent_browser::agent_browser_destroy,
            agent_browser::agent_browser_navigate,
            agent_browser::agent_browser_reload,
            agent_browser::agent_browser_go_back,
            agent_browser::agent_browser_go_forward,
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
                .on_new_window(move |url, features| {
                    // Clerk `oauthFlow="popup"` / GitHub connect uses window.open.
                    // Related WKWebView keeps cookies; without interstitial
                    // follow + custom-scheme navigation, packaged builds stall on
                    // GitHub's "You are being redirected…" page.
                    let label = format!(
                        "oauth-{}",
                        OAUTH_WINDOW_SEQ.fetch_add(1, Ordering::Relaxed)
                    );
                    let host = url.host_str().unwrap_or("");
                    let title = if host.is_empty() || host == "blank" {
                        "Sign in".to_string()
                    } else if host_is_oauth_provider(host) {
                        format!("Sign in — {host}")
                    } else {
                        "Sign in".to_string()
                    };

                    // Clerk WindowFeatures can be 0×0 / off-screen in embedded
                    // WebViews, which looks like "nothing happened".
                    let (width, height) = match features.size() {
                        Some(size) if size.width > 200.0 && size.height > 200.0 => {
                            (size.width, size.height)
                        }
                        _ => (520.0, 780.0),
                    };

                    let mut oauth_builder = WebviewWindowBuilder::new(
                        &handle,
                        &label,
                        WebviewUrl::External(url.clone()),
                    )
                    .window_features(features)
                    .title(title)
                    .inner_size(width, height)
                    .resizable(true)
                    .center()
                    .on_navigation(|nav_url| {
                        log_oauth("nav", nav_url);
                        allow_oauth_window_navigation(nav_url)
                    })
                    .on_page_load(|window, payload| {
                        if payload.event() != PageLoadEvent::Finished {
                            return;
                        }
                        let url = payload.url();
                        log_oauth("load", url);
                        if is_app_origin(url) {
                            if is_github_connect_return(url) {
                                close_oauth_window_after(
                                    window,
                                    Duration::from_millis(150),
                                    Some("backsteros:github-oauth-complete"),
                                );
                                return;
                            }
                            if is_sso_callback_return(url) {
                                // Sign-in SSO: let handleRedirectCallback finish.
                                close_oauth_window_after(
                                    window,
                                    Duration::from_millis(2500),
                                    Some("backsteros:oauth-complete"),
                                );
                                return;
                            }
                            // Bare app URL in the popup remounts <SignIn /> and
                            // restarts OAuth — that is the redirect loop.
                            stop_oauth_spa_reentry(&window);
                            close_oauth_window_after(
                                window,
                                Duration::from_millis(400),
                                Some("backsteros:oauth-complete"),
                            );
                            return;
                        }
                        follow_github_oauth_interstitial(&window, url);
                        if should_close_oauth_window(url) {
                            // Relay handshake params before touching the DOM —
                            // overwriting body used to kill Clerk's postMessage.
                            relay_clerk_handshake_to_main(&window.app_handle(), url);
                            let status_window = window.clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(Duration::from_millis(900));
                                let _ = status_window.eval(
                                    r#"
                                      try {
                                        if (!document.body) return;
                                        document.body.style.cssText = 'margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#111;color:#eee';
                                        document.body.textContent = 'Finishing sign-in…';
                                      } catch (e) {}
                                    "#,
                                );
                            });
                            close_oauth_window_after(
                                window,
                                Duration::from_millis(3200),
                                Some("backsteros:oauth-complete"),
                            );
                        }
                    });
                    // Same WKWebView data store as main so Clerk session cookies
                    // written during oauth_callback are visible to recovery.
                    #[cfg(any(target_os = "macos", target_os = "ios"))]
                    {
                        oauth_builder =
                            oauth_builder.data_store_identifier(APP_WEBVIEW_DATA_STORE_ID);
                    }
                    match oauth_builder.build()
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
