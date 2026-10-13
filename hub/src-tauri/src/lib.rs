mod services;
mod status_icons;

use services::{
    clear_all_transitions, clear_desktop_cancel, clear_mobile_cancel, clear_starting,
    clear_stopping, desktop_cancel_requested, desktop_phase, mark_starting, mark_stopping,
    mobile_cancel_requested, probe, request_desktop_cancel, request_mobile_cancel,
    resolve_repo_root, save_default_config_if_missing, start_all_with_progress, start_service,
    stop_all_with_progress, stop_service, ServiceId, ServicePhase,
};
use status_icons::native_status_icon;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{IconMenuItem, Menu, NativeIcon, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, RunEvent,
};

const TRAY_ID: &str = "backsteros-hub";

struct HubState {
    repo_root: std::path::PathBuf,
    /// Kept alive for the app lifetime — never replace / drop the tray menu (muda UAF).
    _menu: Menu<tauri::Wry>,
    desktop_item: IconMenuItem<tauri::Wry>,
    mobile_item: IconMenuItem<tauri::Wry>,
}

/// Desktop (Docker + API + PTY) busy flag — does not block Mobile.
static DESKTOP_BUSY: AtomicBool = AtomicBool::new(false);
/// Mobile busy flag — does not block Desktop.
static MOBILE_BUSY: AtomicBool = AtomicBool::new(false);

fn apply_toggle_item(item: &IconMenuItem<tauri::Wry>, kind: &str, phase: ServicePhase) {
    let label = match phase {
        ServicePhase::Starting | ServicePhase::Stopping => format!("{kind} Loading"),
        ServicePhase::Running => format!("{kind} Stop"),
        ServicePhase::Stopped => format!("{kind} Start"),
    };
    let _ = item.set_text(label);
    let _ = item.set_native_icon(Some(native_status_icon(phase)));
    // Stay clickable while loading so a second click can shut down.
    let _ = item.set_enabled(true);
}

fn refresh_status(app: &AppHandle) {
    let Some(state) = app.try_state::<Mutex<HubState>>() else {
        return;
    };
    let repo_root = match state.lock() {
        Ok(g) => g.repo_root.clone(),
        Err(_) => return,
    };
    let app = app.clone();

    std::thread::spawn(move || {
        let status = probe(&repo_root);
        let desktop = desktop_phase(&status);
        let mobile = status.mobile.phase;
        let api_ok = status.api_ok;
        let busy = desktop_cancel_requested()
            || matches!(
                desktop,
                ServicePhase::Starting | ServicePhase::Stopping
            )
            || DESKTOP_BUSY.load(Ordering::SeqCst);

        let _ = app.clone().run_on_main_thread(move || {
            let Some(state) = app.try_state::<Mutex<HubState>>() else {
                return;
            };
            let Ok(guard) = state.lock() else {
                return;
            };
            apply_toggle_item(&guard.desktop_item, "Desktop", desktop);
            apply_toggle_item(&guard.mobile_item, "Mobile", mobile);

            if let Some(tray) = app.tray_by_id(TRAY_ID) {
                let title = if api_ok {
                    "BacksterOS Hub · API up"
                } else if busy {
                    "BacksterOS Hub · busy…"
                } else {
                    "BacksterOS Hub · API down"
                };
                let _ = tray.set_tooltip(Some(title));
            }
        });
    });
}

fn run_desktop_toggle(app: &AppHandle) {
    let Some(state) = app.try_state::<Mutex<HubState>>() else {
        return;
    };
    let repo_root = match state.lock() {
        Ok(g) => g.repo_root.clone(),
        Err(_) => return,
    };

    let status = probe(&repo_root);
    let phase = desktop_phase(&status);

    // Click while running or loading → shut down.
    let should_stop = matches!(
        phase,
        ServicePhase::Running | ServicePhase::Starting | ServicePhase::Stopping
    );

    if should_stop {
        if DESKTOP_BUSY.load(Ordering::SeqCst) && !matches!(phase, ServicePhase::Stopping) {
            // In-flight start: ask it to cancel; also kick an immediate stop if we can.
            request_desktop_cancel();
            mark_stopping(&[ServiceId::Docker, ServiceId::Api, ServiceId::Pty]);
            refresh_status(app);
            // Best-effort kill without taking DESKTOP_BUSY (start thread owns it).
            let app = app.clone();
            std::thread::spawn(move || {
                let _ = stop_all_with_progress(&repo_root, || refresh_status(&app));
                clear_all_transitions();
                refresh_status(&app);
            });
            return;
        }

        if DESKTOP_BUSY
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            eprintln!("[hub] desktop busy — stop already in progress");
            return;
        }

        let app = app.clone();
        std::thread::spawn(move || {
            clear_desktop_cancel();
            mark_stopping(&[ServiceId::Docker, ServiceId::Api, ServiceId::Pty]);
            refresh_status(&app);
            let result = stop_all_with_progress(&repo_root, || refresh_status(&app));
            clear_all_transitions();
            match &result {
                Ok(msg) if !msg.is_empty() => eprintln!("[hub] {msg}"),
                Ok(_) => {}
                Err(err) => eprintln!("[hub] desktop stop error: {err}"),
            }
            DESKTOP_BUSY.store(false, Ordering::SeqCst);
            refresh_status(&app);
        });
        return;
    }

    // Stopped → start.
    if DESKTOP_BUSY
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        eprintln!("[hub] desktop busy — ignore start");
        return;
    }

    let app = app.clone();
    std::thread::spawn(move || {
        clear_desktop_cancel();
        let core = [ServiceId::Docker, ServiceId::Api, ServiceId::Pty];
        mark_starting(&core);
        refresh_status(&app);
        let result = start_all_with_progress(&repo_root, || refresh_status(&app));
        match &result {
            Ok(msg) if !msg.is_empty() => eprintln!("[hub] {msg}"),
            Ok(_) => {}
            Err(err) => {
                eprintln!("[hub] desktop start error: {err}");
                clear_all_transitions();
            }
        }
        // Ensure Loading clears once the start attempt finishes; probe decides
        // Running vs Stopped from real ports/health.
        DESKTOP_BUSY.store(false, Ordering::SeqCst);
        refresh_status(&app);
    });
}

fn run_mobile_toggle(app: &AppHandle) {
    let Some(state) = app.try_state::<Mutex<HubState>>() else {
        return;
    };
    let repo_root = match state.lock() {
        Ok(g) => g.repo_root.clone(),
        Err(_) => return,
    };

    let phase = probe(&repo_root).mobile.phase;
    let should_stop = matches!(
        phase,
        ServicePhase::Running | ServicePhase::Starting | ServicePhase::Stopping
    );

    if should_stop {
        if MOBILE_BUSY.load(Ordering::SeqCst) && matches!(phase, ServicePhase::Starting) {
            request_mobile_cancel();
            mark_stopping(&[ServiceId::Mobile]);
            refresh_status(app);
            let app = app.clone();
            std::thread::spawn(move || {
                let _ = stop_service(&repo_root, ServiceId::Mobile);
                clear_stopping(&[ServiceId::Mobile]);
                clear_starting(&[ServiceId::Mobile]);
                refresh_status(&app);
            });
            return;
        }

        if MOBILE_BUSY
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            // Already stopping — still try to kill.
            request_mobile_cancel();
            let _ = stop_service(&repo_root, ServiceId::Mobile);
            return;
        }

        let app = app.clone();
        std::thread::spawn(move || {
            clear_mobile_cancel();
            mark_stopping(&[ServiceId::Mobile]);
            refresh_status(&app);
            let result = stop_service(&repo_root, ServiceId::Mobile);
            clear_stopping(&[ServiceId::Mobile]);
            match &result {
                Ok(msg) if !msg.is_empty() => eprintln!("[hub] {msg}"),
                Ok(_) => {}
                Err(err) => eprintln!("[hub] mobile stop error: {err}"),
            }
            MOBILE_BUSY.store(false, Ordering::SeqCst);
            refresh_status(&app);
        });
        return;
    }

    if MOBILE_BUSY
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        eprintln!("[hub] mobile busy — ignore start");
        return;
    }

    let app = app.clone();
    std::thread::spawn(move || {
        clear_mobile_cancel();
        mark_starting(&[ServiceId::Mobile]);
        refresh_status(&app);
        let result = start_service(&repo_root, ServiceId::Mobile);
        if mobile_cancel_requested() {
            let _ = stop_service(&repo_root, ServiceId::Mobile);
            clear_mobile_cancel();
        }
        clear_starting(&[ServiceId::Mobile]);
        match &result {
            Ok(msg) if !msg.is_empty() => eprintln!("[hub] {msg}"),
            Ok(_) => {}
            Err(err) => {
                eprintln!("[hub] mobile start error: {err}");
                clear_starting(&[ServiceId::Mobile]);
            }
        }
        MOBILE_BUSY.store(false, Ordering::SeqCst);
        refresh_status(&app);
    });
}

fn run_action_async(app: &AppHandle, action: &str) {
    match action {
        "toggle_desktop" => run_desktop_toggle(app),
        "toggle_mobile" => run_mobile_toggle(app),
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let repo_root = resolve_repo_root();
    save_default_config_if_missing(&repo_root);
    eprintln!("[hub] repo root: {}", repo_root.display());

    tauri::Builder::default()
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }

            let desktop_item = IconMenuItem::with_id_and_native_icon(
                app,
                "toggle_desktop",
                "Desktop Start",
                true,
                Some(NativeIcon::StatusUnavailable),
                None::<&str>,
            )?;
            let sep_mobile = PredefinedMenuItem::separator(app)?;
            let mobile_item = IconMenuItem::with_id_and_native_icon(
                app,
                "toggle_mobile",
                "Mobile Start",
                true,
                Some(NativeIcon::StatusUnavailable),
                None::<&str>,
            )?;
            let sep_quit = PredefinedMenuItem::separator(app)?;
            let quit_item = IconMenuItem::with_id(
                app,
                "quit",
                "Quit Hub",
                true,
                None,
                None::<&str>,
            )?;

            let menu = Menu::with_items(
                app,
                &[&desktop_item, &sep_mobile, &mobile_item, &sep_quit, &quit_item],
            )?;

            let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-logo.png"))?;
            let _tray = TrayIconBuilder::with_id(TRAY_ID)
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("BacksterOS Hub")
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    if id == "quit" {
                        app.exit(0);
                        return;
                    }
                    run_action_async(app, id);
                })
                .build(app)?;

            app.manage(Mutex::new(HubState {
                repo_root: repo_root.clone(),
                _menu: menu,
                desktop_item,
                mobile_item,
            }));

            let handle = app.handle().clone();
            refresh_status(&handle);

            let poll_handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(2));
                refresh_status(&poll_handle);
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building BacksterOS Hub")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
