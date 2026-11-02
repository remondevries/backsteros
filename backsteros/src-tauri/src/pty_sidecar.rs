//! Ensure the local PTY sidecar (`:3101`) is up when the desktop app starts.
//!
//! Build Live/Log, Record git diffs, task Terminal, and Cursor ACP all talk to
//! this Node process. Previously it had to be started by hand
//! (`pnpm --filter @backsteros/desktop pty`); Dock/Finder launches left it down.
//!
//! Behavior:
//! - If `http://127.0.0.1:3101/health` already answers → no-op (shared with iPad).
//! - Else spawn `backsteros/scripts/pty-server.mjs` with the same auth token the
//!   Vite app embeds (`VITE_PTY_AUTH_TOKEN`) / `AGENT_PTY_AUTH_TOKEN`.
//! - Opt out with `BACKSTEROS_SKIP_PTY=1`.
//! - The child is detached so ⌘Q does not tear down a sidecar iPad may still use.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Duration;

use tauri::AppHandle;

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 3101;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PtyEnsureOutcome {
    AlreadyRunning,
    Started,
    Skipped(&'static str),
}

pub fn spawn_ensure_pty(_app: AppHandle) {
    thread::spawn(|| match ensure_pty() {
        Ok(outcome) => log_line(&format!("pty {outcome:?}")),
        Err(err) => log_line(&format!("pty ensure failed: {err}")),
    });
}

pub fn ensure_pty() -> Result<PtyEnsureOutcome, String> {
    if skip_pty() {
        return Ok(PtyEnsureOutcome::Skipped("BACKSTEROS_SKIP_PTY=1"));
    }
    if pty_health_ok() {
        return Ok(PtyEnsureOutcome::AlreadyRunning);
    }

    let desktop = resolve_desktop_root()?;
    let script = desktop.join("scripts/pty-server.mjs");
    if !script.is_file() {
        return Err(format!(
            "missing {} — open BacksterOS from a machine with the Codebase checkout",
            script.display()
        ));
    }

    let token = resolve_pty_auth_token(&desktop)?;
    let node = resolve_node()?;
    let host = std::env::var("PTY_HOST")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_HOST.to_string());
    let port = std::env::var("PTY_PORT")
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .unwrap_or(DEFAULT_PORT);

    let log_path = log_file_path();
    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    {
        let mut header = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|err| format!("open {}: {err}", log_path.display()))?;
        let _ = writeln!(
            header,
            "\n---- pty ensure {} host={} port={} ----",
            chrono_stamp(),
            host,
            port
        );
    }

    // Launch via nohup so ⌘Q does not SIGHUP a sidecar iPad may still use.
    // stdout of bash is only the background pid (`echo $!`); server logs go to
    // the append file inside the nohup line.
    let launch = format!(
        "nohup \"{}\" \"{}\" >>\"{}\" 2>&1 </dev/null & echo $!",
        node.display(),
        script.display(),
        log_path.display()
    );
    let output = Command::new("/bin/bash")
        .arg("-lc")
        .arg(&launch)
        .current_dir(&desktop)
        .env("PTY_HOST", &host)
        .env("PTY_PORT", port.to_string())
        .env("PTY_AUTH_TOKEN", &token)
        .env("PATH", tool_path(&node))
        .output()
        .map_err(|err| format!("spawn pty-server.mjs: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "pty launch failed (status {:?}): {stderr}",
            output.status.code()
        ));
    }
    let pid = String::from_utf8_lossy(&output.stdout).trim().to_string();
    log_line(&format!(
        "pty spawned pid={} script={}",
        if pid.is_empty() { "?" } else { pid.as_str() },
        script.display()
    ));

    for _ in 0..40 {
        thread::sleep(Duration::from_millis(250));
        if pty_health_ok() {
            return Ok(PtyEnsureOutcome::Started);
        }
    }

    Err(format!(
        "pty started but /health on 127.0.0.1:{port} did not become ready; see {}",
        log_path.display()
    ))
}

fn skip_pty() -> bool {
    matches!(
        std::env::var("BACKSTEROS_SKIP_PTY").as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE") | Ok("yes") | Ok("YES")
    )
}

fn pty_health_ok() -> bool {
    let port = std::env::var("PTY_PORT")
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .unwrap_or(DEFAULT_PORT);
    // Cheap TCP probe first — /health is unauthenticated.
    if TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}")
            .parse()
            .expect("loopback socket addr"),
        Duration::from_millis(200),
    )
    .is_err()
    {
        return false;
    }
    let url = format!("http://127.0.0.1:{port}/health");
    match ureq_get_ok(&url) {
        Ok(body) => body.contains("backsteros-pty") || body.contains("\"ok\":true"),
        Err(_) => false,
    }
}

/// Tiny HTTP GET without pulling reqwest — local-core already uses raw sockets.
fn ureq_get_ok(url: &str) -> Result<String, String> {
    let parsed = url
        .strip_prefix("http://")
        .ok_or_else(|| "only http:// health URLs supported".to_string())?;
    let (host_port, path) = parsed
        .split_once('/')
        .map(|(h, p)| (h, format!("/{p}")))
        .unwrap_or((parsed, "/".to_string()));
    let mut stream = TcpStream::connect_timeout(
        &host_port
            .parse()
            .map_err(|err| format!("bad health addr {host_port}: {err}"))?,
        Duration::from_millis(400),
    )
    .map_err(|err| format!("connect {host_port}: {err}"))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(800)))
        .ok();
    stream
        .set_write_timeout(Some(Duration::from_millis(400)))
        .ok();
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host_port}\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|err| format!("write health request: {err}"))?;
    let mut body = Vec::new();
    std::io::Read::read_to_end(&mut stream, &mut body)
        .map_err(|err| format!("read health response: {err}"))?;
    String::from_utf8(body).map_err(|err| format!("health body utf8: {err}"))
}

fn resolve_pty_auth_token(desktop: &Path) -> Result<String, String> {
    if let Ok(value) = std::env::var("PTY_AUTH_TOKEN") {
        let trimmed = value.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }
    if let Some(token) = read_env_key(desktop.join(".env"), "VITE_PTY_AUTH_TOKEN") {
        return Ok(token);
    }
    if let Some(token) = read_env_key(desktop.join(".env.local"), "VITE_PTY_AUTH_TOKEN") {
        return Ok(token);
    }
    if let Some(repo) = desktop.parent() {
        if let Some(token) = read_env_key(repo.join("core/server/.env"), "AGENT_PTY_AUTH_TOKEN") {
            return Ok(token);
        }
    }
    Err(
        "PTY auth token missing — set VITE_PTY_AUTH_TOKEN in backsteros/.env (must match the sidecar)"
            .into(),
    )
}

fn read_env_key(path: PathBuf, key: &str) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((name, value)) = trimmed.split_once('=') else {
            continue;
        };
        if name.trim() != key {
            continue;
        }
        let value = value.trim().trim_matches('"').trim_matches('\'').trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

fn resolve_desktop_root() -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("BACKSTEROS_DESKTOP_ROOT") {
        let path = PathBuf::from(root);
        if path.join("scripts/pty-server.mjs").is_file() {
            return Ok(path);
        }
    }
    if let Ok(repo) = resolve_repo_root() {
        let desktop = repo.join("backsteros");
        if desktop.join("scripts/pty-server.mjs").is_file() {
            return Ok(desktop);
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(desktop) = manifest.parent() {
        if desktop.join("scripts/pty-server.mjs").is_file() {
            return Ok(desktop.to_path_buf());
        }
    }
    Err("could not find backsteros/scripts/pty-server.mjs".into())
}

fn resolve_repo_root() -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("BACKSTEROS_REPO_ROOT") {
        let path = PathBuf::from(root);
        if looks_like_repo(&path) {
            return Ok(path);
        }
    }
    if let Some(home) = home_dir() {
        let candidate = home.join("BacksterOS/Projects/OS/Codebase");
        if looks_like_repo(&candidate) {
            return Ok(candidate);
        }
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
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for ancestor in manifest.ancestors().take(6) {
        if looks_like_repo(ancestor) {
            return Ok(ancestor.to_path_buf());
        }
    }
    Err("could not find the BacksterOS repo".into())
}

fn looks_like_repo(path: &Path) -> bool {
    path.join("pnpm-workspace.yaml").is_file() && path.join("backsteros/scripts/pty-server.mjs").is_file()
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn resolve_node() -> Result<PathBuf, String> {
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
    ];
    if let Some(home) = home_dir() {
        candidates.push(home.join(".local/bin/node"));
    }
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(':') {
            let candidate = PathBuf::from(dir).join("node");
            if candidate.is_file() {
                candidates.push(candidate);
            }
        }
    }
    for candidate in candidates {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err("Node.js not found — install with Homebrew (`brew install node`)".into())
}

fn tool_path(node: &Path) -> String {
    let mut parts = Vec::new();
    let mut push = |path: String| {
        if !path.is_empty() && !parts.iter().any(|existing| existing == &path) {
            parts.push(path);
        }
    };
    if let Some(dir) = node.parent() {
        push(dir.to_string_lossy().into_owned());
    }
    if let Some(home) = home_dir() {
        push(home.join(".local/bin").to_string_lossy().into_owned());
        push(home.join("Library/pnpm").to_string_lossy().into_owned());
        push(home.join(".cargo/bin").to_string_lossy().into_owned());
    }
    push("/opt/homebrew/bin".into());
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

fn log_file_path() -> PathBuf {
    home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".config/backsteros/desktop/pty-sidecar.log")
}

fn log_line(message: &str) {
    let path = log_file_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{} {message}", chrono_stamp());
    }
    eprintln!("[backsteros-desktop] {message}");
}

fn chrono_stamp() -> String {
    // Avoid chrono crate — local ISO-ish stamp via system clock.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{secs}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skip_flag_parses() {
        std::env::set_var("BACKSTEROS_SKIP_PTY", "1");
        assert!(skip_pty());
        std::env::remove_var("BACKSTEROS_SKIP_PTY");
        assert!(!skip_pty());
    }

    #[test]
    fn desktop_root_resolves_in_dev_tree() {
        let root = resolve_desktop_root().expect("desktop root");
        assert!(root.join("scripts/pty-server.mjs").is_file());
    }
}
