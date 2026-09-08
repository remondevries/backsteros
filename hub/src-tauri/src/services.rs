//! Start / stop / probe local BacksterOS services (Docker, core API, PTY).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::time::Duration;

/// Bitmask of services currently being started (for ◔ status while busy).
static STARTING_MASK: AtomicU8 = AtomicU8::new(0);
/// Bitmask of services currently being stopped.
static STOPPING_MASK: AtomicU8 = AtomicU8::new(0);
/// Set while a desktop (core) start is in flight and the user asked to shut down.
static DESKTOP_CANCEL: AtomicBool = AtomicBool::new(false);
/// Set while a mobile start is in flight and the user asked to shut down.
static MOBILE_CANCEL: AtomicBool = AtomicBool::new(false);

pub const API_PORT: u16 = 8788;
pub const PTY_PORT: u16 = 3101;
/// Expo Metro packager (mobile `pnpm dev`).
pub const MOBILE_PORT: u16 = 8081;
// Public liveness (auth wraps `/api/v1/*` — do not use `/api/v1/health`).
const API_HEALTH: &str = "http://127.0.0.1:8788/health";
const DOCKER_CONTAINERS: &[&str] = &[
    "backsteros-postgres",
    "backsteros-powersync",
    "backsteros-powersync-mongo",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceId {
    Docker,
    Api,
    Pty,
    /// Expo Metro — independent of the desktop core stack.
    Mobile,
}

impl ServiceId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Docker => "docker",
            Self::Api => "api",
            Self::Pty => "pty",
            Self::Mobile => "mobile",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Docker => "Docker",
            Self::Api => "Core API",
            Self::Pty => "PTY sidecar",
            Self::Mobile => "Mobile",
        }
    }

    fn starting_bit(self) -> u8 {
        match self {
            Self::Docker => 0b0001,
            Self::Api => 0b0010,
            Self::Pty => 0b0100,
            Self::Mobile => 0b1000,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServicePhase {
    Stopped,
    Starting,
    Stopping,
    Running,
}

pub fn mark_starting(services: &[ServiceId]) {
    let mut bits = 0u8;
    for service in services {
        bits |= service.starting_bit();
    }
    STOPPING_MASK.fetch_and(!bits, Ordering::SeqCst);
    STARTING_MASK.fetch_or(bits, Ordering::SeqCst);
}

pub fn clear_starting(services: &[ServiceId]) {
    let mut bits = 0u8;
    for service in services {
        bits |= service.starting_bit();
    }
    STARTING_MASK.fetch_and(!bits, Ordering::SeqCst);
}

pub fn mark_stopping(services: &[ServiceId]) {
    let mut bits = 0u8;
    for service in services {
        bits |= service.starting_bit();
    }
    STARTING_MASK.fetch_and(!bits, Ordering::SeqCst);
    STOPPING_MASK.fetch_or(bits, Ordering::SeqCst);
}

pub fn clear_stopping(services: &[ServiceId]) {
    let mut bits = 0u8;
    for service in services {
        bits |= service.starting_bit();
    }
    STOPPING_MASK.fetch_and(!bits, Ordering::SeqCst);
}

pub fn clear_all_starting() {
    STARTING_MASK.store(0, Ordering::SeqCst);
}

pub fn clear_all_stopping() {
    STOPPING_MASK.store(0, Ordering::SeqCst);
}

pub fn clear_all_transitions() {
    clear_all_starting();
    clear_all_stopping();
}

pub fn request_desktop_cancel() {
    DESKTOP_CANCEL.store(true, Ordering::SeqCst);
}

pub fn clear_desktop_cancel() {
    DESKTOP_CANCEL.store(false, Ordering::SeqCst);
}

pub fn desktop_cancel_requested() -> bool {
    DESKTOP_CANCEL.load(Ordering::SeqCst)
}

pub fn request_mobile_cancel() {
    MOBILE_CANCEL.store(true, Ordering::SeqCst);
}

pub fn clear_mobile_cancel() {
    MOBILE_CANCEL.store(false, Ordering::SeqCst);
}

pub fn mobile_cancel_requested() -> bool {
    MOBILE_CANCEL.load(Ordering::SeqCst)
}

/// Aggregate Docker + API + PTY into one desktop toggle phase.
///
/// Green (Running) only when the full core stack is up. A partial stack
/// (e.g. Docker up, API/PTY down) must be Stopped so **Desktop Start** heals
/// the missing pieces — previously mixed was treated as Running, so the menu
/// looked green while the API was down and a click tore everything down.
pub fn desktop_phase(status: &HubStatus) -> ServicePhase {
    let mut any_starting = false;
    let mut any_stopping = false;
    let mut all_running = true;
    let mut any_service = false;
    for service in &status.services {
        any_service = true;
        match service.phase {
            ServicePhase::Running => {}
            ServicePhase::Stopped => all_running = false,
            ServicePhase::Starting => {
                any_starting = true;
                all_running = false;
            }
            ServicePhase::Stopping => {
                any_stopping = true;
                all_running = false;
            }
        }
    }
    // Only show Loading while a transition is actually in flight.
    if any_starting || any_stopping {
        return ServicePhase::Starting;
    }
    if any_service && all_running {
        return ServicePhase::Running;
    }
    ServicePhase::Stopped
}

fn is_marked_starting(service: ServiceId) -> bool {
    STARTING_MASK.load(Ordering::SeqCst) & service.starting_bit() != 0
}

fn is_marked_stopping(service: ServiceId) -> bool {
    STOPPING_MASK.load(Ordering::SeqCst) & service.starting_bit() != 0
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HubConfig {
    #[serde(default)]
    pub repo_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PidFile {
    #[serde(default)]
    pids: HashMap<String, u32>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ServiceStatus {
    pub id: ServiceId,
    pub phase: ServicePhase,
    pub detail: String,
}

#[derive(Debug, Clone)]
pub struct HubStatus {
    pub services: Vec<ServiceStatus>,
    pub mobile: ServiceStatus,
    pub api_ok: bool,
}

fn config_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".config/backsteros/hub")
}

fn config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".config/backsteros/hub.json")
}

fn pids_path() -> PathBuf {
    config_dir().join("pids.json")
}

fn logs_dir() -> PathBuf {
    config_dir().join("logs")
}

fn ensure_dirs() -> std::io::Result<()> {
    fs::create_dir_all(config_dir())?;
    fs::create_dir_all(logs_dir())?;
    Ok(())
}

pub fn load_config() -> HubConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => HubConfig::default(),
    }
}

pub fn save_default_config_if_missing(repo_root: &Path) {
    let path = config_path();
    if path.exists() {
        return;
    }
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let cfg = HubConfig {
        repo_root: Some(repo_root.display().to_string()),
    };
    if let Ok(json) = serde_json::to_string_pretty(&cfg) {
        let _ = fs::write(path, format!("{json}\n"));
    }
}

/// Resolve monorepo root: hub.json → walk from this crate → ~/code/backsteros.
pub fn resolve_repo_root() -> PathBuf {
    let cfg = load_config();
    if let Some(root) = cfg.repo_root.as_deref() {
        let path = PathBuf::from(root.trim());
        if looks_like_repo(&path) {
            return path;
        }
    }

    // hub/src-tauri → hub → repo
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for ancestor in manifest.ancestors().take(6) {
        if looks_like_repo(ancestor) {
            return ancestor.to_path_buf();
        }
    }

    if let Some(home) = dirs::home_dir() {
        let candidate = home.join("code/backsteros");
        if looks_like_repo(&candidate) {
            return candidate;
        }
    }

    // Last resort: cwd
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn looks_like_repo(path: &Path) -> bool {
    path.join("pnpm-workspace.yaml").is_file()
        && path.join("core/server").is_dir()
        && path.join("docker-compose.yml").is_file()
}

fn read_pids() -> PidFile {
    let path = pids_path();
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => PidFile::default(),
    }
}

fn write_pids(file: &PidFile) {
    let _ = ensure_dirs();
    if let Ok(json) = serde_json::to_string_pretty(file) {
        let _ = fs::write(pids_path(), format!("{json}\n"));
    }
}

fn set_pid(service: ServiceId, pid: Option<u32>) {
    let mut file = read_pids();
    match pid {
        Some(pid) => {
            file.pids.insert(service.as_str().to_string(), pid);
        }
        None => {
            file.pids.remove(service.as_str());
        }
    }
    write_pids(&file);
}

fn get_pid(service: ServiceId) -> Option<u32> {
    read_pids().pids.get(service.as_str()).copied()
}

/// Current Homebrew pnpm requires Node ≥22.13; older GUI PATH nodes (e.g. v16
/// at `/usr/local/bin/node`) make `pnpm` exit immediately.
const MIN_NODE_MAJOR: u32 = 22;
const MIN_NODE_MINOR: u32 = 13;

fn parse_node_version(version_text: &str) -> Option<(u32, u32, u32)> {
    let s = version_text.trim().trim_start_matches('v');
    let mut parts = s.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().unwrap_or(0);
    Some((major, minor, patch))
}

fn node_version_ok(major: u32, minor: u32) -> bool {
    major > MIN_NODE_MAJOR || (major == MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR)
}

fn probe_node_bin(path: &Path) -> Option<(PathBuf, u32, u32, u32)> {
    if !path.is_file() {
        return None;
    }
    let output = Command::new(path)
        .arg("-v")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let (major, minor, patch) = parse_node_version(&text)?;
    if node_version_ok(major, minor) {
        Some((path.to_path_buf(), major, minor, patch))
    } else {
        None
    }
}

fn push_version_manager_nodes(home: &Path, out: &mut Vec<PathBuf>) {
    // nvm — highest suitable version first
    let nvm_root = home.join(".nvm/versions/node");
    if let Ok(entries) = fs::read_dir(&nvm_root) {
        let mut dirs: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
        dirs.sort_by(|a, b| {
            let va = a
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(parse_node_version)
                .unwrap_or((0, 0, 0));
            let vb = b
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(parse_node_version)
                .unwrap_or((0, 0, 0));
            vb.cmp(&va)
        });
        for dir in dirs {
            out.push(dir.join("bin/node"));
        }
    }

    // fnm
    for base in [
        home.join(".local/share/fnm/node-versions"),
        home.join(".fnm/node-versions"),
    ] {
        if let Ok(entries) = fs::read_dir(&base) {
            let mut dirs: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
            dirs.sort_by(|a, b| {
                let va = a
                    .file_name()
                    .and_then(|n| n.to_str())
                    .and_then(parse_node_version)
                    .unwrap_or((0, 0, 0));
                let vb = b
                    .file_name()
                    .and_then(|n| n.to_str())
                    .and_then(parse_node_version)
                    .unwrap_or((0, 0, 0));
                vb.cmp(&va)
            });
            for dir in dirs {
                out.push(dir.join("installation/bin/node"));
            }
        }
    }

    out.push(home.join(".volta/bin/node"));
    out.push(home.join(".local/bin/node"));
}

fn modern_node_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    // Prefer Apple Silicon Homebrew, then /usr/local (only used if ≥22.13).
    out.push(PathBuf::from("/opt/homebrew/bin/node"));
    out.push(PathBuf::from("/usr/local/bin/node"));
    if let Some(home) = dirs::home_dir() {
        push_version_manager_nodes(&home, &mut out);
    }
    out
}

fn resolve_modern_node_uncached() -> Result<(PathBuf, u32, u32, u32), String> {
    for candidate in modern_node_candidates() {
        if let Some(found) = probe_node_bin(&candidate) {
            return Ok(found);
        }
    }
    // Last resort: whatever `which` finds under our augmented PATH.
    if let Some(path) = which("node") {
        if let Some(found) = probe_node_bin(&path) {
            return Ok(found);
        }
    }
    Err(format!(
        "No Node.js ≥{MIN_NODE_MAJOR}.{MIN_NODE_MINOR} found (Hub GUI PATH often only sees /usr/local/bin/node v16). Install via Homebrew (`brew install node`) or ensure nvm/fnm/volta provides a modern Node."
    ))
}

fn resolve_modern_node() -> Result<(PathBuf, u32, u32, u32), String> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Result<(PathBuf, u32, u32, u32), String>> = OnceLock::new();
    CACHE
        .get_or_init(resolve_modern_node_uncached)
        .clone()
}

/// Build a PATH safe for GUI-launched children. Do NOT run a login shell —
/// from a menu-bar app `zsh -lc` can hang the UI thread.
fn build_path_env(node_bin_dir: Option<&Path>) -> String {
    let existing = std::env::var("PATH").unwrap_or_default();
    let mut parts: Vec<String> = Vec::new();
    let mut push = |p: String| {
        if p.is_empty() {
            return;
        }
        if parts.iter().any(|x| x == &p) {
            return;
        }
        parts.push(p);
    };
    // Modern node dir first so `#!/usr/bin/env node` and child tools agree.
    if let Some(dir) = node_bin_dir {
        push(dir.to_string_lossy().into_owned());
    }
    if let Some(home) = dirs::home_dir() {
        push(home.join(".local/bin").to_string_lossy().into_owned());
        push(home.join("Library/pnpm").to_string_lossy().into_owned());
        push(home.join(".cargo/bin").to_string_lossy().into_owned());
    }
    push("/opt/homebrew/bin".into());
    push("/opt/homebrew/sbin".into());
    // Keep /usr/local for docker/tailscale binaries, but after Homebrew so an
    // ancient /usr/local/bin/node cannot win.
    push("/usr/local/bin".into());
    push("/usr/local/sbin".into());
    push("/usr/bin".into());
    push("/bin".into());
    for part in existing.split(':') {
        push(part.to_string());
    }
    parts.join(":")
}

fn ensure_path_env(cmd: &mut Command) {
    let node_dir = resolve_modern_node()
        .ok()
        .and_then(|(path, _, _, _)| path.parent().map(|p| p.to_path_buf()));
    cmd.env("PATH", build_path_env(node_dir.as_deref()));
}

fn which(bin: &str) -> Option<PathBuf> {
    // Prefer well-known absolute paths first (GUI apps often have a tiny PATH).
    let mut dirs: Vec<PathBuf> = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];
    if let Some(home) = dirs::home_dir() {
        dirs.insert(0, home.join(".local/bin"));
        dirs.insert(1, home.join("Library/pnpm"));
    }
    for dir in dirs {
        let candidate = dir.join(bin);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    let mut cmd = Command::new("/usr/bin/which");
    // Avoid resolve_modern_node here (which may call `which("node")`).
    cmd.env("PATH", build_path_env(None));
    let output = cmd.arg(bin).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(PathBuf::from(path))
    }
}

fn pnpm_bin() -> PathBuf {
    which("pnpm")
        .or_else(|| which("pnpm.cmd"))
        .unwrap_or_else(|| PathBuf::from("pnpm"))
}

/// True when `path` is a native executable (Mach-O / ELF), not a JS entry
/// that must be run as `node path`.
fn is_native_executable(path: &Path) -> bool {
    let Ok(mut file) = File::open(path) else {
        return false;
    };
    let mut magic = [0u8; 4];
    if file.read_exact(&mut magic).is_err() {
        return false;
    }
    matches!(
        magic,
        [0xcf, 0xfa, 0xed, 0xfe] // Mach-O 64 LE
            | [0xfe, 0xed, 0xfa, 0xcf] // Mach-O 64 BE
            | [0xce, 0xfa, 0xed, 0xfe] // Mach-O 32 LE
            | [0xfe, 0xed, 0xfa, 0xce] // Mach-O 32 BE
            | [0xca, 0xfe, 0xba, 0xbe] // Mach-O fat
            | [0xbe, 0xba, 0xfe, 0xca] // Mach-O fat BE
            | [0x7f, b'E', b'L', b'F'] // ELF
    )
}

/// Build a `pnpm` command that works under Hub's GUI PATH.
///
/// - Classic JS `pnpm` entries: run as `node /path/to/pnpm …` so the shebang
///   cannot pick `/usr/local/bin/node` v16.
/// - Standalone Mach-O / ELF `pnpm` (current npm global / some Homebrew builds):
///   run the binary directly — `node /path/to/pnpm` SyntaxErrors on Mach-O.
///   Modern Node still leads PATH for pnpm's child Node processes.
fn pnpm_command() -> Result<(Command, PathBuf, PathBuf, String), String> {
    let (node, major, minor, patch) = resolve_modern_node()?;
    let pnpm = pnpm_bin();
    let ver = format!("v{major}.{minor}.{patch}");
    let cmd = if is_native_executable(&pnpm) {
        let mut cmd = Command::new(&pnpm);
        ensure_path_env(&mut cmd);
        cmd
    } else {
        let mut cmd = Command::new(&node);
        ensure_path_env(&mut cmd);
        cmd.arg(&pnpm);
        cmd
    };
    Ok((cmd, node, pnpm, ver))
}

fn pnpm_spawn_label(node: &Path, pnpm: &Path, node_ver: &str) -> String {
    if is_native_executable(pnpm) {
        format!(
            "{} (native pnpm; PATH node {node_ver})",
            pnpm.display()
        )
    } else {
        format!("{} {} (node {node_ver})", node.display(), pnpm.display())
    }
}

fn docker_bin() -> PathBuf {
    which("docker").unwrap_or_else(|| PathBuf::from("docker"))
}

fn tailscale_bin() -> Option<PathBuf> {
    which("tailscale").or_else(|| {
        [
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
            "/usr/local/bin/tailscale",
            "/opt/homebrew/bin/tailscale",
        ]
        .into_iter()
        .map(PathBuf::from)
        .find(|p| p.is_file())
    })
}

/// Expose a local TCP port on the Tailscale interface only (not LAN/public).
/// Used for cloud-core → local API (`:8788`) and phone → Metro (`:8081`).
fn enable_tailscale_tcp_serve(service: ServiceId, port: u16) {
    let Some(bin) = tailscale_bin() else {
        append_log_line(
            service,
            &format!("tailscale not found — skipping serve for :{port}"),
        );
        return;
    };
    let mut cmd = Command::new(&bin);
    ensure_path_env(&mut cmd);
    let target = format!("tcp://127.0.0.1:{port}");
    let output = cmd
        .args(["serve", "--bg", &format!("--tcp={port}"), &target])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    match output {
        Ok(out) if out.status.success() => {
            append_log_line(
                service,
                &format!("tailscale serve --tcp={port} → {target} (tailnet only)"),
            );
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            append_log_line(
                service,
                &format!(
                    "tailscale serve failed (status {}): {} {}",
                    out.status,
                    stdout.trim(),
                    stderr.trim()
                ),
            );
        }
        Err(err) => {
            append_log_line(
                service,
                &format!("tailscale serve spawn error: {err}"),
            );
        }
    }
}

fn disable_tailscale_tcp_serve(service: ServiceId, port: u16) {
    let Some(bin) = tailscale_bin() else {
        return;
    };
    let mut cmd = Command::new(&bin);
    ensure_path_env(&mut cmd);
    let output = cmd
        .args(["serve", &format!("--tcp={port}"), "off"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    match output {
        Ok(out) if out.status.success() => {
            append_log_line(
                service,
                &format!("tailscale serve --tcp={port} off"),
            );
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            // Already off / no config is fine.
            if stderr.to_lowercase().contains("no serve")
                || stderr.to_lowercase().contains("not found")
            {
                return;
            }
            append_log_line(
                service,
                &format!(
                    "tailscale serve off warning: {}",
                    stderr.trim()
                ),
            );
        }
        Err(err) => {
            append_log_line(
                service,
                &format!("tailscale serve off error: {err}"),
            );
        }
    }
}

fn enable_api_tailscale_serve() {
    enable_tailscale_tcp_serve(ServiceId::Api, API_PORT);
}

fn disable_api_tailscale_serve() {
    disable_tailscale_tcp_serve(ServiceId::Api, API_PORT);
}

fn enable_mobile_tailscale_serve() {
    enable_tailscale_tcp_serve(ServiceId::Mobile, MOBILE_PORT);
}

fn disable_mobile_tailscale_serve() {
    disable_tailscale_tcp_serve(ServiceId::Mobile, MOBILE_PORT);
}

/// Rotate a service log when it grows past this size (replication spam can
/// push `api.log` to hundreds of MB and slow Hub spawn/append).
const LOG_ROTATE_BYTES: u64 = 32 * 1024 * 1024;

fn open_log(service: ServiceId) -> std::io::Result<File> {
    ensure_dirs()?;
    let path = logs_dir().join(format!("{}.log", service.as_str()));
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() >= LOG_ROTATE_BYTES {
            let rotated = logs_dir().join(format!("{}.log.prev", service.as_str()));
            let _ = fs::remove_file(&rotated);
            let _ = fs::rename(&path, &rotated);
        }
    }
    OpenOptions::new().create(true).append(true).open(path)
}

fn append_log_line(service: ServiceId, line: &str) {
    if let Ok(mut file) = open_log(service) {
        let _ = writeln!(file, "[{}] {line}", chrono_like_now());
    }
}

fn chrono_like_now() -> String {
    // Avoid extra chrono dep — local wall clock via system.
    let output = Command::new("date")
        .arg("+%Y-%m-%dT%H:%M:%S")
        .output()
        .ok();
    output
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "now".into())
}

fn pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    #[cfg(unix)]
    {
        // We `mem::forget` spawned children so they keep running; when they exit
        // they become zombies until reaped. `kill -0` still succeeds on zombies,
        // which previously left Desktop stuck on Loading forever.
        unsafe {
            let mut status: libc::c_int = 0;
            loop {
                let waited = libc::waitpid(pid as libc::pid_t, &mut status, libc::WNOHANG);
                if waited < 0 {
                    // EINTR → retry; ECHILD / others → not our waitable child.
                    if std::io::Error::last_os_error().raw_os_error() == Some(libc::EINTR) {
                        continue;
                    }
                    break;
                }
                if waited > 0 {
                    // Reaped (exited or was zombie) — not alive.
                    return false;
                }
                break; // waited == 0: still running, or not our child
            }
        }

        let state = Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "state="])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .ok()
            .and_then(|o| {
                if !o.status.success() {
                    return None;
                }
                String::from_utf8(o.stdout).ok()
            })
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        if state.is_empty() {
            return false;
        }
        // Z = zombie, X = dead — neither is a live service process.
        let code = state.chars().next().unwrap_or('?');
        if code == 'Z' || code == 'X' {
            return false;
        }
        true
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

fn kill_pid_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    {
        // Negative PID = process group (we start with process_group(0)).
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        std::thread::sleep(Duration::from_millis(400));
        if pid_alive(pid) {
            let _ = Command::new("kill")
                .args(["-KILL", &format!("-{pid}")])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        // Also try the pid itself if group kill failed.
        if pid_alive(pid) {
            let _ = Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            std::thread::sleep(Duration::from_millis(200));
            let _ = Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
}

fn kill_port_listeners(port: u16) {
    let output = Command::new("lsof")
        .args([
            "-nP",
            &format!("-iTCP:{port}"),
            "-sTCP:LISTEN",
            "-t",
        ])
        .output();
    let Ok(output) = output else {
        return;
    };
    if !output.status.success() {
        return;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        if let Ok(pid) = line.trim().parse::<u32>() {
            kill_pid_tree(pid);
        }
    }
}

/// After killing listeners, wait until the port is actually free so a respawn
/// does not hit `EADDRINUSE` and leave Desktop yellow while tsx crash-loops.
fn wait_port_free(port: u16, timeout: Duration) -> bool {
    let started = std::time::Instant::now();
    loop {
        if !port_open(port) {
            // Brief settle — TIME_WAIT / slow close can still race the next bind.
            std::thread::sleep(Duration::from_millis(150));
            if !port_open(port) {
                return true;
            }
        }
        if started.elapsed() >= timeout {
            return !port_open(port);
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}")
            .parse()
            .expect("static addr"),
        Duration::from_millis(250),
    )
    .is_ok()
}

fn api_healthy() -> bool {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(_) => return port_open(API_PORT),
    };
    match client.get(API_HEALTH).send() {
        Ok(res) => res.status().is_success(),
        Err(_) => false,
    }
}

fn docker_running(repo_root: &Path) -> bool {
    // Prefer named containers — works even if compose project name differs.
    let mut up = 0;
    for name in DOCKER_CONTAINERS {
        let status = Command::new(docker_bin())
            .args([
                "inspect",
                "-f",
                "{{.State.Running}}",
                name,
            ])
            .current_dir(repo_root)
            .output();
        if let Ok(output) = status {
            let text = String::from_utf8_lossy(&output.stdout);
            if text.trim() == "true" {
                up += 1;
            }
        }
    }
    up >= 2
}

fn api_phase() -> (ServicePhase, String) {
    if is_marked_stopping(ServiceId::Api) {
        return (ServicePhase::Stopping, "stopping…".into());
    }
    if api_healthy() {
        clear_starting(&[ServiceId::Api]);
        return (ServicePhase::Running, format!(":{API_PORT} ok"));
    }
    let port_up = port_open(API_PORT);
    // Port open but /health failing — still coming up (or wedged mid-bind).
    // Cap "starting" so a wedged listener cannot leave Desktop yellow forever.
    if port_up {
        if is_marked_starting(ServiceId::Api)
            || get_pid(ServiceId::Api).is_some_and(pid_alive)
        {
            return (
                ServicePhase::Starting,
                format!(":{API_PORT} starting…"),
            );
        }
        // Foreign / unknown listener that never answers /health — not "loading".
        return (
            ServicePhase::Stopped,
            format!(":{API_PORT} up but /health failing"),
        );
    }
    // Match PTY: alive spawn pid (or explicit starting mark) means Starting,
    // even after start_api clears the mark before health is ready. Otherwise
    // the menu flickers to "stopped" during `predev` contracts build + tsx boot.
    let pid_starting = get_pid(ServiceId::Api).is_some_and(pid_alive);
    if is_marked_starting(ServiceId::Api) || pid_starting {
        return (ServicePhase::Starting, "starting…".into());
    }
    if let Some(pid) = get_pid(ServiceId::Api) {
        if !pid_alive(pid) {
            set_pid(ServiceId::Api, None);
        }
    }
    clear_starting(&[ServiceId::Api]);
    (ServicePhase::Stopped, "stopped".into())
}

fn docker_phase(repo_root: &Path) -> (ServicePhase, String) {
    if is_marked_stopping(ServiceId::Docker) {
        return (ServicePhase::Stopping, "stopping…".into());
    }
    if docker_running(repo_root) {
        clear_starting(&[ServiceId::Docker]);
        return (ServicePhase::Running, "containers up".into());
    }
    if is_marked_starting(ServiceId::Docker) {
        return (ServicePhase::Starting, "starting…".into());
    }
    (ServicePhase::Stopped, "stopped".into())
}

fn pty_phase() -> (ServicePhase, String) {
    if is_marked_stopping(ServiceId::Pty) {
        return (ServicePhase::Stopping, "stopping…".into());
    }
    if port_open(PTY_PORT) {
        clear_starting(&[ServiceId::Pty]);
        return (ServicePhase::Running, format!(":{PTY_PORT} listening"));
    }
    let pid_starting = get_pid(ServiceId::Pty).is_some_and(pid_alive);
    if is_marked_starting(ServiceId::Pty) || pid_starting {
        return (ServicePhase::Starting, "starting…".into());
    }
    (ServicePhase::Stopped, "stopped".into())
}

fn mobile_phase() -> (ServicePhase, String) {
    if is_marked_stopping(ServiceId::Mobile) {
        return (ServicePhase::Stopping, "stopping…".into());
    }
    if port_open(MOBILE_PORT) {
        clear_starting(&[ServiceId::Mobile]);
        return (ServicePhase::Running, format!(":{MOBILE_PORT} metro"));
    }
    // Alive spawn pid (or explicit starting mark) means Starting while Metro
    // boots — but only while we still own a live process. Dead / reused PIDs
    // must not leave the menu on Mobile Loading forever (see start_mobile).
    let pid_starting = get_pid(ServiceId::Mobile).is_some_and(pid_alive);
    if is_marked_starting(ServiceId::Mobile) || pid_starting {
        return (ServicePhase::Starting, "starting…".into());
    }
    if let Some(pid) = get_pid(ServiceId::Mobile) {
        if !pid_alive(pid) {
            set_pid(ServiceId::Mobile, None);
        }
    }
    clear_starting(&[ServiceId::Mobile]);
    (ServicePhase::Stopped, "stopped".into())
}

pub fn probe(repo_root: &Path) -> HubStatus {
    let (docker_phase, docker_detail) = docker_phase(repo_root);
    let (api_phase, api_detail) = api_phase();
    let (pty_phase, pty_detail) = pty_phase();
    let (mobile_phase, mobile_detail) = mobile_phase();

    HubStatus {
        api_ok: api_phase == ServicePhase::Running,
        services: vec![
            ServiceStatus {
                id: ServiceId::Docker,
                phase: docker_phase,
                detail: docker_detail,
            },
            ServiceStatus {
                id: ServiceId::Api,
                phase: api_phase,
                detail: api_detail,
            },
            ServiceStatus {
                id: ServiceId::Pty,
                phase: pty_phase,
                detail: pty_detail,
            },
        ],
        mobile: ServiceStatus {
            id: ServiceId::Mobile,
            phase: mobile_phase,
            detail: mobile_detail,
        },
    }
}

fn spawn_logged(
    service: ServiceId,
    mut cmd: Command,
) -> Result<u32, String> {
    let log = open_log(service).map_err(|e| e.to_string())?;
    let log_err = log.try_clone().map_err(|e| e.to_string())?;
    cmd.stdout(Stdio::from(log));
    cmd.stderr(Stdio::from(log_err));
    cmd.stdin(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                // New process group so we can kill the tree via -pid.
                libc::setpgid(0, 0);
                Ok(())
            });
        }
    }

    append_log_line(service, &format!("starting {}", service.as_str()));
    let child = cmd.spawn().map_err(|e| {
        format!("failed to start {}: {e}", service.label())
    })?;
    let pid = child.id();
    set_pid(service, Some(pid));
    // Detach — don't wait; drop Child handle so it keeps running.
    std::mem::forget(child);
    Ok(pid)
}

pub fn start_service(repo_root: &Path, service: ServiceId) -> Result<String, String> {
    ensure_dirs().map_err(|e| e.to_string())?;
    match service {
        ServiceId::Docker => start_docker(repo_root),
        ServiceId::Api => start_api(repo_root),
        ServiceId::Pty => start_pty(repo_root),
        ServiceId::Mobile => start_mobile(repo_root),
    }
}

pub fn stop_service(repo_root: &Path, service: ServiceId) -> Result<String, String> {
    match service {
        ServiceId::Docker => stop_docker(repo_root),
        ServiceId::Api => stop_api(),
        ServiceId::Pty => stop_pty(),
        ServiceId::Mobile => stop_mobile(),
    }
}

pub fn start_all_with_progress(
    repo_root: &Path,
    mut on_progress: impl FnMut(),
) -> Result<String, String> {
    clear_desktop_cancel();
    let mut notes = Vec::new();
    for service in [ServiceId::Docker, ServiceId::Api, ServiceId::Pty] {
        if desktop_cancel_requested() {
            break;
        }
        mark_starting(&[service]);
        on_progress();
        match start_service(repo_root, service) {
            Ok(msg) => notes.push(msg),
            Err(err) => {
                clear_starting(&[service]);
                notes.push(format!("{}: {err}", service.label()));
                // API / PTY failures must not leave Desktop Loading or claim success.
                if matches!(service, ServiceId::Api | ServiceId::Pty) {
                    clear_all_transitions();
                    return Err(err);
                }
            }
        }
        on_progress();
        if desktop_cancel_requested() {
            break;
        }
    }
    if desktop_cancel_requested() {
        clear_desktop_cancel();
        clear_all_transitions();
        let stop_notes = stop_all_with_progress(repo_root, on_progress)?;
        notes.push(format!("cancelled; {stop_notes}"));
        return Ok(notes.join("; "));
    }
    // Drop stale Starting marks for anything that never came up (failed spawn,
    // wrong Node, etc.) so the Desktop toggle does not stick on Loading.
    let status = probe(repo_root);
    for service in &status.services {
        if service.phase == ServicePhase::Stopped {
            clear_starting(&[service.id]);
        }
    }
    // Desktop is only "up" when Docker + API + PTY are all running. Partial
    // success must not look like a finished Start.
    let missing: Vec<&str> = status
        .services
        .iter()
        .filter(|s| s.phase != ServicePhase::Running)
        .map(|s| s.id.label())
        .collect();
    if !missing.is_empty() {
        clear_all_transitions();
        return Err(format!(
            "Desktop stack incomplete (not running: {}). {}",
            missing.join(", "),
            notes.join("; ")
        ));
    }
    Ok(notes.join("; "))
}

pub fn stop_all_with_progress(
    repo_root: &Path,
    mut on_progress: impl FnMut(),
) -> Result<String, String> {
    let mut notes = Vec::new();
    // Stop dependents first.
    for service in [ServiceId::Pty, ServiceId::Api, ServiceId::Docker] {
        mark_stopping(&[service]);
        on_progress();
        match stop_service(repo_root, service) {
            Ok(msg) => {
                clear_stopping(&[service]);
                notes.push(msg);
            }
            Err(err) => {
                clear_stopping(&[service]);
                notes.push(format!("{}: {err}", service.label()));
            }
        }
        on_progress();
    }
    Ok(notes.join("; "))
}

fn start_docker(repo_root: &Path) -> Result<String, String> {
    if docker_running(repo_root) {
        return Ok("Docker already running".into());
    }
    append_log_line(ServiceId::Docker, "docker compose up -d");
    let mut compose = Command::new(docker_bin());
    ensure_path_env(&mut compose);
    let output = compose
        .args(["compose", "up", "-d"])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("docker compose failed: {e}"))?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    append_log_line(ServiceId::Docker, &format!("{stdout}{stderr}"));
    if !output.status.success() {
        return Err(format!(
            "docker compose up failed: {}",
            stderr.trim().chars().take(200).collect::<String>()
        ));
    }
    // Wait briefly for health.
    for _ in 0..20 {
        if docker_running(repo_root) {
            return Ok("Docker started".into());
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Ok("Docker compose started (waiting for healthy)".into())
}

fn stop_docker(repo_root: &Path) -> Result<String, String> {
    append_log_line(ServiceId::Docker, "docker compose stop");
    let mut compose = Command::new(docker_bin());
    ensure_path_env(&mut compose);
    let output = compose
        .args(["compose", "stop"])
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("docker compose stop failed: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "docker compose stop failed: {}",
            stderr.trim().chars().take(200).collect::<String>()
        ));
    }
    Ok("Docker stopped".into())
}

fn start_api(repo_root: &Path) -> Result<String, String> {
    if api_healthy() {
        enable_api_tailscale_serve();
        clear_starting(&[ServiceId::Api]);
        return Ok("Core API already running".into());
    }

    // `tsx watch` can leave a parent pid alive after a failed restart while
    // nothing listens on :8788. Kill the zombie and respawn — but keep the
    // Starting mark so the menu does not briefly show "stopped".
    if let Some(pid) = get_pid(ServiceId::Api) {
        if pid_alive(pid) {
            append_log_line(
                ServiceId::Api,
                &format!("unhealthy pid {pid} still alive; killing before respawn"),
            );
            kill_pid_tree(pid);
        }
        set_pid(ServiceId::Api, None);
    }
    kill_port_listeners(API_PORT);
    if !wait_port_free(API_PORT, Duration::from_secs(5)) {
        clear_starting(&[ServiceId::Api]);
        return Err(format!(
            "Core API port :{API_PORT} still in use after stop — see ~/.config/backsteros/hub/logs/api.log"
        ));
    }
    mark_starting(&[ServiceId::Api]);

    let (mut cmd, node, pnpm, node_ver) = match pnpm_command() {
        Ok(v) => v,
        Err(err) => {
            append_log_line(ServiceId::Api, &err);
            clear_starting(&[ServiceId::Api]);
            return Err(err);
        }
    };
    append_log_line(
        ServiceId::Api,
        &format!(
            "spawn {} --filter @backsteros/server dev (cwd={})",
            pnpm_spawn_label(&node, &pnpm, &node_ver),
            repo_root.display()
        ),
    );
    // `predev` rebuilds @backsteros/contracts — expect several seconds before bind.
    cmd.args(["--filter", "@backsteros/server", "dev"])
        .current_dir(repo_root)
        .env("FORCE_COLOR", "0");
    let pid = spawn_logged(ServiceId::Api, cmd)?;
    // Tailscale TCP forward is config in the daemon (not a listen on :8788),
    // so it is safe to enable before the API finishes binding.
    enable_api_tailscale_serve();

    // Wait for /health like Docker wait — Start should not finish "green"
    // while the API is still compiling / binding.
    const HEALTH_ATTEMPTS: u32 = 60; // ~30s
    for attempt in 1..=HEALTH_ATTEMPTS {
        if desktop_cancel_requested() {
            append_log_line(ServiceId::Api, "start cancelled by user");
            let _ = stop_api();
            clear_starting(&[ServiceId::Api]);
            return Err("Core API start cancelled".into());
        }
        if api_healthy() {
            clear_starting(&[ServiceId::Api]);
            append_log_line(
                ServiceId::Api,
                &format!("healthy after {attempt} probe(s) (pid {pid})"),
            );
            return Ok(format!("Core API started (pid {pid})"));
        }
        if !pid_alive(pid) && !port_open(API_PORT) {
            clear_starting(&[ServiceId::Api]);
            set_pid(ServiceId::Api, None);
            return Err(format!(
                "Core API process exited before becoming healthy (pid {pid}). See ~/.config/backsteros/hub/logs/api.log"
            ));
        }
        std::thread::sleep(Duration::from_millis(500));
    }

    // Timed out — do not leave Desktop yellow forever (tsx watch can stay
    // "alive" while crash-looping on EADDRINUSE / failed boot).
    append_log_line(
        ServiceId::Api,
        &format!(
            "not healthy after {}s (pid {pid}); stopping so Desktop does not stick on Loading",
            HEALTH_ATTEMPTS / 2
        ),
    );
    let _ = stop_api();
    clear_starting(&[ServiceId::Api]);
    Err(format!(
        "Core API did not become healthy within {}s (pid {pid}). See ~/.config/backsteros/hub/logs/api.log",
        HEALTH_ATTEMPTS / 2
    ))
}

fn stop_api() -> Result<String, String> {
    disable_api_tailscale_serve();
    if let Some(pid) = get_pid(ServiceId::Api) {
        append_log_line(ServiceId::Api, &format!("stopping pid {pid}"));
        kill_pid_tree(pid);
        set_pid(ServiceId::Api, None);
    }
    kill_port_listeners(API_PORT);
    Ok("Core API stopped".into())
}

fn start_pty(repo_root: &Path) -> Result<String, String> {
    if port_open(PTY_PORT) {
        clear_starting(&[ServiceId::Pty]);
        return Ok("PTY already running".into());
    }

    // Stale pid that never bound (or died mid-boot) used to return Ok and leave
    // Desktop yellow forever via pid_alive in pty_phase.
    if let Some(pid) = get_pid(ServiceId::Pty) {
        if pid_alive(pid) {
            append_log_line(
                ServiceId::Pty,
                &format!("unhealthy pid {pid} still alive; killing before respawn"),
            );
            kill_pid_tree(pid);
        }
        set_pid(ServiceId::Pty, None);
    }
    kill_port_listeners(PTY_PORT);
    if !wait_port_free(PTY_PORT, Duration::from_secs(5)) {
        clear_starting(&[ServiceId::Pty]);
        return Err(format!(
            "PTY port :{PTY_PORT} still in use after stop — see ~/.config/backsteros/hub/logs/pty.log"
        ));
    }
    mark_starting(&[ServiceId::Pty]);

    let (mut cmd, node, pnpm, node_ver) = match pnpm_command() {
        Ok(v) => v,
        Err(err) => {
            append_log_line(ServiceId::Pty, &err);
            clear_starting(&[ServiceId::Pty]);
            return Err(err);
        }
    };
    append_log_line(
        ServiceId::Pty,
        &format!(
            "spawn {} --filter @backsteros/desktop pty (cwd={})",
            pnpm_spawn_label(&node, &pnpm, &node_ver),
            repo_root.display()
        ),
    );
    cmd.args(["--filter", "@backsteros/desktop", "pty"])
        .current_dir(repo_root)
        .env("FORCE_COLOR", "0");
    let pid = spawn_logged(ServiceId::Pty, cmd)?;

    const LISTEN_ATTEMPTS: u32 = 40; // ~20s
    for attempt in 1..=LISTEN_ATTEMPTS {
        if desktop_cancel_requested() {
            append_log_line(ServiceId::Pty, "start cancelled by user");
            let _ = stop_pty();
            clear_starting(&[ServiceId::Pty]);
            return Err("PTY start cancelled".into());
        }
        if port_open(PTY_PORT) {
            clear_starting(&[ServiceId::Pty]);
            append_log_line(
                ServiceId::Pty,
                &format!("listening after {attempt} probe(s) (pid {pid})"),
            );
            return Ok(format!("PTY started (pid {pid})"));
        }
        if !pid_alive(pid) && !port_open(PTY_PORT) {
            clear_starting(&[ServiceId::Pty]);
            set_pid(ServiceId::Pty, None);
            return Err(format!(
                "PTY process exited before listening on :{PTY_PORT} (pid {pid}). See ~/.config/backsteros/hub/logs/pty.log"
            ));
        }
        std::thread::sleep(Duration::from_millis(500));
    }

    append_log_line(
        ServiceId::Pty,
        &format!(
            "not listening after {}s (pid {pid}); stopping so Desktop does not stick on Loading",
            LISTEN_ATTEMPTS / 2
        ),
    );
    let _ = stop_pty();
    clear_starting(&[ServiceId::Pty]);
    Err(format!(
        "PTY did not listen on :{PTY_PORT} within {}s (pid {pid}). See ~/.config/backsteros/hub/logs/pty.log",
        LISTEN_ATTEMPTS / 2
    ))
}

fn stop_pty() -> Result<String, String> {
    if let Some(pid) = get_pid(ServiceId::Pty) {
        append_log_line(ServiceId::Pty, &format!("stopping pid {pid}"));
        kill_pid_tree(pid);
        set_pid(ServiceId::Pty, None);
    }
    kill_port_listeners(PTY_PORT);
    Ok("PTY stopped".into())
}

fn start_mobile(repo_root: &Path) -> Result<String, String> {
    clear_mobile_cancel();
    if port_open(MOBILE_PORT) {
        enable_mobile_tailscale_serve();
        clear_starting(&[ServiceId::Mobile]);
        return Ok("Mobile already running".into());
    }

    // Stale Tailscale serve (from a prior failed start) makes Expo believe :8081
    // is taken even with no local listener — clear it before spawning Metro.
    disable_mobile_tailscale_serve();

    // Stale pid that never bound (or died mid-boot) used to return Ok here and
    // leave Mobile yellow forever via pid_alive in mobile_phase — same class of
    // bug previously fixed for PTY / Core API.
    if let Some(pid) = get_pid(ServiceId::Mobile) {
        if pid_alive(pid) {
            append_log_line(
                ServiceId::Mobile,
                &format!("unhealthy pid {pid} still alive; killing before respawn"),
            );
            kill_pid_tree(pid);
        }
        set_pid(ServiceId::Mobile, None);
    }
    kill_port_listeners(MOBILE_PORT);
    if !wait_port_free(MOBILE_PORT, Duration::from_secs(5)) {
        clear_starting(&[ServiceId::Mobile]);
        return Err(format!(
            "Mobile port :{MOBILE_PORT} still in use after stop — see ~/.config/backsteros/hub/logs/mobile.log"
        ));
    }
    mark_starting(&[ServiceId::Mobile]);

    let (mut cmd, node, pnpm, node_ver) = match pnpm_command() {
        Ok(v) => v,
        Err(err) => {
            append_log_line(ServiceId::Mobile, &err);
            clear_starting(&[ServiceId::Mobile]);
            return Err(err);
        }
    };
    append_log_line(
        ServiceId::Mobile,
        &format!(
            "spawn {} --filter @backsteros/mobile dev (cwd={})",
            pnpm_spawn_label(&node, &pnpm, &node_ver),
            repo_root.display()
        ),
    );
    cmd.args(["--filter", "@backsteros/mobile", "dev"])
        .current_dir(repo_root)
        .env("FORCE_COLOR", "0")
        .env("CI", "1"); // non-interactive Expo
    let pid = spawn_logged(ServiceId::Mobile, cmd)?;

    // Do NOT enable Tailscale serve until Metro is listening. Expo's free-port
    // check treats an existing `tailscale serve --tcp=8081` as "port in use"
    // even when nothing accepts on 127.0.0.1:8081; with CI=1 it then exits
    // instead of prompting for 8082 — Hub saw that as Mobile "crashing".

    // Expo may run postinstall / Metro boot for a while before :8081 binds.
    const LISTEN_ATTEMPTS: u32 = 90; // ~45s
    for attempt in 1..=LISTEN_ATTEMPTS {
        if mobile_cancel_requested() {
            append_log_line(ServiceId::Mobile, "start cancelled by user");
            let _ = stop_mobile();
            clear_starting(&[ServiceId::Mobile]);
            return Err("Mobile start cancelled".into());
        }
        if port_open(MOBILE_PORT) {
            enable_mobile_tailscale_serve();
            clear_starting(&[ServiceId::Mobile]);
            append_log_line(
                ServiceId::Mobile,
                &format!("metro listening after {attempt} probe(s) (pid {pid})"),
            );
            return Ok(format!("Mobile started (pid {pid})"));
        }
        if !pid_alive(pid) && !port_open(MOBILE_PORT) {
            clear_starting(&[ServiceId::Mobile]);
            set_pid(ServiceId::Mobile, None);
            disable_mobile_tailscale_serve();
            return Err(format!(
                "Mobile process exited before listening on :{MOBILE_PORT} (pid {pid}). See ~/.config/backsteros/hub/logs/mobile.log"
            ));
        }
        std::thread::sleep(Duration::from_millis(500));
    }

    append_log_line(
        ServiceId::Mobile,
        &format!(
            "not listening after {}s (pid {pid}); stopping so Mobile does not stick on Loading",
            LISTEN_ATTEMPTS / 2
        ),
    );
    let _ = stop_mobile();
    clear_starting(&[ServiceId::Mobile]);
    Err(format!(
        "Mobile did not listen on :{MOBILE_PORT} within {}s (pid {pid}). See ~/.config/backsteros/hub/logs/mobile.log",
        LISTEN_ATTEMPTS / 2
    ))
}

fn stop_mobile() -> Result<String, String> {
    disable_mobile_tailscale_serve();
    if let Some(pid) = get_pid(ServiceId::Mobile) {
        append_log_line(ServiceId::Mobile, &format!("stopping pid {pid}"));
        kill_pid_tree(pid);
        set_pid(ServiceId::Mobile, None);
    }
    kill_port_listeners(MOBILE_PORT);
    Ok("Mobile stopped".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status(
        docker: ServicePhase,
        api: ServicePhase,
        pty: ServicePhase,
    ) -> HubStatus {
        HubStatus {
            api_ok: api == ServicePhase::Running,
            services: vec![
                ServiceStatus {
                    id: ServiceId::Docker,
                    phase: docker,
                    detail: String::new(),
                },
                ServiceStatus {
                    id: ServiceId::Api,
                    phase: api,
                    detail: String::new(),
                },
                ServiceStatus {
                    id: ServiceId::Pty,
                    phase: pty,
                    detail: String::new(),
                },
            ],
            mobile: ServiceStatus {
                id: ServiceId::Mobile,
                phase: ServicePhase::Stopped,
                detail: String::new(),
            },
        }
    }

    #[test]
    fn desktop_phase_green_only_when_full_stack_up() {
        assert_eq!(
            desktop_phase(&status(
                ServicePhase::Running,
                ServicePhase::Running,
                ServicePhase::Running,
            )),
            ServicePhase::Running
        );
    }

    #[test]
    fn desktop_phase_partial_stack_is_start_not_stop() {
        // Regression: Docker-only used to look green, so a click tore down
        // instead of healing API/PTY — and the menu lied about API health.
        assert_eq!(
            desktop_phase(&status(
                ServicePhase::Running,
                ServicePhase::Stopped,
                ServicePhase::Stopped,
            )),
            ServicePhase::Stopped
        );
        assert_eq!(
            desktop_phase(&status(
                ServicePhase::Running,
                ServicePhase::Running,
                ServicePhase::Stopped,
            )),
            ServicePhase::Stopped
        );
    }

    #[test]
    fn desktop_phase_loading_while_any_transition() {
        assert_eq!(
            desktop_phase(&status(
                ServicePhase::Running,
                ServicePhase::Starting,
                ServicePhase::Stopped,
            )),
            ServicePhase::Starting
        );
        assert_eq!(
            desktop_phase(&status(
                ServicePhase::Stopping,
                ServicePhase::Running,
                ServicePhase::Running,
            )),
            ServicePhase::Starting
        );
    }

    #[test]
    fn parse_node_version_strips_v_prefix() {
        assert_eq!(parse_node_version("v22.13.0"), Some((22, 13, 0)));
        assert_eq!(parse_node_version("26.7.0\n"), Some((26, 7, 0)));
        assert_eq!(parse_node_version("v16.11.0"), Some((16, 11, 0)));
    }

    #[test]
    fn node_version_ok_matches_pnpm_floor() {
        assert!(!node_version_ok(16, 11));
        assert!(!node_version_ok(22, 12));
        assert!(node_version_ok(22, 13));
        assert!(node_version_ok(26, 0));
    }

    #[test]
    fn resolve_modern_node_finds_homebrew_on_this_machine() {
        let (path, major, minor, _) =
            resolve_modern_node().expect("expected a modern Node on this host");
        assert!(node_version_ok(major, minor), "got {} v{}.{}", path.display(), major, minor);
        // Must not pick the ancient /usr/local/bin/node when Homebrew exists.
        if Path::new("/opt/homebrew/bin/node").is_file() {
            assert_eq!(path, PathBuf::from("/opt/homebrew/bin/node"));
        }
    }

    #[test]
    fn pnpm_command_survives_gui_path() {
        // Simulate Finder/Dock launch PATH where /usr/local/bin/node is v16.
        std::env::set_var("PATH", "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin");
        let (mut cmd, node, pnpm, ver) =
            pnpm_command().expect("modern node required for this smoke check");
        assert!(
            node.ends_with("node"),
            "expected absolute node, got {}",
            node.display()
        );
        assert!(ver.starts_with('v'), "version {ver}");
        // Native Mach-O pnpm must be invoked directly; JS entries via modern node.
        // Either way `-v` must succeed even though shebang alone would pick v16.
        cmd.arg("-v");
        let out = cmd.output().expect("spawn pnpm -v");
        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        assert!(
            out.status.success(),
            "pnpm -v failed under GUI PATH via {} / {}: {}\n{}",
            node.display(),
            pnpm.display(),
            stdout,
            stderr
        );
        assert!(
            !stderr.contains("requires at least Node.js"),
            "still hitting old Node: {stderr}"
        );
        assert!(
            !stderr.contains("Invalid or unexpected token"),
            "node tried to parse a native pnpm binary: {stderr}"
        );
    }

    #[test]
    fn detects_native_pnpm_on_this_machine() {
        let pnpm = pnpm_bin();
        if !pnpm.is_file() {
            return;
        }
        // Current npm-global pnpm on this host is Mach-O; keep the detector honest.
        let native = is_native_executable(&pnpm);
        let mut magic = [0u8; 4];
        let mut file = File::open(&pnpm).expect("open pnpm");
        file.read_exact(&mut magic).expect("read magic");
        let looks_macho = magic == [0xcf, 0xfa, 0xed, 0xfe]
            || magic == [0xca, 0xfe, 0xba, 0xbe]
            || magic == [0x7f, b'E', b'L', b'F'];
        assert_eq!(native, looks_macho, "magic={magic:?} path={}", pnpm.display());
    }

    /// Manual smoke: `cargo test --lib start_api_pty_under_gui_path -- --ignored --nocapture`
    #[test]
    #[ignore = "starts real local services"]
    fn start_api_pty_under_gui_path() {
        std::env::set_var("PATH", "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin");
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf();
        assert!(
            looks_like_repo(&root),
            "repo root not found from {}",
            root.display()
        );
        let api = start_service(&root, ServiceId::Api).expect("start api");
        eprintln!("api: {api}");
        assert!(
            api_healthy(),
            "Core API not healthy after start — see ~/.config/backsteros/hub/logs/api.log"
        );
        let pty = start_service(&root, ServiceId::Pty).expect("start pty");
        eprintln!("pty: {pty}");
        assert!(
            port_open(PTY_PORT),
            "PTY :{PTY_PORT} not listening — see ~/.config/backsteros/hub/logs/pty.log"
        );
    }
}

