//! Opt-in, anonymous active-install telemetry.
//!
//! Default OFF. Nothing is sent unless the user enables it in Settings, at which
//! point the frontend generates a random anonymous id (UUID v4) and stores it in
//! `settings.json`. Each ping carries only: that id, the app version, OS, and
//! arch — no account, no PII. Opting out only flips the flag off; the id stays on
//! disk (never sent while off) so re-opting-in reuses it instead of minting a new
//! one — otherwise each toggle would inflate install counts.
//!
//! Transport is a best-effort POST to the telemetry Worker, day-gated so each
//! install reports at most once per UTC day (on startup + a midnight rollover).

use serde_json::json;
use tauri_plugin_store::StoreExt;

const SETTINGS_STORE: &str = "settings.json";
const OPT_IN_KEY: &str = "telemetry.optIn";
const ANON_ID_KEY: &str = "telemetry.anonId";
const ENDPOINT_KEY: &str = "telemetry.endpoint"; // optional override (testing)
const LAST_PING_DAY_KEY: &str = "telemetry.lastPingDay";

const DEFAULT_ENDPOINT: &str = "https://telemetry.pacebar.cbnsndwch.dev/ping";
const REQUEST_TIMEOUT_SECS: u64 = 5;

fn today_utc_ymd() -> String {
    let date = time::OffsetDateTime::now_utc().date();
    format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        date.month() as u8,
        date.day()
    )
}

/// True when we have not yet pinged today.
fn should_ping(last_ping_day: Option<&str>, today: &str) -> bool {
    match last_ping_day {
        Some(day) => day != today,
        None => true,
    }
}

/// Anonymous, non-identifying payload describing this install.
fn build_payload(anon_id: &str, version: &str) -> serde_json::Value {
    json!({
        "id": anon_id,
        "version": version,
        "os": std::env::consts::OS,     // macos | windows | linux
        "arch": std::env::consts::ARCH, // x86_64 | aarch64
    })
}

struct Prefs {
    opt_in: bool,
    anon_id: Option<String>,
    endpoint: String,
}

fn read_prefs(app_handle: &tauri::AppHandle) -> Option<Prefs> {
    let store = match app_handle.store(SETTINGS_STORE) {
        Ok(store) => store,
        Err(error) => {
            log::warn!("[telemetry] cannot open settings store: {}", error);
            return None;
        }
    };
    let opt_in = store
        .get(OPT_IN_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let anon_id = store
        .get(ANON_ID_KEY)
        .and_then(|v| v.as_str().map(str::to_string));
    let endpoint = store
        .get(ENDPOINT_KEY)
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_else(|| DEFAULT_ENDPOINT.to_string());
    Some(Prefs {
        opt_in,
        anon_id,
        endpoint,
    })
}

/// POST the payload to the Worker. Best-effort: logs and returns on any failure,
/// honoring the user's configured proxy (same as plugin HTTP).
fn post_ping(endpoint: &str, payload: &serde_json::Value) {
    let mut builder = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS));
    if let Some(resolved) = crate::config::get_resolved_proxy() {
        builder = builder.proxy(resolved.proxy.clone());
    }
    let client = match builder.build() {
        Ok(client) => client,
        Err(error) => {
            log::warn!("[telemetry] failed to build http client: {}", error);
            return;
        }
    };
    match client.post(endpoint).json(payload).send() {
        Ok(resp) => log::debug!("[telemetry] ping sent: {}", resp.status()),
        Err(error) => log::warn!("[telemetry] ping failed: {}", error),
    }
}

/// Send a ping now if opted in and not already sent today. Persists today's date
/// only after a send is attempted. Safe to call on a background thread.
pub fn ping_if_needed(app_handle: &tauri::AppHandle) {
    let Some(prefs) = read_prefs(app_handle) else {
        return;
    };
    if !prefs.opt_in {
        return;
    }
    let Some(anon_id) = prefs.anon_id else {
        log::debug!("[telemetry] opted in but no anon id yet, skipping");
        return;
    };

    let store = match app_handle.store(SETTINGS_STORE) {
        Ok(store) => store,
        Err(_) => return,
    };
    let today = today_utc_ymd();
    let last = store
        .get(LAST_PING_DAY_KEY)
        .and_then(|v| v.as_str().map(str::to_string));
    if !should_ping(last.as_deref(), &today) {
        return;
    }

    let version = app_handle.package_info().version.to_string();
    post_ping(&prefs.endpoint, &build_payload(&anon_id, &version));

    store.set(LAST_PING_DAY_KEY, serde_json::Value::String(today));
    if let Err(error) = store.save() {
        log::warn!("[telemetry] failed to persist last ping day: {}", error);
    }
}

/// Force a ping regardless of the day gate (still requires opt-in + an id).
/// Used right after the user enables sharing so the first datapoint is immediate.
pub fn ping_now(app_handle: &tauri::AppHandle) {
    let Some(prefs) = read_prefs(app_handle) else {
        return;
    };
    let (true, Some(anon_id)) = (prefs.opt_in, prefs.anon_id) else {
        return;
    };
    let version = app_handle.package_info().version.to_string();
    post_ping(&prefs.endpoint, &build_payload(&anon_id, &version));
    if let Ok(store) = app_handle.store(SETTINGS_STORE) {
        store.set(
            LAST_PING_DAY_KEY,
            serde_json::Value::String(today_utc_ymd()),
        );
        let _ = store.save();
    }
}

fn seconds_until_next_utc_day(now: time::OffsetDateTime) -> u64 {
    let t = now.time();
    let elapsed = u64::from(t.hour()) * 3600 + u64::from(t.minute()) * 60 + u64::from(t.second());
    let remaining = 86_400_u64.saturating_sub(elapsed);
    if remaining == 0 { 86_400 } else { remaining }
}

/// Background thread that re-checks at each UTC midnight so long-running installs
/// still report daily without a restart.
#[cfg(desktop)]
pub fn spawn_rollover(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            let sleep_for = std::time::Duration::from_secs(seconds_until_next_utc_day(
                time::OffsetDateTime::now_utc(),
            ));
            std::thread::sleep(sleep_for);
            ping_if_needed(&app_handle);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pings_when_never_pinged() {
        assert!(should_ping(None, "2026-06-25"));
    }

    #[test]
    fn pings_once_per_day() {
        assert!(!should_ping(Some("2026-06-25"), "2026-06-25"));
        assert!(should_ping(Some("2026-06-24"), "2026-06-25"));
    }

    #[test]
    fn payload_is_anonymous() {
        let p = build_payload("abc-123", "0.14.1");
        assert_eq!(p["id"], "abc-123");
        assert_eq!(p["version"], "0.14.1");
        assert!(p.get("os").is_some());
        assert!(p.get("arch").is_some());
        // No identifying fields beyond the random id.
        assert_eq!(p.as_object().unwrap().len(), 4);
    }

    #[test]
    fn rollover_waits_for_next_utc_day_boundary() {
        use time::{Date, Month, PrimitiveDateTime, Time};
        let now = PrimitiveDateTime::new(
            Date::from_calendar_date(2026, Month::February, 12).unwrap(),
            Time::from_hms(23, 59, 50).unwrap(),
        )
        .assume_utc();
        assert_eq!(seconds_until_next_utc_day(now), 10);
    }
}
