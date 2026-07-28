//! Child webviews for agent-surface Browser tabs.
//!
//! Separate from the main shell so google.com / arbitrary https can load as a
//! top-level guest without weakening main-window OAuth navigation lock-down.

use serde::Serialize;
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl,
};
use tauri_plugin_opener::OpenerExt;

pub const LOAD_EVENT: &str = "agent-browser:load";
pub const TITLE_EVENT: &str = "agent-browser:title";

const LABEL_PREFIX: &str = "agent-browser-";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadPayload {
    label: String,
    url: String,
    loading: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TitlePayload {
    label: String,
    title: String,
}

fn validate_label(label: &str) -> Result<(), String> {
    if !label.starts_with(LABEL_PREFIX) {
        return Err(format!(
            "browser webview label must start with `{LABEL_PREFIX}`"
        ));
    }
    if label
        .chars()
        .any(|c| !(c.is_ascii_alphanumeric() || matches!(c, '-' | '/' | ':' | '_')))
    {
        return Err("browser webview label has invalid characters".into());
    }
    Ok(())
}

fn allow_browser_navigation(url: &tauri::Url) -> bool {
    matches!(
        url.scheme(),
        "http" | "https" | "about" | "data" | "blob"
    )
}

fn parse_external_url(url: &str) -> Result<tauri::Url, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url is empty".into());
    }
    tauri::Url::parse(trimmed).map_err(|error| error.to_string())
}

fn get_browser_webview(
    app: &AppHandle,
    label: &str,
) -> Result<tauri::Webview<tauri::Wry>, String> {
    validate_label(label)?;
    app.get_webview(label)
        .ok_or_else(|| format!("browser webview `{label}` not found"))
}

fn build_browser_webview(
    app: &AppHandle,
    label: String,
    url: tauri::Url,
) -> WebviewBuilder<tauri::Wry> {
    let app_for_nav = app.clone();
    let label_for_load = label.clone();
    let label_for_title = label.clone();
    let label_for_popup = label.clone();

    WebviewBuilder::new(label, WebviewUrl::External(url))
        .on_navigation(|nav_url| allow_browser_navigation(nav_url))
        .on_page_load(move |webview, payload| {
            let loading = matches!(payload.event(), PageLoadEvent::Started);
            let url = payload.url().as_str().to_string();
            let _ = webview.app_handle().emit(
                LOAD_EVENT,
                LoadPayload {
                    label: label_for_load.clone(),
                    url,
                    loading,
                },
            );
        })
        .on_document_title_changed(move |webview, title| {
            let _ = webview.app_handle().emit(
                TITLE_EVENT,
                TitlePayload {
                    label: label_for_title.clone(),
                    title,
                },
            );
        })
        .on_new_window(move |popup_url, _features| {
            let href = popup_url.as_str();
            if let Err(error) = app_for_nav.opener().open_url(href, None::<&str>) {
                eprintln!(
                    "[desktop] agent-browser `{label_for_popup}` popup open failed: {error}"
                );
            }
            NewWindowResponse::Deny
        })
}

#[tauri::command]
pub async fn agent_browser_create(
    app: AppHandle,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    validate_label(&label)?;
    let parsed = parse_external_url(&url)?;
    let width = width.max(1.0);
    let height = height.max(1.0);

    if let Some(existing) = app.get_webview(&label) {
        existing
            .set_position(LogicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
        existing
            .set_size(LogicalSize::new(width, height))
            .map_err(|error| error.to_string())?;
        existing
            .navigate(parsed)
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    let window = app
        .get_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let builder = build_browser_webview(&app, label, parsed);
    window
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn agent_browser_set_bounds(
    app: AppHandle,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let webview = get_browser_webview(&app, &label)?;
    webview
        .set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    webview
        .set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn agent_browser_show(app: AppHandle, label: String) -> Result<(), String> {
    get_browser_webview(&app, &label)?
        .show()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn agent_browser_hide(app: AppHandle, label: String) -> Result<(), String> {
    get_browser_webview(&app, &label)?
        .hide()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn agent_browser_destroy(app: AppHandle, label: String) -> Result<(), String> {
    validate_label(&label)?;
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn agent_browser_navigate(
    app: AppHandle,
    label: String,
    url: String,
) -> Result<(), String> {
    let parsed = parse_external_url(&url)?;
    get_browser_webview(&app, &label)?
        .navigate(parsed)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn agent_browser_reload(app: AppHandle, label: String) -> Result<(), String> {
    get_browser_webview(&app, &label)?
        .reload()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn agent_browser_go_back(app: AppHandle, label: String) -> Result<(), String> {
    get_browser_webview(&app, &label)?
        .eval("history.back()")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn agent_browser_go_forward(app: AppHandle, label: String) -> Result<(), String> {
    get_browser_webview(&app, &label)?
        .eval("history.forward()")
        .map_err(|error| error.to_string())
}
