//! Cursor monthly included-usage for the sidebar credits bar (local fallback).
//!
//! Prefer the core Settings API key via `GET /api/v1/settings/cursor/usage`
//! (server exchanges the key). This module is the local fallback when Settings
//! has no key or that path fails.
//!
//! Resolves a credential from (in order): env (`CURSOR_ACCESS_TOKEN` /
//! `CURSOR_API_KEY`), the IDE `state.vscdb`, then the Cursor CLI macOS Keychain
//! entry used by `agent login`. Dashboard Connect RPCs need a session JWT —
//! raw API keys are exchanged via `POST /auth/exchange_user_api_key` first.
//! Errors name the source that failed. Never log tokens.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

const ACCESS_KEY: &str = "cursorAuth/accessToken";
/// macOS Keychain item written by Cursor CLI (`agent login`).
const CLI_KEYCHAIN_SERVICE: &str = "cursor-access-token";
const CLI_KEYCHAIN_ACCOUNT: &str = "cursor-user";
const EXCHANGE_URL: &str = "https://api2.cursor.sh/auth/exchange_user_api_key";
const USAGE_URL: &str =
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
const GROK_BOT_USAGE_URL: &str =
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetSandUsageStatus";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorUsage {
    pub available: bool,
    pub auto_percent_used: f64,
    pub api_percent_used: f64,
    pub total_percent_used: f64,
    pub included_spend_cents: Option<i64>,
    pub limit_cents: Option<i64>,
    pub remaining_cents: Option<i64>,
    pub display_message: Option<String>,
    pub billing_cycle_end_ms: Option<i64>,
    /// Weekly Grok Bot included usage (None when the account has no quota).
    pub grok_bot_percent_used: Option<f64>,
    pub grok_bot_reset_ms: Option<i64>,
    pub error: Option<String>,
    pub source: Option<String>,
    pub sampled_at: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn unavailable(error: impl Into<String>, source: Option<&str>) -> CursorUsage {
    CursorUsage {
        available: false,
        auto_percent_used: 0.0,
        api_percent_used: 0.0,
        total_percent_used: 0.0,
        included_spend_cents: None,
        limit_cents: None,
        remaining_cents: None,
        display_message: None,
        billing_cycle_end_ms: None,
        grok_bot_percent_used: None,
        grok_bot_reset_ms: None,
        error: Some(error.into()),
        source: source.map(|s| s.to_string()),
        sampled_at: now_ms(),
    }
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn cursor_state_db_path() -> Option<PathBuf> {
    let home = home_dir()?;
    if cfg!(target_os = "windows") {
        let app_data = std::env::var_os("APPDATA").map(PathBuf::from)?;
        Some(
            app_data
                .join("Cursor")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
        )
    } else if cfg!(target_os = "macos") {
        Some(
            home.join("Library")
                .join("Application Support")
                .join("Cursor")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
        )
    } else {
        Some(
            home.join(".config")
                .join("Cursor")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
        )
    }
}

fn read_access_token_from_db(db_path: &Path) -> Result<String, String> {
    if !db_path.is_file() {
        return Err("IDE state.vscdb not found (Cursor not installed or never signed in).".into());
    }

    let output = Command::new("sqlite3")
        .arg(db_path)
        .arg(format!(
            "SELECT value FROM ItemTable WHERE key = '{}' LIMIT 1;",
            ACCESS_KEY.replace('\'', "''")
        ))
        .output()
        .map_err(|_| {
            "Could not read IDE state.vscdb (sqlite3 unavailable).".to_string()
        })?;

    if !output.status.success() {
        return Err("Could not read Cursor IDE session database (state.vscdb).".into());
    }

    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return Err("IDE state.vscdb has no cursorAuth/accessToken (sign in to Cursor).".into());
    }
    Ok(token)
}

/// Cursor CLI (`agent login`) stores the session token in the macOS Keychain
/// when the IDE `state.vscdb` is absent (common for CLI-only / settings-symlink
/// setups). Without this, the sidebar bars stay stuck on "Sign in to Cursor".
fn read_access_token_from_cli_keychain() -> Result<String, String> {
    if !cfg!(target_os = "macos") {
        return Err("CLI keychain is only available on macOS.".into());
    }
    let output = Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            CLI_KEYCHAIN_SERVICE,
            "-a",
            CLI_KEYCHAIN_ACCOUNT,
            "-w",
        ])
        .output()
        .map_err(|_| "Could not read Cursor CLI keychain (security unavailable).".to_string())?;
    if !output.status.success() {
        return Err("CLI keychain has no cursor-access-token (run `agent login`).".into());
    }
    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return Err("CLI keychain cursor-access-token was empty.".into());
    }
    Ok(token)
}

/// JWT session tokens start with eyJ; API keys (crsr_/key_/…) do not.
fn looks_like_session_token(value: &str) -> bool {
    value.trim().starts_with("eyJ")
}

fn curl_json_post(bearer: &str, url: &str) -> Result<Value, String> {
    let output = Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "20",
            "-w",
            "\n%{http_code}",
            "-X",
            "POST",
            "-H",
            &format!("Authorization: Bearer {bearer}"),
            "-H",
            "Accept: application/json",
            "-H",
            "Content-Type: application/json",
            "-H",
            "Connect-Protocol-Version: 1",
            "-H",
            "User-Agent: backsteros-desktop",
            "--data-binary",
            "{}",
            url,
        ])
        .output()
        .map_err(|_| "Could not reach Cursor API (curl unavailable).".to_string())?;

    if !output.status.success() {
        return Err("Cursor API request failed (curl).".into());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let trimmed = text.trim();
    let (body, status_str) = match trimmed.rsplit_once('\n') {
        Some(parts) => parts,
        None => (trimmed, "0"),
    };
    let status: u16 = status_str.trim().parse().unwrap_or(0);
    if status == 401 || status == 403 {
        return Err(format!("Cursor API rejected credentials (HTTP {status})."));
    }
    if !(200..300).contains(&status) {
        return Err(format!("Cursor API request failed (HTTP {status})."));
    }
    serde_json::from_str(body.trim())
        .map_err(|_| "Cursor API response was not valid JSON.".to_string())
}

/// Exchange a user API key for a short-lived dashboard access token.
fn exchange_api_key_for_access_token(api_key: &str) -> Result<String, String> {
    let json = curl_json_post(api_key, EXCHANGE_URL)
        .map_err(|e| format!("API key exchange failed: {e}"))?;
    let token = json
        .get("accessToken")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "API key exchange returned no accessToken.".to_string())?;
    Ok(token.to_string())
}

fn resolve_dashboard_token(secret: &str) -> Result<String, String> {
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return Err("Empty Cursor credential.".into());
    }
    if looks_like_session_token(trimmed) {
        return Ok(trimmed.to_string());
    }
    exchange_api_key_for_access_token(trimmed)
}

struct ResolvedCredential {
    access_token: String,
    source: &'static str,
}

fn resolve_access_token() -> Result<ResolvedCredential, String> {
    let mut errors: Vec<String> = Vec::new();

    if let Ok(token) = std::env::var("CURSOR_ACCESS_TOKEN") {
        let trimmed = token.trim();
        if !trimmed.is_empty() {
            match resolve_dashboard_token(trimmed) {
                Ok(access_token) => {
                    return Ok(ResolvedCredential {
                        access_token,
                        source: "env_cursor_access_token",
                    });
                }
                Err(e) => errors.push(format!("env_cursor_access_token: {e}")),
            }
        }
    }
    if let Ok(token) = std::env::var("CURSOR_API_KEY") {
        let trimmed = token.trim();
        if !trimmed.is_empty() {
            match resolve_dashboard_token(trimmed) {
                Ok(access_token) => {
                    return Ok(ResolvedCredential {
                        access_token,
                        source: "env_cursor_api_key",
                    });
                }
                Err(e) => errors.push(format!("env_cursor_api_key: {e}")),
            }
        }
    }
    if let Some(db_path) = cursor_state_db_path() {
        match read_access_token_from_db(&db_path) {
            Ok(token) => match resolve_dashboard_token(&token) {
                Ok(access_token) => {
                    return Ok(ResolvedCredential {
                        access_token,
                        source: "ide_vscdb",
                    });
                }
                Err(e) => errors.push(format!("ide_vscdb: {e}")),
            },
            Err(e) => errors.push(format!("ide_vscdb: {e}")),
        }
    } else {
        errors.push("ide_vscdb: could not resolve Cursor state path.".into());
    }

    match read_access_token_from_cli_keychain() {
        Ok(token) => match resolve_dashboard_token(&token) {
            Ok(access_token) => {
                return Ok(ResolvedCredential {
                    access_token,
                    source: "cli_keychain",
                });
            }
            Err(e) => errors.push(format!("cli_keychain: {e}")),
        },
        Err(e) => errors.push(format!("cli_keychain: {e}")),
    }

    if errors.is_empty() {
        Err("No local Cursor credential (env, IDE state.vscdb, or CLI keychain).".into())
    } else {
        Err(format!(
            "No usable local Cursor credential. Tried: {}",
            errors.join(" · ")
        ))
    }
}

fn curl_dashboard(token: &str, url: &str) -> Result<Value, String> {
    curl_json_post(token, url)
}

fn clamp_percent(value: Option<f64>) -> f64 {
    value
        .filter(|v| v.is_finite())
        .map(|v| v.clamp(0.0, 100.0))
        .unwrap_or(0.0)
}

fn as_f64(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                trimmed.parse::<f64>().ok()
            }
        }
        _ => None,
    }
}

fn as_cents(value: Option<&Value>) -> Option<i64> {
    let n = as_f64(value?)?;
    if !n.is_finite() {
        return None;
    }
    Some(n.round() as i64)
}

fn as_ms(value: Option<&Value>) -> Option<i64> {
    as_cents(value)
}

/// Unix ms from a Connect JSON timestamp (ISO-8601, unix ms/seconds, or `{seconds,nanos}`).
fn timestamp_to_ms(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(_) => as_ms(value),
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                return None;
            }
            if let Ok(n) = trimmed.parse::<f64>() {
                if !n.is_finite() {
                    return None;
                }
                if n >= 1.0e12 {
                    return Some(n.round() as i64);
                }
                if n >= 1.0e9 {
                    return Some((n * 1000.0).round() as i64);
                }
            }
            parse_iso8601_utc_ms(trimmed)
        }
        Value::Object(map) => {
            let seconds = map.get("seconds").and_then(as_f64)?;
            let nanos = map.get("nanos").and_then(as_f64).unwrap_or(0.0);
            Some((seconds * 1000.0 + nanos / 1_000_000.0).round() as i64)
        }
        _ => None,
    }
}

/// UTC `YYYY-MM-DDTHH:MM:SS[.sss]Z` (optional `+00:00`) → unix ms.
fn parse_iso8601_utc_ms(raw: &str) -> Option<i64> {
    let s = raw.trim().trim_end_matches('Z');
    let s = s.strip_suffix("+00:00").unwrap_or(s);
    let (date, time) = s.split_once('T')?;
    let mut date_parts = date.split('-');
    let year: i32 = date_parts.next()?.parse().ok()?;
    let month: i32 = date_parts.next()?.parse().ok()?;
    let day: i32 = date_parts.next()?.parse().ok()?;
    let mut time_parts = time.split(':');
    let hour: i32 = time_parts.next()?.parse().ok()?;
    let minute: i32 = time_parts.next()?.parse().ok()?;
    let second_raw = time_parts.next()?;
    let (sec_s, frac_s) = second_raw.split_once('.').unwrap_or((second_raw, "0"));
    let second: i32 = sec_s.parse().ok()?;
    let mut frac = frac_s.chars().filter(|c| c.is_ascii_digit()).collect::<String>();
    while frac.len() < 3 {
        frac.push('0');
    }
    let millis: i32 = frac.chars().take(3).collect::<String>().parse().ok()?;
    let days = days_from_civil(year, month, day)?;
    let seconds = i64::from(days) * 86_400
        + i64::from(hour) * 3_600
        + i64::from(minute) * 60
        + i64::from(second);
    Some(seconds * 1000 + i64::from(millis))
}

/// Howard Hinnant civil-to-days (proleptic Gregorian, unix epoch = 1970-01-01).
fn days_from_civil(year: i32, month: i32, day: i32) -> Option<i32> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let y = if month <= 2 { year - 1 } else { year };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

pub(crate) fn parse_plan_usage(json: &Value, source: &str) -> Option<CursorUsage> {
    let plan = json.get("planUsage")?;
    if !plan.is_object() {
        return None;
    }

    let limit_cents = as_cents(plan.get("limit"));
    let included_spend_cents =
        as_cents(plan.get("includedSpend")).or_else(|| as_cents(plan.get("totalSpend")));
    let mut remaining_cents = as_cents(plan.get("remaining"));
    if remaining_cents.is_none() {
        if let (Some(limit), Some(used)) = (limit_cents, included_spend_cents) {
            remaining_cents = Some((limit - used).max(0));
        }
    }

    Some(CursorUsage {
        available: true,
        auto_percent_used: clamp_percent(plan.get("autoPercentUsed").and_then(as_f64)),
        api_percent_used: clamp_percent(plan.get("apiPercentUsed").and_then(as_f64)),
        total_percent_used: clamp_percent(plan.get("totalPercentUsed").and_then(as_f64)),
        included_spend_cents,
        limit_cents,
        remaining_cents,
        display_message: json
            .get("displayMessage")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        billing_cycle_end_ms: as_ms(json.get("billingCycleEnd")),
        grok_bot_percent_used: None,
        grok_bot_reset_ms: None,
        error: None,
        source: Some(source.to_string()),
        sampled_at: now_ms(),
    })
}

/// Grok Bot weekly included usage. Hidden when the account has no included quota.
pub(crate) fn apply_grok_bot_usage(usage: &mut CursorUsage, json: &Value) {
    let has_limit = json
        .get("hasNonZeroIncludedLimit")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let percent = json.get("usagePercent").and_then(as_f64);
    if !has_limit && percent.is_none() {
        return;
    }
    usage.grok_bot_percent_used = Some(clamp_percent(percent));
    usage.grok_bot_reset_ms = timestamp_to_ms(json.get("nextResetTimestampUtc"));
}

#[tauri::command]
pub fn cursor_usage() -> CursorUsage {
    let resolved = match resolve_access_token() {
        Ok(resolved) => resolved,
        Err(err) => return unavailable(err, None),
    };
    let source = resolved.source;
    let mut usage = match curl_dashboard(&resolved.access_token, USAGE_URL) {
        Ok(json) => parse_plan_usage(&json, source).unwrap_or_else(|| {
            unavailable(
                format!("Cursor usage shape was not recognized (source: {source})."),
                Some(source),
            )
        }),
        Err(err) => {
            return unavailable(format!("{err} (source: {source})"), Some(source));
        }
    };
    if usage.available {
        if let Ok(sand) = curl_dashboard(&resolved.access_token, GROK_BOT_USAGE_URL) {
            apply_grok_bot_usage(&mut usage, &sand);
        }
    }
    usage
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_dashboard_plan_usage() {
        let json = json!({
            "billingCycleEnd": 1788708276000_i64,
            "displayMessage": "You've used 10% of your included usage",
            "planUsage": {
                "limit": 40000,
                "remaining": 33976,
                "includedSpend": 6024,
                "totalSpend": 6024,
                "autoPercentUsed": 3.012,
                "apiPercentUsed": 0,
                "totalPercentUsed": 2.4096
            }
        });
        let usage = parse_plan_usage(&json, "ide_vscdb").expect("dashboard");
        assert!(usage.available);
        assert_eq!(usage.source.as_deref(), Some("ide_vscdb"));
        assert_eq!(usage.limit_cents, Some(40000));
        assert_eq!(usage.remaining_cents, Some(33976));
        assert_eq!(usage.included_spend_cents, Some(6024));
        assert!((usage.auto_percent_used - 3.012).abs() < 0.0001);
        assert!((usage.api_percent_used - 0.0).abs() < f64::EPSILON);
        assert!((usage.total_percent_used - 2.4096).abs() < 0.0001);
        assert_eq!(
            usage.display_message.as_deref(),
            Some("You've used 10% of your included usage")
        );
        assert_eq!(usage.grok_bot_percent_used, None);
    }

    #[test]
    fn applies_grok_bot_weekly_usage() {
        let json = json!({
            "planUsage": {
                "limit": 40000,
                "autoPercentUsed": 30,
                "apiPercentUsed": 40,
                "totalPercentUsed": 32
            }
        });
        let mut usage = parse_plan_usage(&json, "env_cursor_access_token").expect("dashboard");
        apply_grok_bot_usage(
            &mut usage,
            &json!({
                "currentPeriodStart": "2026-08-18T04:17:33.882Z",
                "nextResetTimestampUtc": "2026-08-25T04:17:33.882Z",
                "usagePercent": 5.224614,
                "hasAvailableUsage": true,
                "hasNonZeroIncludedLimit": true
            }),
        );
        assert!((usage.grok_bot_percent_used.unwrap_or(-1.0) - 5.224614).abs() < 0.0001);
        assert_eq!(usage.grok_bot_reset_ms, Some(1_787_631_453_882));
    }

    #[test]
    fn hides_grok_bot_when_account_has_no_included_quota() {
        let json = json!({
            "planUsage": {
                "limit": 40000,
                "autoPercentUsed": 0,
                "apiPercentUsed": 0,
                "totalPercentUsed": 0
            }
        });
        let mut usage = parse_plan_usage(&json, "cli_keychain").expect("dashboard");
        apply_grok_bot_usage(
            &mut usage,
            &json!({
                "hasNonZeroIncludedLimit": false,
                "hasAvailableUsage": false
            }),
        );
        assert_eq!(usage.grok_bot_percent_used, None);
    }

    #[test]
    fn parses_iso8601_utc_ms() {
        assert_eq!(
            parse_iso8601_utc_ms("2026-08-25T04:17:33.882Z"),
            Some(1_787_631_453_882)
        );
    }

    #[test]
    fn looks_like_session_token_detects_jwt() {
        assert!(looks_like_session_token(
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.sig"
        ));
        assert!(!looks_like_session_token("crsr_abc123"));
        assert!(!looks_like_session_token("key_abc123"));
    }

    #[test]
    fn resolve_access_token_prefers_env_over_missing_ide_db() {
        // SAFETY: test-only; serial within this module's unit tests.
        unsafe {
            std::env::set_var(
                "CURSOR_ACCESS_TOKEN",
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.test",
            );
            std::env::remove_var("CURSOR_API_KEY");
        }
        let resolved = resolve_access_token().expect("env token");
        assert_eq!(
            resolved.access_token,
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.test"
        );
        assert_eq!(resolved.source, "env_cursor_access_token");
        unsafe {
            std::env::remove_var("CURSOR_ACCESS_TOKEN");
        }
    }
}
