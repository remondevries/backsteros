//! Optional local-core replica bootstrap.
//!
//! Product desktop defaults to local-core (`:8788`). Startup is owned by
//! `scripts/local-core/` (LaunchAgent `run.sh` or one-shot `ensure-once.sh`).
//! Set `BACKSTEROS_START_LOCAL_REPLICA=1` to invoke `ensure-once.sh` from the
//! app — do not duplicate compose/API start logic here.
//!
//! Prefer the dedicated `origin/production` worktree at
//! `~/.backsteros/local-core-build` (OS-61) over a dirty developer checkout.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const API_PORT: u16 = 8788;

static ENSURE_LOCK: Mutex<()> = Mutex::new(());
static VERSION_MISMATCH_WARNED: AtomicBool = AtomicBool::new(false);

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

pub fn spawn_ensure_local_core(app: AppHandle) {
    std::thread::spawn(move || {
        if local_replica_requested() {
            match ensure_local_core() {
                Ok(outcome) => log_line(&format!("local-core {outcome:?}")),
                Err(err) => log_line(&format!("local-core ensure failed: {err}")),
            }
        } else {
            log_line("local replica not requested; not starting Docker");
        }
        if let Err(err) = ensure_sync_event_pull_on_start(&app) {
            log_line(&format!("sync-event pull ensure failed: {err}"));
        }
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
        warn_if_version_mismatch();
        return Ok(EnsureOutcome::AlreadyRunning);
    }

    let repo = resolve_repo_root()?;
    let script = repo.join("scripts/local-core/ensure-once.sh");
    if !script.is_file() {
        return Err(format!(
            "missing {} — refresh ~/.backsteros/local-core-build",
            script.display()
        ));
    }
    log_line(&format!(
        "ensuring local-core via {}",
        script.display()
    ));
    let status = Command::new("bash")
        .arg(&script)
        .current_dir(&repo)
        .status()
        .map_err(|err| format!("failed to spawn ensure-once.sh: {err}"))?;
    if !status.success() {
        return Err(format!(
            "ensure-once.sh exited {}",
            status.code().unwrap_or(-1)
        ));
    }
    if !api_healthy() {
        return Err("ensure-once.sh finished but /health is still not OK".into());
    }
    warn_if_version_mismatch();
    Ok(EnsureOutcome::Started)
}

const SYNC_EVENT_PULL_PATH: &str = "/internal/core-replication/sync-event-pull";

fn env_assignment_key(line: &str) -> Option<&str> {
    let trimmed = line.trim_start();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }
    let rest = trimmed
        .strip_prefix("export ")
        .map(str::trim_start)
        .unwrap_or(trimmed);
    let (name, _) = rest.split_once('=')?;
    Some(name.trim())
}

fn env_file_value(text: &str, key: &str) -> Option<String> {
    for raw in text.split('\n') {
        let line = raw.trim_end_matches('\r');
        let Some(name) = env_assignment_key(line) else {
            continue;
        };
        if name != key {
            continue;
        }
        let trimmed = line.trim_start();
        let rest = trimmed
            .strip_prefix("export ")
            .map(str::trim_start)
            .unwrap_or(trimmed);
        let (_, value) = rest.split_once('=')?;
        let value = value.trim().trim_matches('"').trim_matches('\'');
        if value.is_empty() {
            return None;
        }
        return Some(value.to_string());
    }
    None
}

/// Replace every non-comment assignment of `key` (Node --env-file is last-wins).
/// Preserves other lines and CRLF endings byte-for-byte.
fn upsert_env_assignment(text: &str, key: &str, value: &str) -> String {
    let uses_crlf = text.contains("\r\n");
    let newline = if uses_crlf { "\r\n" } else { "\n" };
    let mut out = String::with_capacity(text.len() + key.len() + value.len() + 8);
    let mut replaced_any = false;

    for segment in text.split_inclusive('\n') {
        let ending_len = if segment.ends_with("\r\n") {
            2
        } else if segment.ends_with('\n') {
            1
        } else {
            0
        };
        let body = &segment[..segment.len() - ending_len];
        let ending = &segment[segment.len() - ending_len..];
        if env_assignment_key(body) == Some(key) {
            out.push_str(key);
            out.push('=');
            out.push_str(value);
            out.push_str(ending);
            replaced_any = true;
        } else {
            out.push_str(segment);
        }
    }

    if !replaced_any {
        if !out.is_empty() && !out.ends_with('\n') {
            out.push_str(newline);
        }
        out.push_str(key);
        out.push('=');
        out.push_str(value);
        out.push_str(newline);
    }
    out
}

fn resolve_local_core_env_file() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("LOCAL_CORE_ENV_FILE") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Some(path);
        }
    }
    if let Some(home) = home_dir() {
        let dedicated = home.join(".config/backsteros/local-core.env");
        if dedicated.is_file() {
            return Some(dedicated);
        }
    }
    if let Ok(root) = resolve_repo_root() {
        let fallback = root.join("core/server/.env");
        if fallback.is_file() {
            return Some(fallback);
        }
    }
    None
}

fn atomic_write_text(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let tmp = parent.join(format!(
        ".{}.tmp-{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("env"),
        std::process::id()
    ));
    let cleanup_tmp = || {
        let _ = fs::remove_file(&tmp);
    };

    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let mode = fs::metadata(path)
            .map(|meta| meta.permissions().mode())
            .unwrap_or(0o600);
        options.mode(mode & 0o777);
    }

    let write_result = (|| -> Result<(), String> {
        let mut file = options
            .open(&tmp)
            .map_err(|err| format!("could not create temp {}: {err}", tmp.display()))?;
        file.write_all(contents.as_bytes())
            .map_err(|err| format!("could not write temp {}: {err}", tmp.display()))?;
        file.sync_all()
            .map_err(|err| format!("could not fsync temp {}: {err}", tmp.display()))?;
        fs::rename(&tmp, path)
            .map_err(|err| format!("could not rename temp over {}: {err}", path.display()))?;
        Ok(())
    })();

    if write_result.is_err() {
        cleanup_tmp();
    }
    write_result
}

fn persist_sync_event_pull_enabled(path: &Path) -> Result<(), String> {
    if path.file_name().and_then(|name| name.to_str()) != Some("local-core.env") {
        log_line(
            "sync-event pull: runtime enabled; not rewriting checkout env (persist in ~/.config/backsteros/local-core.env)",
        );
        return Ok(());
    }
    let text = fs::read_to_string(path)
        .map_err(|err| format!("could not read {}: {err}", path.display()))?;
    let next = upsert_env_assignment(&text, "CORE_REPLICATION_SYNC_EVENTS_PULL", "1");
    if next != text {
        atomic_write_text(path, &next)?;
    }
    Ok(())
}

fn parse_http_response(raw: &str) -> Result<(u16, &str), String> {
    let (header, body) = raw
        .split_once("\r\n\r\n")
        .ok_or_else(|| "invalid HTTP response (no header terminator)".to_string())?;
    let status_line = header
        .lines()
        .next()
        .ok_or_else(|| "invalid HTTP response (empty)".to_string())?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| format!("invalid HTTP status line: {status_line}"))?;
    Ok((status, body))
}

fn require_sync_event_pull_ok(value: &serde_json::Value) -> Result<(), String> {
    if value.get("error").is_some() {
        let code = value
            .get("code")
            .and_then(|v| v.as_str())
            .unwrap_or("error");
        return Err(format!("sync-event pull response error ({code})"));
    }
    match value.get("ok").and_then(|v| v.as_bool()) {
        Some(true) => Ok(()),
        Some(false) => Err("sync-event pull response ok=false".into()),
        None => Err("sync-event pull response missing ok=true".into()),
    }
}

/// Loopback HTTP/1.1 — secret stays off process argv (`ps`).
fn replication_http(
    method: &str,
    secret: &str,
    body: Option<&str>,
) -> Result<serde_json::Value, String> {
    let mut stream = TcpStream::connect_timeout(
        &format!("127.0.0.1:{API_PORT}").parse().expect("static addr"),
        Duration::from_millis(800),
    )
    .map_err(|err| format!("connect local-core: {err}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(8)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(8)));

    let body_bytes = body.unwrap_or("");
    let mut request = format!(
        "{method} {SYNC_EVENT_PULL_PATH} HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {secret}\r\nConnection: close\r\n"
    );
    if body.is_some() {
        request.push_str("Content-Type: application/json\r\n");
        request.push_str(&format!("Content-Length: {}\r\n", body_bytes.len()));
    }
    request.push_str("\r\n");
    if let Some(body) = body {
        request.push_str(body);
    }
    stream
        .write_all(request.as_bytes())
        .map_err(|err| format!("write local-core request: {err}"))?;

    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(_) => break,
        }
        if buf.len() > 256 * 1024 {
            break;
        }
    }
    let text = String::from_utf8_lossy(&buf);
    let (status, body) = parse_http_response(&text)?;
    if !(200..300).contains(&status) {
        return Err(format!("sync-event pull HTTP {status}"));
    }
    let value: serde_json::Value = serde_json::from_str(body.trim())
        .map_err(|err| format!("invalid JSON from local-core: {err}"))?;
    require_sync_event_pull_ok(&value)?;
    Ok(value)
}

fn prompt_pending_sync_event_pull(app: &AppHandle, summary: &str) -> bool {
    let message = format!(
        "Local core still has unpushed state ({summary}). Cloud sync-event pull is paused so those rows are not overwritten.\n\nKeep paused: pull resumes automatically once local rows are pushed and dead letters / local-only mismatches are resolved.\n\nPull anyway, or keep pull paused?"
    );
    app.dialog()
        .message(message)
        .title("Sync-event pull paused")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Pull anyway".to_string(),
            "Keep paused".to_string(),
        ))
        .blocking_show()
}

fn wait_for_local_core_health() -> bool {
    for _ in 0..20 {
        if api_healthy() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    api_healthy()
}

fn replication_interval_wait(env_text: &str) -> Duration {
    let ms = env_file_value(env_text, "CORE_REPLICATION_INTERVAL_MS")
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(15_000)
        .clamp(2_000, 120_000);
    Duration::from_millis(ms)
}

fn pending_is_unpushed_only(pending: &serde_json::Value) -> bool {
    let unpushed = pending
        .get("unpushedRowCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let dead = pending
        .get("openDeadLetterCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let local_only = pending
        .get("localOnlyRowCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    unpushed > 0 && dead == 0 && local_only == 0
}

fn ensure_sync_event_pull_on_start(app: &AppHandle) -> Result<(), String> {
    if !wait_for_local_core_health() {
        log_line("sync-event pull: local-core /health not ready; skip");
        return Ok(());
    }
    let Some(env_path) = resolve_local_core_env_file() else {
        log_line("sync-event pull: no local-core env file; skip");
        return Ok(());
    };
    let text = fs::read_to_string(&env_path)
        .map_err(|err| format!("could not read {}: {err}", env_path.display()))?;
    let Some(secret) = env_file_value(&text, "CORE_REPLICATION_SECRET") else {
        log_line("sync-event pull: CORE_REPLICATION_SECRET missing; skip");
        return Ok(());
    };

    let mut status = replication_http("GET", &secret, None)?;
    let mut paused = status
        .get("pausedForPending")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if paused {
        if let Some(pending) = status.get("pending") {
            if pending_is_unpushed_only(pending) {
                let wait = replication_interval_wait(&text);
                log_line(&format!(
                    "sync-event pull: unpushed-only pending; re-check after {}s",
                    wait.as_secs()
                ));
                std::thread::sleep(wait);
                status = replication_http("GET", &secret, None)?;
                paused = status
                    .get("pausedForPending")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
            }
        }
    }

    let summary = status
        .get("summary")
        .and_then(|v| v.as_str())
        .unwrap_or("pending local state")
        .to_string();

    if paused {
        log_line(&format!(
            "sync-event pull paused for pending local state ({summary})"
        ));
        let pull_anyway = prompt_pending_sync_event_pull(app, &summary);
        if pull_anyway {
            replication_http(
                "POST",
                &secret,
                Some(r#"{"enabled":true,"acknowledgePending":true}"#),
            )?;
            persist_sync_event_pull_enabled(&env_path)?;
            log_line("sync-event pull enabled after pending-state confirm");
        } else {
            log_line(
                "sync-event pull kept paused; resumes automatically when pending local state clears",
            );
        }
        return Ok(());
    }

    replication_http("POST", &secret, Some(r#"{"enabled":true}"#))?;
    persist_sync_event_pull_enabled(&env_path)?;
    log_line("sync-event pull enabled on desktop start");
    Ok(())
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

fn fetch_health_json() -> Option<serde_json::Value> {
    let mut stream = TcpStream::connect_timeout(
        &format!("127.0.0.1:{API_PORT}").parse().ok()?,
        Duration::from_millis(400),
    )
    .ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .ok()?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(_) => break,
        }
        if buf.len() > 64 * 1024 {
            break;
        }
    }
    let text = String::from_utf8_lossy(&buf);
    if !(text.contains(" 200 ")
        || text.starts_with("HTTP/1.1 200")
        || text.starts_with("HTTP/1.0 200"))
    {
        return None;
    }
    let body = text.split("\r\n\r\n").nth(1)?;
    serde_json::from_str(body.trim()).ok()
}

/// Log once when local-core `/health` reports a peer version mismatch (OS-61).
fn warn_if_version_mismatch() {
    let Some(health) = fetch_health_json() else {
        return;
    };
    let mismatch = health
        .get("versionMismatch")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !mismatch {
        VERSION_MISMATCH_WARNED.store(false, Ordering::SeqCst);
        return;
    }
    if VERSION_MISMATCH_WARNED.swap(true, Ordering::SeqCst) {
        return;
    }
    let local = health
        .get("version")
        .and_then(|v| v.get("commit"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let peer = health
        .get("peerVersion")
        .and_then(|v| v.get("commit"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    log_line(&format!(
        "WARNING: local-core version mismatch with replication peer (local={local} peer={peer}). Run scripts/local-core/update-build.sh after the cloud deploy."
    ));
}

fn resolve_repo_root() -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("BACKSTEROS_LOCAL_CORE_BUILD") {
        let path = PathBuf::from(root);
        if looks_like_repo(&path) {
            return Ok(path);
        }
    }
    if let Some(home) = home_dir() {
        let dedicated = home.join(".backsteros/local-core-build");
        if looks_like_repo(&dedicated) {
            return Ok(dedicated);
        }
    }
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

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Rotate when past this size (replication / tsx spam can grow unbounded).
/// Same threshold for every open_log call (no separate “startup” path).
const LOG_ROTATE_BYTES: u64 = 32 * 1024 * 1024;
const LOG_ROTATE_GENERATIONS: u32 = 5;

fn log_path() -> PathBuf {
    home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".config/backsteros/desktop/local-core.log")
}

/// Copy-truncate into `local-core.log.1`…`.5` (`.1` newest). Never rotates a
/// file smaller than [`LOG_ROTATE_BYTES`]. Migrates legacy `.log.prev` once.
fn rotate_log_if_needed(path: &Path) {
    let Ok(meta) = fs::metadata(path) else {
        return;
    };
    if meta.len() < LOG_ROTATE_BYTES {
        return;
    }

    let prev = path.with_extension("log.prev");
    let gen1 = path.with_extension("log.1");
    if prev.exists() && !gen1.exists() {
        let _ = fs::rename(&prev, &gen1);
    } else {
        let _ = fs::remove_file(&prev);
    }

    let last = LOG_ROTATE_GENERATIONS;
    let _ = fs::remove_file(path.with_extension(format!("log.{last}")));
    for i in (1..last).rev() {
        let from = path.with_extension(format!("log.{i}"));
        let to = path.with_extension(format!("log.{}", i + 1));
        if from.exists() {
            let _ = fs::rename(&from, &to);
        }
    }

    // Copy then truncate so any concurrent append fd keeps the same inode.
    if fs::copy(path, &gen1).is_ok() {
        let _ = OpenOptions::new().write(true).truncate(true).open(path);
    }
}

fn open_log() -> Result<std::fs::File, String> {
    let path = log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    rotate_log_if_needed(&path);
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
    use std::io::Read;
    use std::process::Command;

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum PnpmLaunch {
        Native,
        Node,
        Shell,
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
        PnpmLaunch::Shell
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

    fn resolve_pnpm() -> Result<PathBuf, String> {
        for path in ["/opt/homebrew/bin/pnpm", "/usr/local/bin/pnpm"] {
            let candidate = PathBuf::from(path);
            if candidate.is_file() {
                return Ok(candidate);
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
            .map(|dir| dir.join("pnpm"))
            .find(|path| path.is_file())
            .ok_or_else(|| "pnpm not found. Install it with Homebrew (`brew install pnpm`).".into())
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
        cmd.env("PATH", tool_path(node));
        cmd
    }

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

    #[test]
    fn prefers_dedicated_local_core_build_env() {
        let dir = std::env::temp_dir().join(format!(
            "backsteros-local-core-build-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("core/server")).unwrap();
        fs::write(dir.join("pnpm-workspace.yaml"), "packages: []\n").unwrap();
        fs::write(dir.join("docker-compose.yml"), "services: {}\n").unwrap();

        let previous_build = std::env::var("BACKSTEROS_LOCAL_CORE_BUILD").ok();
        let previous_repo = std::env::var("BACKSTEROS_REPO_ROOT").ok();
        std::env::set_var("BACKSTEROS_LOCAL_CORE_BUILD", &dir);
        std::env::remove_var("BACKSTEROS_REPO_ROOT");

        let root = resolve_repo_root().expect("repo");
        assert_eq!(root, dir);

        match previous_build {
            Some(value) => std::env::set_var("BACKSTEROS_LOCAL_CORE_BUILD", value),
            None => std::env::remove_var("BACKSTEROS_LOCAL_CORE_BUILD"),
        }
        match previous_repo {
            Some(value) => std::env::set_var("BACKSTEROS_REPO_ROOT", value),
            None => std::env::remove_var("BACKSTEROS_REPO_ROOT"),
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn env_file_value_skips_comments_and_blanks() {
        let text = "# CORE_REPLICATION_SYNC_EVENTS_PULL=0\nCORE_REPLICATION_SECRET=sekret\n";
        assert_eq!(
            env_file_value(text, "CORE_REPLICATION_SECRET").as_deref(),
            Some("sekret")
        );
        assert_eq!(
            env_file_value(text, "CORE_REPLICATION_SYNC_EVENTS_PULL"),
            None
        );
        assert_eq!(
            env_file_value("export CORE_REPLICATION_SECRET = sekret\n", "CORE_REPLICATION_SECRET")
                .as_deref(),
            Some("sekret")
        );
    }

    #[test]
    fn upsert_env_assignment_replaces_or_appends_pull_flag() {
        let replaced = upsert_env_assignment(
            "CORE_REPLICATION_SECRET=x\nCORE_REPLICATION_SYNC_EVENTS_PULL=0\n",
            "CORE_REPLICATION_SYNC_EVENTS_PULL",
            "1",
        );
        assert!(replaced.contains("CORE_REPLICATION_SYNC_EVENTS_PULL=1"));
        assert!(!replaced.contains("CORE_REPLICATION_SYNC_EVENTS_PULL=0"));
        let appended = upsert_env_assignment(
            "CORE_REPLICATION_SECRET=x\n",
            "CORE_REPLICATION_SYNC_EVENTS_PULL",
            "1",
        );
        assert!(appended.contains("CORE_REPLICATION_SECRET=x"));
        assert!(appended.contains("CORE_REPLICATION_SYNC_EVENTS_PULL=1"));
    }

    #[test]
    fn upsert_env_assignment_replaces_all_duplicates_and_export_forms() {
        let input = "DATABASE_URL=postgres://local\nCORE_REPLICATION_SECRET=sekret\nCORE_REPLICATION_SYNC_EVENTS_PULL=0\nexport CORE_REPLICATION_SYNC_EVENTS_PULL = 0\nCORE_REPLICATION_SYNC_EVENTS_PULL=false\n";
        let out = upsert_env_assignment(input, "CORE_REPLICATION_SYNC_EVENTS_PULL", "1");
        assert_eq!(
            out.matches("CORE_REPLICATION_SYNC_EVENTS_PULL=1").count(),
            3
        );
        assert!(!out.contains("CORE_REPLICATION_SYNC_EVENTS_PULL=0"));
        assert!(!out.contains("CORE_REPLICATION_SYNC_EVENTS_PULL=false"));
        assert!(out.contains("DATABASE_URL=postgres://local"));
        assert!(out.contains("CORE_REPLICATION_SECRET=sekret"));
    }

    #[test]
    fn upsert_env_assignment_preserves_crlf_and_other_keys() {
        let input = "DATABASE_URL=postgres://local\r\nCORE_REPLICATION_SECRET=sekret\r\nCORE_REPLICATION_SYNC_EVENTS_PULL=0\r\n";
        let out = upsert_env_assignment(input, "CORE_REPLICATION_SYNC_EVENTS_PULL", "1");
        assert!(out.contains("\r\n"));
        assert!(out.contains("DATABASE_URL=postgres://local\r\n"));
        assert!(out.contains("CORE_REPLICATION_SECRET=sekret\r\n"));
        assert!(out.contains("CORE_REPLICATION_SYNC_EVENTS_PULL=1\r\n"));
        assert!(!out.contains("CORE_REPLICATION_SYNC_EVENTS_PULL=0"));
    }
}
