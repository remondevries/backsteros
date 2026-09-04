//! Start / stop / probe local BacksterOS services (Docker, core API, PTY).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Duration;

/// Bitmask of services currently being started (for ◔ status while busy).
static STARTING_MASK: AtomicU8 = AtomicU8::new(0);
/// Bitmask of services currently being stopped.
static STOPPING_MASK: AtomicU8 = AtomicU8::new(0);

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
    /// Expo Metro — independent of Start/Stop core stack.
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
            Self::Mobile => "Mobile Development",
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
pub struct ServiceStatus {
    pub id: ServiceId,
    pub phase: ServicePhase,
    pub detail: String,
}

impl ServiceStatus {
    pub fn running(&self) -> bool {
        self.phase == ServicePhase::Running
    }
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

fn ensure_path_env(cmd: &mut Command) {
    let mut path = std::env::var("PATH").unwrap_or_default();
    // Do NOT run a login shell here — from a menu-bar app `zsh -lc` can hang
    // the UI thread for a long time (or forever if the profile waits on TTY).
    // Include ~/.local/bin so Cursor Agent CLI (`agent`) is findable when Hub
    // is launched from Finder / Dock (GUI PATH is otherwise /usr/bin:/bin…).
    let mut extras: Vec<String> = vec![
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
        "/usr/bin".into(),
        "/bin".into(),
        "/opt/homebrew/sbin".into(),
        "/usr/local/sbin".into(),
    ];
    if let Some(home) = dirs::home_dir() {
        extras.insert(0, home.join(".local/bin").to_string_lossy().into_owned());
        extras.insert(
            1,
            home.join("Library/pnpm").to_string_lossy().into_owned(),
        );
        extras.insert(2, home.join(".cargo/bin").to_string_lossy().into_owned());
    }
    for extra in extras {
        if !path.split(':').any(|p| p == extra) {
            path = format!("{extra}:{path}");
        }
    }
    cmd.env("PATH", path);
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
    ensure_path_env(&mut cmd);
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

/// Expose local-core `:8788` on the Tailscale interface only (not LAN/public).
/// Cloud-core replication peers `http://<mac-tailnet-ip>:8788`.
fn enable_api_tailscale_serve() {
    let Some(bin) = tailscale_bin() else {
        append_log_line(
            ServiceId::Api,
            "tailscale not found — skipping serve for cloud-core replication",
        );
        return;
    };
    let mut cmd = Command::new(&bin);
    ensure_path_env(&mut cmd);
    let target = format!("tcp://127.0.0.1:{API_PORT}");
    let output = cmd
        .args(["serve", "--bg", &format!("--tcp={API_PORT}"), &target])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    match output {
        Ok(out) if out.status.success() => {
            append_log_line(
                ServiceId::Api,
                &format!(
                    "tailscale serve --tcp={API_PORT} → {target} (tailnet only)"
                ),
            );
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            append_log_line(
                ServiceId::Api,
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
                ServiceId::Api,
                &format!("tailscale serve spawn error: {err}"),
            );
        }
    }
}

fn disable_api_tailscale_serve() {
    let Some(bin) = tailscale_bin() else {
        return;
    };
    let mut cmd = Command::new(&bin);
    ensure_path_env(&mut cmd);
    let output = cmd
        .args(["serve", &format!("--tcp={API_PORT}"), "off"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    match output {
        Ok(out) if out.status.success() => {
            append_log_line(
                ServiceId::Api,
                &format!("tailscale serve --tcp={API_PORT} off"),
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
                ServiceId::Api,
                &format!(
                    "tailscale serve off warning: {}",
                    stderr.trim()
                ),
            );
        }
        Err(err) => {
            append_log_line(
                ServiceId::Api,
                &format!("tailscale serve off error: {err}"),
            );
        }
    }
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
        // signal 0 = existence check
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
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
    if port_up {
        return (
            ServicePhase::Starting,
            format!(":{API_PORT} starting…"),
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
    let pid_starting = get_pid(ServiceId::Mobile).is_some_and(pid_alive);
    if is_marked_starting(ServiceId::Mobile) || pid_starting {
        return (ServicePhase::Starting, "starting…".into());
    }
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
    let mut notes = Vec::new();
    for service in [ServiceId::Docker, ServiceId::Api, ServiceId::Pty] {
        mark_starting(&[service]);
        on_progress();
        match start_service(repo_root, service) {
            Ok(msg) => notes.push(msg),
            Err(err) => {
                clear_starting(&[service]);
                notes.push(format!("{}: {err}", service.label()));
            }
        }
        on_progress();
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
    mark_starting(&[ServiceId::Api]);

    let pnpm = pnpm_bin();
    append_log_line(
        ServiceId::Api,
        &format!(
            "spawn {} --filter @backsteros/server dev (cwd={})",
            pnpm.display(),
            repo_root.display()
        ),
    );
    let mut cmd = Command::new(&pnpm);
    ensure_path_env(&mut cmd);
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

    // Process still alive — leave Starting mark; poller will flip to Running.
    append_log_line(
        ServiceId::Api,
        &format!("still starting after {}s (pid {pid})", HEALTH_ATTEMPTS / 2),
    );
    Ok(format!(
        "Core API spawned (pid {pid}, waiting for :{API_PORT}/health)"
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
        return Ok("PTY already running".into());
    }
    if let Some(pid) = get_pid(ServiceId::Pty) {
        if pid_alive(pid) {
            return Ok(format!("PTY starting (pid {pid})"));
        }
    }

    let pnpm = pnpm_bin();
    append_log_line(
        ServiceId::Pty,
        &format!(
            "spawn {} --filter @backsteros/desktop pty (cwd={})",
            pnpm.display(),
            repo_root.display()
        ),
    );
    let mut cmd = Command::new(&pnpm);
    ensure_path_env(&mut cmd);
    cmd.args(["--filter", "@backsteros/desktop", "pty"])
        .current_dir(repo_root)
        .env("FORCE_COLOR", "0");
    let pid = spawn_logged(ServiceId::Pty, cmd)?;
    Ok(format!("PTY started (pid {pid})"))
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
    if port_open(MOBILE_PORT) {
        return Ok("Mobile Development already running".into());
    }
    if let Some(pid) = get_pid(ServiceId::Mobile) {
        if pid_alive(pid) {
            return Ok(format!("Mobile Development starting (pid {pid})"));
        }
    }

    let pnpm = pnpm_bin();
    append_log_line(
        ServiceId::Mobile,
        &format!(
            "spawn {} --filter @backsteros/mobile dev (cwd={})",
            pnpm.display(),
            repo_root.display()
        ),
    );
    let mut cmd = Command::new(&pnpm);
    ensure_path_env(&mut cmd);
    cmd.args(["--filter", "@backsteros/mobile", "dev"])
        .current_dir(repo_root)
        .env("FORCE_COLOR", "0")
        .env("CI", "1"); // non-interactive Expo
    let pid = spawn_logged(ServiceId::Mobile, cmd)?;
    Ok(format!("Mobile Development started (pid {pid})"))
}

fn stop_mobile() -> Result<String, String> {
    if let Some(pid) = get_pid(ServiceId::Mobile) {
        append_log_line(ServiceId::Mobile, &format!("stopping pid {pid}"));
        kill_pid_tree(pid);
        set_pid(ServiceId::Mobile, None);
    }
    kill_port_listeners(MOBILE_PORT);
    Ok("Mobile Development stopped".into())
}

pub fn menu_label(status: &ServiceStatus) -> String {
    format!("{} — {}", status.id.label(), status.detail)
}
