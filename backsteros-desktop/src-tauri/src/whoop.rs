use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhoopSettingsStatus {
    pub connected: bool,
    pub configured: bool,
    pub email: Option<String>,
    pub reason: Option<String>,
    pub env_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhoopDayResult {
    pub authenticated: bool,
    pub snapshot: Option<serde_json::Value>,
    pub error: Option<String>,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn totem_env_path() -> PathBuf {
    if let Ok(configured) = std::env::var("TOTEM_ENV_PATH") {
        let trimmed = configured.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    let data_dir = std::env::var("BACKSTER_DATA_DIR")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| home_dir().map(|home| home.join(".backsteros-agent")));

    data_dir
        .unwrap_or_else(|| PathBuf::from(".backsteros-agent"))
        .join("totem.env")
}

fn read_env_file(path: &Path) -> Result<std::collections::HashMap<String, String>, String> {
    if !path.exists() {
        return Ok(std::collections::HashMap::new());
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut result = std::collections::HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some(separator) = trimmed.find('=') else {
            continue;
        };
        if separator == 0 {
            continue;
        }
        let key = trimmed[..separator].trim().to_string();
        let value = trimmed[separator + 1..].trim().to_string();
        if !key.is_empty() {
            result.insert(key, value);
        }
    }

    Ok(result)
}

fn mask_email(email: &str) -> String {
    let trimmed = email.trim();
    let Some(at) = trimmed.find('@') else {
        return if trimmed.is_empty() {
            String::new()
        } else {
            "••••".to_string()
        };
    };
    let local = &trimmed[..at];
    let domain = &trimmed[at..];
    let visible_len = local.len().min(2);
    let visible = &local[..visible_len];
    let dots = if local.len() > 2 { "•••" } else { "" };
    format!("{visible}{dots}{domain}")
}

fn resolve_app_dir() -> Result<PathBuf, String> {
    if let Ok(configured) = std::env::var("BACKSTEROS_APP_DIR") {
        let trimmed = configured.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.is_dir() {
                return Ok(path);
            }
            return Err(format!(
                "BACKSTEROS_APP_DIR does not exist: {}",
                path.display()
            ));
        }
    }

    // src-tauri → backsteros-desktop → repo root → backsteros-app
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest_dir
        .join("..")
        .join("..")
        .join("backsteros-app");
    let canonical = candidate
        .canonicalize()
        .map_err(|error| format!("Could not resolve backsteros-app: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!(
            "backsteros-app not found at {}",
            canonical.display()
        ));
    }
    Ok(canonical)
}

#[tauri::command]
pub fn whoop_status() -> Result<WhoopSettingsStatus, String> {
    let env_path = totem_env_path();
    let env_path_display = env_path.display().to_string();
    let file_exists = env_path.exists();
    let env = read_env_file(&env_path)?;

    let has_refresh = env
        .get("WHOOP_COGNITO_REFRESH_TOKEN")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let has_bearer = env
        .get("WHOOP_IOS_BEARER_TOKEN")
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let connected = has_refresh || has_bearer;
    let configured = connected || file_exists;
    let email = env
        .get("WHOOP_EMAIL")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(mask_email);

    let reason = if connected {
        None
    } else if configured {
        Some(
            "totem.env exists but no valid refresh or bearer token was found.".to_string(),
        )
    } else {
        Some(
            "No totem.env file found. Configure Whoop tokens to show recovery, sleep, and strain above journal entries."
                .to_string(),
        )
    };

    Ok(WhoopSettingsStatus {
        connected,
        configured,
        email,
        reason,
        env_path: env_path_display,
    })
}

#[tauri::command]
pub fn whoop_fetch_day(date: String) -> Result<WhoopDayResult, String> {
    let status = whoop_status()?;
    if !status.connected {
        return Ok(WhoopDayResult {
            authenticated: false,
            snapshot: None,
            error: status.reason.or_else(|| {
                Some(
                    "Whoop is not connected. Add refresh or bearer tokens to totem.env."
                        .to_string(),
                )
            }),
        });
    }

    if !regex_is_iso_date(&date) {
        return Err("date must be YYYY-MM-DD".to_string());
    }

    let app_dir = resolve_app_dir()?;
    let script_path = app_dir.join("scripts").join("whoop-fetch-cli.ts");
    let tsx_bin = app_dir.join("node_modules").join(".bin").join("tsx");

    if !script_path.exists() {
        return Err(format!(
            "Whoop CLI script missing at {}",
            script_path.display()
        ));
    }

    let mut command = if tsx_bin.exists() {
        let mut cmd = Command::new(&tsx_bin);
        cmd.arg(&script_path);
        cmd
    } else {
        let mut cmd = Command::new("npx");
        cmd.args(["tsx", script_path.to_str().unwrap_or("scripts/whoop-fetch-cli.ts")]);
        cmd
    };

    command
        .arg("--date")
        .arg(&date)
        .current_dir(&app_dir)
        .env("TOTEM_ENV_PATH", totem_env_path());

    let output = command
        .output()
        .map_err(|error| format!("Failed to run Whoop CLI: {error}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if stdout.is_empty() {
        let message = if stderr.is_empty() {
            format!(
                "Whoop CLI returned no output (exit {})",
                output.status.code().unwrap_or(-1)
            )
        } else {
            stderr
        };
        return Ok(WhoopDayResult {
            authenticated: true,
            snapshot: None,
            error: Some(message),
        });
    }

    let parsed: serde_json::Value = serde_json::from_str(&stdout).map_err(|error| {
        format!(
            "Could not parse Whoop CLI output: {error}. stdout={}",
            stdout.chars().take(200).collect::<String>()
        )
    })?;

    let ok = parsed
        .get("ok")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let snapshot = parsed.get("snapshot").cloned().filter(|value| !value.is_null());
    let error = parsed
        .get("error")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .or_else(|| {
            if !ok && !stderr.is_empty() {
                Some(stderr)
            } else {
                None
            }
        });

    Ok(WhoopDayResult {
        authenticated: true,
        snapshot: if ok { snapshot } else { None },
        error: if ok {
            None
        } else {
            error.or_else(|| Some("Whoop fetch failed".to_string()))
        },
    })
}

fn regex_is_iso_date(value: &str) -> bool {
    if value.len() != 10 {
        return false;
    }
    let bytes = value.as_bytes();
    bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[8..].iter().all(u8::is_ascii_digit)
}
