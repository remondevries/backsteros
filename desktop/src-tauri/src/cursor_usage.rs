//! Cursor monthly included-usage for the sidebar credits bar.
//!
//! Reads the signed-in Cursor access token from the local IDE state DB and
//! calls Cursor's dashboard usage endpoint. Mirrors
//! `legacy/backsteros-development/lib/cursor-plan-usage.ts`.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

const ACCESS_KEY: &str = "cursorAuth/accessToken";
const USAGE_URL: &str =
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";

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

fn curl_usage(token: &str) -> Result<Value, String> {
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
            USAGE_URL,
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
        error: None,
        sampled_at: now_ms(),
    })
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
    match curl_usage(&token) {
        Ok(json) => parse_plan_usage(&json)
            .unwrap_or_else(|| unavailable("Cursor usage shape was not recognized.")),
        Err(err) => unavailable(err),
    }
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
    }
}
