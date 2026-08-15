mod services;
mod status_icons;

use services::{
    clear_all_transitions, clear_starting, clear_stopping, mark_starting, mark_stopping,
    menu_label, probe, resolve_repo_root, save_default_config_if_missing,
    start_all_with_progress, start_service, stop_all_with_progress, stop_service, HubStatus,
    ServiceId, ServicePhase,
};
use status_icons::{status_icon, StatusMark};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{IconMenuItem, Menu, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, RunEvent,
};

const TRAY_ID: &str = "backsteros-hub";

struct HubState {
    repo_root: std::path::PathBuf,
    /// Kept alive for the app lifetime — never replace / drop the tray menu (muda UAF).
    menu: Menu<tauri::Wry>,
    start_all_item: IconMenuItem<tauri::Wry>,
    stop_all_item: IconMenuItem<tauri::Wry>,
    /// Separator above the per-service rows (only present while detail is shown).
    sep_detail: PredefinedMenuItem<tauri::Wry>,
    docker_item: IconMenuItem<tauri::Wry>,
    api_item: IconMenuItem<tauri::Wry>,
    pty_item: IconMenuItem<tauri::Wry>,
    /// Independent of Start/Stop — Expo Metro.
    mobile_item: IconMenuItem<tauri::Wry>,
    /// Whether Docker / API / PTY rows are currently in the menu.
    detail_visible: bool,
}

/// Core Start/Stop busy flag (does not block Mobile Development).
static CORE_BUSY: AtomicBool = AtomicBool::new(false);
/// Mobile Development busy flag (does not block Start/Stop).
static MOBILE_BUSY: AtomicBool = AtomicBool::new(false);

fn mark_for_phase(phase: ServicePhase) -> StatusMark {
    match phase {
        ServicePhase::Running => StatusMark::Online,
        ServicePhase::Starting | ServicePhase::Stopping => StatusMark::Starting,
        ServicePhase::Stopped => StatusMark::Stopped,
    }
}

fn apply_service_item(item: &IconMenuItem<tauri::Wry>, phase: ServicePhase, label: &str) {
    let _ = item.set_text(label);
    let _ = item.set_icon(Some(status_icon(mark_for_phase(phase))));
}

fn apply_mobile_item(item: &IconMenuItem<tauri::Wry>, phase: ServicePhase) {
    let _ = item.set_text("Mobile Development");
    let icon = match phase {
        ServicePhase::Running => StatusMark::Online,   // green
        ServicePhase::Stopped => StatusMark::Stop,     // red
        ServicePhase::Starting | ServicePhase::Stopping => StatusMark::Starting, // yellow
    };
    let _ = item.set_icon(Some(status_icon(icon)));
    let busy = matches!(
        phase,
        ServicePhase::Starting | ServicePhase::Stopping
    ) || MOBILE_BUSY.load(Ordering::SeqCst);
    let _ = item.set_enabled(!busy);
}

/// Show per-service rows only for mixed / transitional core state.
fn should_show_detail(status: &HubStatus) -> bool {
    if CORE_BUSY.load(Ordering::SeqCst) {
        return true;
    }
    let mut any_running = false;
    let mut any_stopped = false;
    let mut any_transition = false;
    for service in &status.services {
        match service.phase {
            ServicePhase::Running => any_running = true,
            ServicePhase::Stopped => any_stopped = true,
            ServicePhase::Starting | ServicePhase::Stopping => any_transition = true,
        }
    }
    any_transition || (any_running && any_stopped)
}

fn set_detail_visible(state: &mut HubState, visible: bool) {
    if state.detail_visible == visible {
        return;
    }
    if visible {
        // After Start / Stop (indices 0, 1).
        let _ = state.menu.insert(&state.sep_detail, 2);
        let _ = state.menu.insert(&state.docker_item, 3);
        let _ = state.menu.insert(&state.api_item, 4);
        let _ = state.menu.insert(&state.pty_item, 5);
    } else {
        let _ = state.menu.remove(&state.docker_item);
        let _ = state.menu.remove(&state.api_item);
        let _ = state.menu.remove(&state.pty_item);
        let _ = state.menu.remove(&state.sep_detail);
    }
    state.detail_visible = visible;
}

fn set_bulk_action_labels(app: &AppHandle, starting: bool, stopping: bool) {
    let _ = app.clone().run_on_main_thread({
        let app = app.clone();
        move || {
            let Some(state) = app.try_state::<Mutex<HubState>>() else {
                return;
            };
            let Ok(guard) = state.lock() else {
                return;
            };
            if starting {
                let _ = guard.start_all_item.set_text("Running...");
                let _ = guard
                    .start_all_item
                    .set_icon(Some(status_icon(StatusMark::Starting)));
                let _ = guard.start_all_item.set_enabled(false);
                let _ = guard.stop_all_item.set_enabled(false);
            } else if stopping {
                let _ = guard.stop_all_item.set_text("Stopping...");
                let _ = guard
                    .stop_all_item
                    .set_icon(Some(status_icon(StatusMark::Starting)));
                let _ = guard.start_all_item.set_enabled(false);
                let _ = guard.stop_all_item.set_enabled(false);
            }
        }
    });
}

fn sync_bulk_enabled(guard: &HubState, status: &HubStatus) {
    if CORE_BUSY.load(Ordering::SeqCst) {
        return;
    }
    let all_running = status
        .services
        .iter()
        .all(|s| s.phase == ServicePhase::Running);
    let all_stopped = status
        .services
        .iter()
        .all(|s| s.phase == ServicePhase::Stopped);
    let _ = guard.start_all_item.set_enabled(!all_running);
    let _ = guard.stop_all_item.set_enabled(!all_stopped);
    if all_running {
        let _ = guard.start_all_item.set_text("Running...");
        let _ = guard
            .start_all_item
            .set_icon(Some(status_icon(StatusMark::Online)));
    } else {
        let _ = guard.start_all_item.set_text("Start");
        let _ = guard
            .start_all_item
            .set_icon(Some(status_icon(StatusMark::Online)));
    }
    let _ = guard.stop_all_item.set_text("Stop");
    let _ = guard
        .stop_all_item
        .set_icon(Some(status_icon(StatusMark::Stop)));
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
        let rows: Vec<(ServiceId, ServicePhase, String)> = status
            .services
            .iter()
            .map(|s| (s.id, s.phase, menu_label(s)))
            .collect();
        let mobile_phase = status.mobile.phase;
        let show_detail = should_show_detail(&status);
        let api_ok = status.api_ok;
        let any_transition = status.services.iter().any(|s| {
            matches!(
                s.phase,
                ServicePhase::Starting | ServicePhase::Stopping
            )
        });

        let _ = app.clone().run_on_main_thread(move || {
            let Some(state) = app.try_state::<Mutex<HubState>>() else {
                return;
            };
            let Ok(mut guard) = state.lock() else {
                return;
            };
            for (id, phase, label) in &rows {
                match id {
                    ServiceId::Docker => apply_service_item(&guard.docker_item, *phase, label),
                    ServiceId::Api => apply_service_item(&guard.api_item, *phase, label),
                    ServiceId::Pty => apply_service_item(&guard.pty_item, *phase, label),
                    ServiceId::Mobile => {}
                }
            }
            apply_mobile_item(&guard.mobile_item, mobile_phase);
            set_detail_visible(&mut guard, show_detail);
            sync_bulk_enabled(&guard, &status);

            if let Some(tray) = app.tray_by_id(TRAY_ID) {
                let title = if api_ok {
                    "BacksterOS Hub · API up"
                } else if any_transition {
                    "BacksterOS Hub · busy…"
                } else {
                    "BacksterOS Hub · API down"
                };
                let _ = tray.set_tooltip(Some(title));
            }
        });
    });
}

fn run_core_action(app: &AppHandle, action: String) {
    if CORE_BUSY
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        eprintln!("[hub] core busy — ignore {action}");
        return;
    }

    let Some(state) = app.try_state::<Mutex<HubState>>() else {
        CORE_BUSY.store(false, Ordering::SeqCst);
        return;
    };
    let repo_root = match state.lock() {
        Ok(g) => g.repo_root.clone(),
        Err(_) => {
            CORE_BUSY.store(false, Ordering::SeqCst);
            return;
        }
    };
    let app = app.clone();

    std::thread::spawn(move || {
        let progress = || refresh_status(&app);
        let core = [ServiceId::Docker, ServiceId::Api, ServiceId::Pty];

        let result = match action.as_str() {
            "start_all" => {
                mark_starting(&core);
                set_bulk_action_labels(&app, true, false);
                refresh_status(&app);
                let out = start_all_with_progress(&repo_root, progress);
                set_bulk_action_labels(&app, false, false);
                out
            }
            "stop_all" => {
                mark_stopping(&core);
                set_bulk_action_labels(&app, false, true);
                refresh_status(&app);
                let out = stop_all_with_progress(&repo_root, progress);
                clear_all_transitions();
                set_bulk_action_labels(&app, false, false);
                out
            }
            "toggle_docker" => {
                let running = probe(&repo_root)
                    .services
                    .iter()
                    .any(|s| s.id == ServiceId::Docker && s.running());
                if running {
                    mark_stopping(&[ServiceId::Docker]);
                    refresh_status(&app);
                    let out = stop_service(&repo_root, ServiceId::Docker);
                    clear_stopping(&[ServiceId::Docker]);
                    out
                } else {
                    mark_starting(&[ServiceId::Docker]);
                    refresh_status(&app);
                    start_service(&repo_root, ServiceId::Docker)
                }
            }
            "toggle_api" => {
                let running = probe(&repo_root)
                    .services
                    .iter()
                    .any(|s| s.id == ServiceId::Api && s.running());
                if running {
                    mark_stopping(&[ServiceId::Api]);
                    refresh_status(&app);
                    let out = stop_service(&repo_root, ServiceId::Api);
                    clear_stopping(&[ServiceId::Api]);
                    out
                } else {
                    mark_starting(&[ServiceId::Api]);
                    refresh_status(&app);
                    start_service(&repo_root, ServiceId::Api)
                }
            }
            "toggle_pty" => {
                let running = probe(&repo_root)
                    .services
                    .iter()
                    .any(|s| s.id == ServiceId::Pty && s.running());
                if running {
                    mark_stopping(&[ServiceId::Pty]);
                    refresh_status(&app);
                    let out = stop_service(&repo_root, ServiceId::Pty);
                    clear_stopping(&[ServiceId::Pty]);
                    out
                } else {
                    mark_starting(&[ServiceId::Pty]);
                    refresh_status(&app);
                    start_service(&repo_root, ServiceId::Pty)
                }
            }
            _ => Ok(String::new()),
        };

        match &result {
            Ok(msg) if !msg.is_empty() => eprintln!("[hub] {msg}"),
            Ok(_) => {}
            Err(err) => {
                eprintln!("[hub] error: {err}");
                clear_all_transitions();
                set_bulk_action_labels(&app, false, false);
            }
        }

        CORE_BUSY.store(false, Ordering::SeqCst);
        refresh_status(&app);
    });
}

fn run_mobile_toggle(app: &AppHandle) {
    if MOBILE_BUSY
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        eprintln!("[hub] mobile busy — ignore toggle");
        return;
    }

    let Some(state) = app.try_state::<Mutex<HubState>>() else {
        MOBILE_BUSY.store(false, Ordering::SeqCst);
        return;
    };
    let repo_root = match state.lock() {
        Ok(g) => g.repo_root.clone(),
        Err(_) => {
            MOBILE_BUSY.store(false, Ordering::SeqCst);
            return;
        }
    };
    let app = app.clone();

    std::thread::spawn(move || {
        let running = probe(&repo_root).mobile.running();
        let result = if running {
            mark_stopping(&[ServiceId::Mobile]);
            refresh_status(&app);
            let out = stop_service(&repo_root, ServiceId::Mobile);
            clear_stopping(&[ServiceId::Mobile]);
            out
        } else {
            mark_starting(&[ServiceId::Mobile]);
            refresh_status(&app);
            start_service(&repo_root, ServiceId::Mobile)
        };

        match &result {
            Ok(msg) if !msg.is_empty() => eprintln!("[hub] {msg}"),
            Ok(_) => {}
            Err(err) => {
                eprintln!("[hub] mobile error: {err}");
                clear_stopping(&[ServiceId::Mobile]);
                clear_starting(&[ServiceId::Mobile]);
            }
        }

        MOBILE_BUSY.store(false, Ordering::SeqCst);
        refresh_status(&app);
    });
}

fn run_action_async(app: &AppHandle, action: String) {
    match action.as_str() {
        "toggle_mobile" => run_mobile_toggle(app),
        _ => run_core_action(app, action),
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

            let start_all_item = IconMenuItem::with_id(
                app,
                "start_all",
                "Start",
                true,
                Some(status_icon(StatusMark::Online)),
                None::<&str>,
            )?;
            let stop_all_item = IconMenuItem::with_id(
                app,
                "stop_all",
                "Stop",
                true,
                Some(status_icon(StatusMark::Stop)),
                None::<&str>,
            )?;
            let sep_detail = PredefinedMenuItem::separator(app)?;
            let docker_item = IconMenuItem::with_id(
                app,
                "toggle_docker",
                "Docker — …",
                true,
                Some(status_icon(StatusMark::Stopped)),
                None::<&str>,
            )?;
            let api_item = IconMenuItem::with_id(
                app,
                "toggle_api",
                "Core API — …",
                true,
                Some(status_icon(StatusMark::Stopped)),
                None::<&str>,
            )?;
            let pty_item = IconMenuItem::with_id(
                app,
                "toggle_pty",
                "PTY sidecar — …",
                true,
                Some(status_icon(StatusMark::Stopped)),
                None::<&str>,
            )?;
            let sep_mobile = PredefinedMenuItem::separator(app)?;
            let mobile_item = IconMenuItem::with_id(
                app,
                "toggle_mobile",
                "Mobile Development",
                true,
                Some(status_icon(StatusMark::Stop)),
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

            // Collapsed by default — core detail rows inserted only when needed.
            let menu = Menu::with_items(
                app,
                &[
                    &start_all_item,
                    &stop_all_item,
                    &sep_mobile,
                    &mobile_item,
                    &sep_quit,
                    &quit_item,
                ],
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
                    run_action_async(app, id.to_string());
                })
                .build(app)?;

            app.manage(Mutex::new(HubState {
                repo_root: repo_root.clone(),
                menu,
                start_all_item,
                stop_all_item,
                sep_detail,
                docker_item,
                api_item,
                pty_item,
                mobile_item,
                detail_visible: false,
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
