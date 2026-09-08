//! Status marks for native tray menu items.
//!
//! On macOS we use system status lights so colors match the OS (and stay correct
//! in light/dark menus). Custom RGBA circles tend to look washed-out or wrong.

use tauri::menu::NativeIcon;

use crate::services::ServicePhase;

/// macOS status light for a service phase.
pub fn native_status_icon(phase: ServicePhase) -> NativeIcon {
    match phase {
        // Green
        ServicePhase::Running => NativeIcon::StatusAvailable,
        // Red
        ServicePhase::Stopped => NativeIcon::StatusUnavailable,
        // Yellow / amber
        ServicePhase::Starting | ServicePhase::Stopping => NativeIcon::StatusPartiallyAvailable,
    }
}
