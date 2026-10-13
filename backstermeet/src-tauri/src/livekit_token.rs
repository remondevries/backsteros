use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostTokenResponse {
    pub token: String,
    pub url: String,
    pub room: String,
    pub meeting_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoGrant {
    room: String,
    room_join: bool,
    can_publish: bool,
    can_subscribe: bool,
    can_publish_data: bool,
    can_update_own_metadata: bool,
}

#[derive(Serialize)]
struct LiveKitClaims {
    exp: i64,
    iss: String,
    nbf: i64,
    sub: String,
    name: String,
    video: VideoGrant,
}

struct LiveKitConfig {
    url: String,
    api_key: String,
    api_secret: String,
    room: String,
}

fn parse_dotenv(contents: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for raw in contents.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let mut value = value.trim().to_string();
        if (value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\''))
        {
            value = value[1..value.len() - 1].to_string();
        }
        out.insert(key.trim().to_string(), value);
    }
    out
}

fn secrets_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config/secrets/livekit.env")
}

/// Prefer LIVEKIT_CLIENT_URL (portal WSS) so Director + guests share one SFU.
/// Loopback rewrite only for a purely local SFU spike.
fn resolve_client_url(env: &HashMap<String, String>) -> String {
    let configured = env
        .get("LIVEKIT_CLIENT_URL")
        .cloned()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| env.get("LIVEKIT_URL").cloned())
        .unwrap_or_default()
        .trim()
        .to_string();
    if configured.is_empty() {
        return configured;
    }

    let normalized = configured
        .replace("wss://", "https://")
        .replace("ws://", "http://");
    let Ok(parsed) = url::Url::parse(&normalized) else {
        return configured;
    };
    let host = parsed.host_str().unwrap_or("");
    let path = parsed.path();
    let is_portal_proxy = host == "client.lemo-design.com"
        || host == "client.lemo-design.nl"
        || path.contains("/livekit");
    if is_portal_proxy || host.ends_with(".lemo-design.com") {
        return configured;
    }
    let localish = host == "localhost"
        || host == "127.0.0.1"
        || host.starts_with("100.")
        || host.starts_with("192.168.")
        || host.starts_with("10.")
        || host.ends_with(".ts.net");
    if !localish {
        return configured;
    }
    let port = parsed.port().unwrap_or(7880);
    format!("ws://127.0.0.1:{port}")
}

fn load_livekit_config() -> Result<LiveKitConfig, String> {
    let path = secrets_path();
    let file = fs::read_to_string(&path).map_err(|_| {
        format!("LiveKit secrets missing ({})", path.display())
    })?;
    let env = parse_dotenv(&file);
    let url = resolve_client_url(&env);
    let api_key = env.get("LIVEKIT_API_KEY").cloned().unwrap_or_default();
    let api_secret = env.get("LIVEKIT_API_SECRET").cloned().unwrap_or_default();
    let room = env
        .get("LIVEKIT_ROOM")
        .cloned()
        .unwrap_or_else(|| "backstermeet-dev".to_string());
    if url.is_empty() || api_key.is_empty() || api_secret.is_empty() {
        return Err("LiveKit secrets incomplete (~/.config/secrets/livekit.env)".into());
    }
    Ok(LiveKitConfig {
        url,
        api_key,
        api_secret,
        room,
    })
}

fn resolve_room(default_room: &str, meeting_id: Option<&str>) -> String {
    meeting_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| default_room.to_string())
}

pub fn mint_host_token(meeting_id: Option<String>) -> Result<HostTokenResponse, String> {
    let config = load_livekit_config()?;
    let room = resolve_room(&config.room, meeting_id.as_deref());
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs() as i64;
    let exp = now + 6 * 60 * 60;

    let claims = LiveKitClaims {
        exp,
        iss: config.api_key.clone(),
        nbf: now,
        sub: "host-director".to_string(),
        name: "BacksterMeet host".to_string(),
        video: VideoGrant {
            room: room.clone(),
            room_join: true,
            can_publish: true,
            can_subscribe: true,
            can_publish_data: true,
            can_update_own_metadata: true,
        },
    };

    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(config.api_secret.as_bytes()),
    )
    .map_err(|error| error.to_string())?;

    Ok(HostTokenResponse {
        token,
        url: config.url,
        room,
        meeting_id,
    })
}
