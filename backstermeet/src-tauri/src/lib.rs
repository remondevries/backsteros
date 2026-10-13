#[tauri::command]
fn set_traffic_light_position(
    window: tauri::WebviewWindow,
    x: f64,
    y: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSView, NSWindow, NSWindowButton};

        window
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

                let close_rect = NSView::frame(&close);
                let title_bar_height = close_rect.size.height + y;
                let mut title_bar_rect = NSView::frame(&title_bar);
                title_bar_rect.size.height = title_bar_height;
                title_bar_rect.origin.y = ns_window.frame().size.height - title_bar_height;
                title_bar.setFrame(title_bar_rect);

                let spacing = NSView::frame(&minimize).origin.x - close_rect.origin.x;
                let mut buttons = vec![close, minimize];
                if let Some(zoom) = zoom {
                    buttons.push(zoom);
                }
                for (index, button) in buttons.into_iter().enumerate() {
                    let mut origin = NSView::frame(&button).origin;
                    origin.x = x + index as f64 * spacing;
                    button.setFrameOrigin(origin);
                }
            })
            .map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (window, x, y);

    Ok(())
}

mod livekit_token;

#[tauri::command]
fn mint_livekit_host_token(
    meeting_id: Option<String>,
) -> Result<livekit_token::HostTokenResponse, String> {
    livekit_token::mint_host_token(meeting_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_traffic_light_position,
            mint_livekit_host_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
