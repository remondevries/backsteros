//! Optional local-core replica.
//!
//! Product desktop does **not** start Docker. Set
//! `BACKSTEROS_START_LOCAL_REPLICA=1` to bring up compose + the API on `:8788`.
//! Hub can still start that stack itself. This module does not start PTY or
//! Expo, and it does not stop the stack when the app quits.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const API_PORT: u16 = 8788;
const DOCKER_CONTAINERS: &[&str] = &[
    "backsteros-postgres",
    "backsteros-powersync",
    "backsteros-powersync-mongo",
];

static ENSURE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnsureOutcome {
    AlreadyRunning,
    Started,
    Skipped,
}

/// Product default is off. Hub starts the replica; this flag is the explicit path.
pub fn local_replica_requested() -> bool {
    match std::env::var("BACKSTEROS_START_LOCAL_REPLICA") {
        Ok(value) => {
            let value = value.trim();
            value == "1" || value.eq_ignore_ascii_case("true") || value.eq_ignore_ascii_case("yes")
        }
        Err(_) => false,
    }
}

pub fn spawn_ensure_local_core() {
    if !local_replica_requested() {
        log_line("local replica not requested; not starting Docker");
        return;
    }
    std::thread::spawn(|| match ensure_local_core() {
        Ok(outcome) => log_line(&format!("local-core {outcome:?}")),
        Err(err) => log_line(&format!("local-core ensure failed: {err}")),
    });
}

pub fn ensure_local_core() -> Result<EnsureOutcome, String> {
    if !local_replica_requested() {
        log_line("local replica not requested; not starting Docker");
        return Ok(EnsureOutcome::Skipped);
    }

    let _guard = ENSURE_LOCK
        .lock()
        .map_err(|_| "local-core ensure lock poisoned".to_string())?;

    if api_healthy() {
        enable_api_tailscale_serve();
        return Ok(EnsureOutcome::AlreadyRunning);
    }

    let repo = resolve_repo_root()?;
    log_line(&format!("ensuring local-core from {}", repo.display()));
    ensure_docker(&repo)?;

    if api_healthy() {
        enable_api_tailscale_serve();
        return Ok(EnsureOutcome::AlreadyRunning);
    }
    if port_open(API_PORT) {
        return Err(format!(
            "port :{API_PORT} is in use but /health is not OK — not starting a second API"
        ));
    }

    start_api(&repo)?;
    enable_api_tailscale_serve();
    Ok(EnsureOutcome::Started)
}

fn ensure_docker(repo: &Path) -> Result<(), String> {
    if docker_stack_running() {
        log_line("docker stack already running");
        return Ok(());
    }
    ensure_docker_daemon()?;
    log_line("docker compose up -d postgres mongo powersync");
    let output = docker_command()
        .args(["compose", "up", "-d", "postgres", "mongo", "powersync"])
        .current_dir(repo)
        .output()
        .map_err(|err| format!("docker compose failed to spawn: {err}"))?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    log_line(&format!("{stdout}{stderr}"));
    if !output.status.success() {
        return Err(format!(
            "docker compose up failed: {}",
            clip(stderr.trim())
        ));
    }
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(90) {
        if docker_stack_running() {
            log_line("docker stack running");
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err("docker stack did not become running within 90s".into())
}

fn ensure_docker_daemon() -> Result<(), String> {
    if docker_info_ok() {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        log_line("docker daemon down; opening Docker.app");
        let _ = Command::new("/usr/bin/open")
            .args(["-a", "Docker"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(90) {
        if docker_info_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_secs(1));
    }
    Err("Docker daemon is not running".into())
}

fn docker_info_ok() -> bool {
    docker_command()
        .args(["info"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn docker_stack_running() -> bool {
    DOCKER_CONTAINERS.iter().all(|name| container_running(name))
}

fn container_running(name: &str) -> bool {
    let output = docker_command()
        .args(["inspect", "-f", "{{.State.Running}}", name])
        .output();
    match output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim() == "true"
        }
        _ => false,
    }
}

fn start_api(repo: &Path) -> Result<(), String> {
    let node = resolve_node()?;
    let pnpm = resolve_pnpm()?;
    let mut cmd = pnpm_command(&pnpm, &node);
    cmd.args(["--filter", "@backsteros/server", "dev"])
        .current_dir(repo)
        .env("FORCE_COLOR", "0")
        .stdin(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let log = open_log()?;
    let log_err = log.try_clone().map_err(|err| err.to_string())?;
    cmd.stdout(Stdio::from(log));
    cmd.stderr(Stdio::from(log_err));
    log_line(&format!(
        "starting API via {} (node {})",
        pnpm.display(),
        node.display()
    ));
    let child = cmd
        .spawn()
        .map_err(|err| format!("failed to start core API: {err}"))?;
    let pid = child.id();
    // Detach. Dropping Child does not kill the process.
    drop(child);

    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(60) {
        if api_healthy() {
            log_line(&format!("core API healthy (pid {pid})"));
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err(format!(
        "core API did not become healthy within 60s (pid {pid}). See {}",
        log_path().display()
    ))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PnpmLaunch {
    Native,
    Node,
    Shell,
}

fn pnpm_launch_kind(pnpm: &Path) -> PnpmLaunch {
    if is_native_executable(pnpm) {
        return PnpmLaunch::Native;
    }
    let mut header = [0u8; 2];
    if let Ok(mut file) = fs::File::open(pnpm) {
        if file.read(&mut header).ok() == Some(2) && &header == b"#!" {
            return PnpmLaunch::Node;
        }
    }
    // Homebrew pnpm is a shebang-less shell script. Spawning it directly
    // returns ENOEXEC on macOS; `node <pnpm>` SyntaxErrors.
    PnpmLaunch::Shell
}

fn pnpm_command(pnpm: &Path, node: &Path) -> Command {
    let mut cmd = match pnpm_launch_kind(pnpm) {
        PnpmLaunch::Native => Command::new(pnpm),
        PnpmLaunch::Node => {
            let mut cmd = Command::new(node);
            cmd.arg(pnpm);
            cmd
        }
        PnpmLaunch::Shell => {
            let mut cmd = Command::new("/bin/sh");
            cmd.arg(pnpm);
            cmd
        }
    };
    apply_tool_env(&mut cmd, node);
    cmd
}

fn enable_api_tailscale_serve() {
    let Some(bin) = which(
        "tailscale",
        &[
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
            "/opt/homebrew/bin/tailscale",
            "/usr/local/bin/tailscale",
        ],
    ) else {
        log_line("tailscale not found — skipping serve for :8788");
        return;
    };
    let mut cmd = Command::new(bin);
    if let Ok(node) = resolve_node() {
        apply_tool_env(&mut cmd, &node);
    }
    let target = format!("tcp://127.0.0.1:{API_PORT}");
    match cmd
        .args(["serve", "--bg", &format!("--tcp={API_PORT}"), &target])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
    {
        Ok(out) if out.status.success() => {
            log_line(&format!("tailscale serve --tcp={API_PORT} → {target}"));
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            log_line(&format!(
                "tailscale serve warning: {}",
                clip(stderr.trim())
            ));
        }
        Err(err) => log_line(&format!("tailscale serve spawn error: {err}")),
    }
}

fn api_healthy() -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(
        &format!("127.0.0.1:{API_PORT}").parse().expect("static addr"),
        Duration::from_millis(400),
    ) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    if stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut buf = [0u8; 1024];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    let text = String::from_utf8_lossy(&buf[..n]);
    text.contains(" 200 ") || text.starts_with("HTTP/1.1 200") || text.starts_with("HTTP/1.0 200")
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().expect("static addr"),
        Duration::from_millis(250),
    )
    .is_ok()
}

fn resolve_repo_root() -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("BACKSTEROS_REPO_ROOT") {
        let path = PathBuf::from(root);
        if looks_like_repo(&path) {
            return Ok(path);
        }
    }
    if let Some(home) = home_dir() {
        let config = home.join(".config/backsteros/hub.json");
        if let Ok(text) = fs::read_to_string(config) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(root) = value.get("repo_root").and_then(|v| v.as_str()) {
                    let path = PathBuf::from(root.trim());
                    if looks_like_repo(&path) {
                        return Ok(path);
                    }
                }
            }
        }
        let candidate = home.join("BacksterOS/Projects/OS/Codebase");
        if looks_like_repo(&candidate) {
            return Ok(candidate);
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for ancestor in manifest.ancestors().take(6) {
        if looks_like_repo(ancestor) {
            return Ok(ancestor.to_path_buf());
        }
    }
    Err("could not find the BacksterOS repo (pnpm-workspace.yaml + docker-compose.yml)".into())
}

fn looks_like_repo(path: &Path) -> bool {
    path.join("pnpm-workspace.yaml").is_file()
        && path.join("core/server").is_dir()
        && path.join("docker-compose.yml").is_file()
}

fn resolve_node() -> Result<PathBuf, String> {
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
    ];
    if let Some(home) = home_dir() {
        candidates.push(home.join(".local/bin/node"));
    }
    for candidate in candidates {
        if node_version_ok(&candidate) {
            return Ok(candidate);
        }
    }
    Err("no Node.js ≥22 found. Install it with Homebrew (`brew install node`).".into())
}

fn node_version_ok(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let Ok(output) = Command::new(path).arg("-v").output() else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let version = text.trim().trim_start_matches('v');
    let mut parts = version.split('.');
    let Ok(major) = parts.next().unwrap_or("0").parse::<u32>() else {
        return false;
    };
    let Ok(minor) = parts.next().unwrap_or("0").parse::<u32>() else {
        return false;
    };
    major > 22 || (major == 22 && minor >= 13)
}

fn resolve_pnpm() -> Result<PathBuf, String> {
    which(
        "pnpm",
        &[
            "/opt/homebrew/bin/pnpm",
            "/usr/local/bin/pnpm",
        ],
    )
    .ok_or_else(|| "pnpm not found. Install it with Homebrew (`brew install pnpm`).".into())
}

fn which(name: &str, preferred: &[&str]) -> Option<PathBuf> {
    for path in preferred {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    let mut dirs = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];
    if let Some(home) = home_dir() {
        dirs.insert(0, home.join("Library/pnpm"));
        dirs.insert(0, home.join(".local/bin"));
    }
    dirs.into_iter()
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}

fn apply_tool_env(cmd: &mut Command, node: &Path) {
    cmd.env("PATH", tool_path(node));
    if std::env::var_os("DOCKER_HOST").is_none() {
        if let Some(home) = home_dir() {
            let sock = home.join(".docker/run/docker.sock");
            if sock.exists() {
                cmd.env("DOCKER_HOST", format!("unix://{}", sock.display()));
            }
        }
    }
}

fn tool_path(node: &Path) -> String {
    let mut parts = Vec::new();
    let mut push = |path: String| {
        if !path.is_empty() && !parts.iter().any(|existing: &String| existing == &path) {
            parts.push(path);
        }
    };
    if let Some(dir) = node.parent() {
        push(dir.to_string_lossy().into_owned());
    }
    if let Some(home) = home_dir() {
        push(home.join(".local/bin").to_string_lossy().into_owned());
        push(home.join("Library/pnpm").to_string_lossy().into_owned());
    }
    push("/opt/homebrew/bin".into());
    push("/opt/homebrew/sbin".into());
    push("/usr/local/bin".into());
    push("/usr/bin".into());
    push("/bin".into());
    if let Ok(existing) = std::env::var("PATH") {
        for part in existing.split(':') {
            push(part.to_string());
        }
    }
    parts.join(":")
}

fn docker_command() -> Command {
    let bin = which(
        "docker",
        &[
            "/usr/local/bin/docker",
            "/opt/homebrew/bin/docker",
            "/Applications/Docker.app/Contents/Resources/bin/docker",
        ],
    )
    .unwrap_or_else(|| PathBuf::from("docker"));
    let mut cmd = Command::new(bin);
    if let Ok(node) = resolve_node() {
        apply_tool_env(&mut cmd, &node);
    }
    cmd
}

fn is_native_executable(path: &Path) -> bool {
    let mut magic = [0u8; 4];
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    if file.read(&mut magic).ok() != Some(4) {
        return false;
    }
    matches!(
        magic,
        [0xcf, 0xfa, 0xed, 0xfe]
            | [0xfe, 0xed, 0xfa, 0xcf]
            | [0xce, 0xfa, 0xed, 0xfe]
            | [0xfe, 0xed, 0xfa, 0xce]
            | [0xca, 0xfe, 0xba, 0xbe]
            | [0xbe, 0xba, 0xfe, 0xca]
            | [0x7f, b'E', b'L', b'F']
    )
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn log_path() -> PathBuf {
    home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".config/backsteros/desktop/local-core.log")
}

fn open_log() -> Result<std::fs::File, String> {
    let path = log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|err| err.to_string())
}

fn log_line(message: &str) {
    let line = format!(
        "{} {message}\n",
        chrono_less_stamp()
    );
    eprint!("[desktop] {line}");
    if let Ok(mut file) = open_log() {
        let _ = file.write_all(line.as_bytes());
    }
}

fn chrono_less_stamp() -> String {
    let elapsed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    elapsed.to_string()
}

fn clip(text: &str) -> String {
    text.chars().take(240).collect()
}

/// Owner credential for cloud-core. Reads `~/.config/backsteros/cli.env`.
/// Does not log the secret.
#[tauri::command]
pub fn owner_api_key() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    let path = PathBuf::from(home).join(".config/backsteros/cli.env");
    let text = fs::read_to_string(&path)
        .map_err(|err| format!("could not read {}: {err}", path.display()))?;
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() != "BACKSTEROS_API_KEY" {
            continue;
        }
        let value = value.trim().trim_matches('"').trim_matches('\'');
        if !value.starts_with("sk_live_") {
            return Err("BACKSTEROS_API_KEY must be an sk_live_ owner key".into());
        }
        return Ok(value.to_string());
    }
    Err("BACKSTEROS_API_KEY is missing from ~/.config/backsteros/cli.env".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_root_is_the_monorepo() {
        let root = resolve_repo_root().expect("repo");
        assert!(looks_like_repo(&root));
    }

    #[test]
    fn shebang_less_script_uses_shell() {
        let dir = std::env::temp_dir().join(format!(
            "backsteros-pnpm-kind-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("pnpm");
        fs::write(&path, "# pnpm shell shim\necho ok\n").unwrap();
        assert_eq!(pnpm_launch_kind(&path), PnpmLaunch::Shell);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn shebang_script_uses_node() {
        let dir = std::env::temp_dir().join(format!(
            "backsteros-pnpm-shebang-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("pnpm");
        fs::write(&path, "#!/usr/bin/env node\nconsole.log(1)\n").unwrap();
        assert_eq!(pnpm_launch_kind(&path), PnpmLaunch::Node);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn installed_pnpm_launches() {
        let pnpm = resolve_pnpm().expect("pnpm");
        let node = resolve_node().expect("node");
        let mut cmd = pnpm_command(&pnpm, &node);
        cmd.arg("--version");
        let output = cmd.output().expect("spawn pnpm");
        assert!(
            output.status.success(),
            "pnpm --version failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let version = String::from_utf8_lossy(&output.stdout);
        assert!(
            version.trim().chars().next().is_some_and(|c| c.is_ascii_digit()),
            "unexpected pnpm version {version:?}"
        );
    }

    #[test]
    fn ensure_skips_docker_unless_replica_flag() {
        let previous = std::env::var("BACKSTEROS_START_LOCAL_REPLICA").ok();
        std::env::remove_var("BACKSTEROS_START_LOCAL_REPLICA");
        let outcome = ensure_local_core().expect("ensure");
        assert_eq!(outcome, EnsureOutcome::Skipped);
        match previous {
            Some(value) => std::env::set_var("BACKSTEROS_START_LOCAL_REPLICA", value),
            None => std::env::remove_var("BACKSTEROS_START_LOCAL_REPLICA"),
        }
    }
}
