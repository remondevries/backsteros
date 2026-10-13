//! Host CPU / memory / disk stats for the desktop status bar.
//! Mirrors `legacy/backsteros-development/app/api/system-stats/route.ts`.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "linux")]
use std::fs;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Clone, Copy)]
struct CpuSample {
    idle: u64,
    total: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStats {
    pub total: u64,
    pub used: u64,
    pub free: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskStats {
    pub path: String,
    pub total: u64,
    pub used: u64,
    pub free: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu_percent: Option<f64>,
    pub load_average: f64,
    pub memory: MemoryStats,
    pub disk: Option<DiskStats>,
    pub sampled_at: u64,
}

static PREVIOUS_CPU: Mutex<Option<CpuSample>> = Mutex::new(None);

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn load_average() -> f64 {
    #[cfg(target_os = "macos")]
    {
        // vm.loadavg: { 1.23 4.56 7.89 }
        if let Ok(output) = Command::new("/usr/sbin/sysctl")
            .args(["-n", "vm.loadavg"])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                if let Some(first) = text
                    .split(|c: char| c == '{' || c == '}' || c.is_whitespace())
                    .find(|p| !p.is_empty())
                {
                    if let Ok(value) = first.parse::<f64>() {
                        return value;
                    }
                }
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(raw) = fs::read_to_string("/proc/loadavg") {
            if let Some(first) = raw.split_whitespace().next() {
                if let Ok(value) = first.parse::<f64>() {
                    return value;
                }
            }
        }
    }
    0.0
}

fn read_cpu_sample() -> Option<CpuSample> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("/usr/sbin/sysctl")
            .args(["-n", "kern.cp_time"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<u64> = text
            .split_whitespace()
            .filter_map(|p| p.parse().ok())
            .collect();
        // user nice sys idle interrupt
        if parts.len() < 5 {
            return None;
        }
        let idle = parts[3];
        let total = parts.iter().take(5).sum();
        return Some(CpuSample { idle, total });
    }

    #[cfg(target_os = "linux")]
    {
        let raw = fs::read_to_string("/proc/stat").ok()?;
        let line = raw.lines().next()?;
        if !line.starts_with("cpu ") {
            return None;
        }
        let parts: Vec<u64> = line
            .split_whitespace()
            .skip(1)
            .filter_map(|p| p.parse().ok())
            .collect();
        // user nice system idle iowait irq softirq …
        if parts.len() < 4 {
            return None;
        }
        let idle = parts[3];
        let total: u64 = parts.iter().sum();
        return Some(CpuSample { idle, total });
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

fn cpu_usage_percent() -> Option<f64> {
    let sample = read_cpu_sample()?;
    let mut guard = PREVIOUS_CPU.lock().ok()?;
    let prev = *guard;
    *guard = Some(sample);
    let prev = prev?;
    let idle_delta = sample.idle.saturating_sub(prev.idle);
    let total_delta = sample.total.saturating_sub(prev.total);
    if total_delta == 0 {
        return Some(0.0);
    }
    let pct = (1.0 - (idle_delta as f64 / total_delta as f64)) * 100.0;
    Some(pct.clamp(0.0, 100.0))
}

fn total_memory_bytes() -> u64 {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("/usr/sbin/sysctl")
            .args(["-n", "hw.memsize"])
            .output()
        {
            if output.status.success() {
                if let Ok(value) = String::from_utf8_lossy(&output.stdout).trim().parse::<u64>() {
                    return value;
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(raw) = fs::read_to_string("/proc/meminfo") {
            if let Some(kb) = meminfo_kb(&raw, "MemTotal") {
                return kb * 1024;
            }
        }
    }

    0
}

#[cfg(target_os = "linux")]
fn meminfo_kb(raw: &str, key: &str) -> Option<u64> {
    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix(key) {
            let rest = rest.trim_start().trim_start_matches(':').trim();
            let num = rest.split_whitespace().next()?;
            return num.parse().ok();
        }
    }
    None
}

fn read_fallback_memory() -> MemoryStats {
    let total = total_memory_bytes();
    // Best-effort free estimate when platform-specific readers fail.
    let free = 0;
    MemoryStats {
        total,
        used: total,
        free,
    }
}

#[cfg(target_os = "macos")]
fn read_darwin_memory() -> Option<MemoryStats> {
    let vm_stat = Command::new("/usr/bin/vm_stat").output().ok()?;
    if !vm_stat.status.success() {
        return None;
    }
    let pageable = Command::new("/usr/sbin/sysctl")
        .args(["-n", "vm.page_pageable_internal_count"])
        .output()
        .ok()?;
    if !pageable.status.success() {
        return None;
    }

    let vm_text = String::from_utf8_lossy(&vm_stat.stdout);
    let page_size = {
        let re = regex_lite_page_size(&vm_text).unwrap_or(16_384);
        if re == 0 {
            return None;
        }
        re
    };

    let pages = |label: &str| -> u64 {
        for line in vm_text.lines() {
            if let Some(rest) = line.strip_prefix(label) {
                let digits: String = rest
                    .chars()
                    .skip_while(|c| !c.is_ascii_digit())
                    .take_while(|c| c.is_ascii_digit())
                    .collect();
                return digits.parse().unwrap_or(0);
            }
        }
        0
    };

    let wired = pages("Pages wired down");
    let purgeable = pages("Pages purgeable");
    let compressor = pages("Pages occupied by compressor");
    let pageable_internal: u64 = String::from_utf8_lossy(&pageable.stdout)
        .trim()
        .parse()
        .ok()?;

    let app_memory = pageable_internal.saturating_sub(purgeable).saturating_mul(page_size);
    let total = total_memory_bytes();
    if total == 0 {
        return None;
    }
    let used = (app_memory
        + wired.saturating_mul(page_size)
        + compressor.saturating_mul(page_size))
    .min(total);
    let free = total.saturating_sub(used);
    Some(MemoryStats { total, used, free })
}

#[cfg(target_os = "macos")]
fn regex_lite_page_size(vm_stat: &str) -> Option<u64> {
    // "page size of 16384 bytes"
    let marker = "page size of ";
    let idx = vm_stat.to_ascii_lowercase().find(marker)?;
    let rest = &vm_stat[idx + marker.len()..];
    let digits: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

#[cfg(target_os = "linux")]
fn read_linux_memory() -> Option<MemoryStats> {
    let raw = fs::read_to_string("/proc/meminfo").ok()?;
    let total = meminfo_kb(&raw, "MemTotal")? * 1024;
    let available = meminfo_kb(&raw, "MemAvailable")? * 1024;
    let used = total.saturating_sub(available);
    Some(MemoryStats {
        total,
        used,
        free: available,
    })
}

fn read_memory() -> MemoryStats {
    #[cfg(target_os = "macos")]
    {
        return read_darwin_memory().unwrap_or_else(read_fallback_memory);
    }
    #[cfg(target_os = "linux")]
    {
        return read_linux_memory().unwrap_or_else(read_fallback_memory);
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        read_fallback_memory()
    }
}

fn read_disk(path: &Path) -> Option<DiskStats> {
    let output = Command::new("df")
        .args(["-kP", &path.to_string_lossy()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    // Skip header; take last data line (path may wrap on some systems).
    let line = text.lines().skip(1).last()?;
    let cols: Vec<&str> = line.split_whitespace().collect();
    // Filesystem 1024-blocks Used Available Capacity Mounted
    if cols.len() < 4 {
        return None;
    }
    let total_kb: u64 = cols[1].parse().ok()?;
    let used_kb: u64 = cols[2].parse().ok()?;
    let avail_kb: u64 = cols[3].parse().ok()?;
    Some(DiskStats {
        path: path.to_string_lossy().into_owned(),
        total: total_kb * 1024,
        used: used_kb * 1024,
        free: avail_kb * 1024,
    })
}

pub const SYSTEM_STATS_UPDATE_EVENT: &str = "system-stats-update";

const WATCH_INTERVAL: Duration = Duration::from_secs(2);

/// Shared disk path for the background status-bar emitter.
pub struct SystemStatsDiskPath(pub Mutex<PathBuf>);

fn resolve_disk_path(path: Option<&str>) -> PathBuf {
    path.map(str::trim)
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(home_dir)
}

fn collect_system_stats(disk_path: &Path) -> SystemStats {
    SystemStats {
        cpu_percent: cpu_usage_percent(),
        load_average: load_average(),
        memory: read_memory(),
        disk: read_disk(disk_path),
        sampled_at: now_ms(),
    }
}

/// One-shot sample (ad-hoc reads / immediate paint before the first watch tick).
#[tauri::command]
pub fn system_stats(path: Option<String>) -> SystemStats {
    let disk_path = resolve_disk_path(path.as_deref());
    collect_system_stats(&disk_path)
}

/// Update the disk path used by the background `system-stats-update` emitter.
#[tauri::command]
pub fn set_system_stats_disk_path(
    state: State<'_, SystemStatsDiskPath>,
    path: Option<String>,
) -> Result<(), String> {
    let next = resolve_disk_path(path.as_deref());
    let mut guard = state
        .0
        .lock()
        .map_err(|_| "system stats disk path lock poisoned".to_string())?;
    *guard = next;
    Ok(())
}

/// Emit `system-stats-update` to the main window every 2s (status bar push).
pub fn start_system_stats_watch(app: AppHandle) {
    std::thread::spawn(move || {
        // Prime CPU delta so the first emitted sample has a meaningful percent.
        let _ = cpu_usage_percent();
        loop {
            std::thread::sleep(WATCH_INTERVAL);

            let disk_path = app
                .try_state::<SystemStatsDiskPath>()
                .and_then(|state| state.0.lock().ok().map(|g| g.clone()))
                .unwrap_or_else(home_dir);

            let stats = collect_system_stats(&disk_path);
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.emit(SYSTEM_STATS_UPDATE_EVENT, &stats);
            }
        }
    });
}
