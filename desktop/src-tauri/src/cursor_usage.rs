//! Cursor monthly included-usage for the sidebar credits bar.
//!
//! Reads the signed-in Cursor access token from the local IDE state DB and
//! calls Cursor's dashboard usage endpoints. Mirrors
//! `legacy/backsteros-development/lib/cursor-plan-usage.ts`, plus Grok Bot
//! weekly quota from `GetSandUsageStatus` ("Sand" is Cursor's Grok Bot
//! product).

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

const ACCESS_KEY: &str = "cursorAuth/accessToken";
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
    pub sampled_at: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn unavailable(error: impl Into<String>) -> CursorUsage {
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

fn read_access_token(db_path: &Path) -> Result<String, String> {
    if !db_path.is_file() {
        return Err("Cursor is not signed in on this machine.".into());
    }

    let output = Command::new("sqlite3")
        .arg(db_path)
        .arg(format!(
            "SELECT value FROM ItemTable WHERE key = '{}' LIMIT 1;",
            ACCESS_KEY.replace('\'', "''")
        ))
        .output()
        .map_err(|_| "Could not read Cursor session (sqlite3 unavailable).".to_string())?;

    if !output.status.success() {
        return Err("Could not read Cursor session database.".into());
    }

    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return Err("Sign in to Cursor on this machine.".into());
    }
    Ok(token)
}

fn curl_dashboard(token: &str, url: &str) -> Result<Value, String> {
    let output = Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "20",
            "-X",
            "POST",
            "-H",
            &format!("Authorization: Bearer {token}"),
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
        .map_err(|_| "Could not reach Cursor usage API (curl unavailable).".to_string())?;

    if !output.status.success() {
        return Err("Cursor usage request failed.".into());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(text.trim())
        .map_err(|_| "Cursor usage response was not valid JSON.".to_string())
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

pub(crate) fn parse_plan_usage(json: &Value) -> Option<CursorUsage> {
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
    let Some(db_path) = cursor_state_db_path() else {
        return unavailable("Could not resolve Cursor state path.");
    };
    let token = match read_access_token(&db_path) {
        Ok(token) => token,
        Err(err) => return unavailable(err),
    };
    let mut usage = match curl_dashboard(&token, USAGE_URL) {
        Ok(json) => parse_plan_usage(&json)
            .unwrap_or_else(|| unavailable("Cursor usage shape was not recognized.")),
        Err(err) => return unavailable(err),
    };
    if usage.available {
        if let Ok(sand) = curl_dashboard(&token, GROK_BOT_USAGE_URL) {
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
        let usage = parse_plan_usage(&json).expect("dashboard");
        assert!(usage.available);
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
        let mut usage = parse_plan_usage(&json).expect("dashboard");
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
        let mut usage = parse_plan_usage(&json).expect("dashboard");
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
}
