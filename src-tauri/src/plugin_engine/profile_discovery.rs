//! Profile discovery: optional per-plugin mechanism for expanding a single
//! plugin into N "instances", each with its own env-var overrides at probe time.
//!
//! A plugin opts in via its manifest:
//!
//! ```json
//! "profiles": { "discovery": "claude-profiles" }
//! ```
//!
//! At plugin load time we run the named discoverer once and store the result on
//! `LoadedPlugin::instances`. Plugins without a `profiles` config get a single
//! anonymous instance (the existing behavior).

use base64::{Engine, engine::general_purpose::STANDARD};
use std::collections::HashMap;
use std::path::PathBuf;

/// One concrete probe target for a plugin.
///
/// `id_suffix` is "" for the default/anonymous instance and a non-empty stable
/// label otherwise (becomes `<plugin_id>:<id_suffix>` in the public provider id).
#[derive(Debug, Clone, Default)]
pub struct ProfileInstance {
    pub id_suffix: String,
    pub display_label: Option<String>,
    pub env_overrides: HashMap<String, String>,
    /// Base64 data URL of a user-supplied avatar image (PNG or JPEG), if present.
    pub avatar_data_url: Option<String>,
}

impl ProfileInstance {
    pub fn anonymous() -> Self {
        Self::default()
    }
}

/// Run the discoverer named in a plugin manifest. Unknown names log a warning
/// and return a single anonymous instance so the plugin still works.
pub fn discover(name: &str) -> Vec<ProfileInstance> {
    match name {
        "claude-profiles" => discover_claude_profiles(),
        other => {
            log::warn!(
                "unknown profile discovery '{}'; falling back to single instance",
                other
            );
            vec![ProfileInstance::anonymous()]
        }
    }
}

/// Locate the `claude-profiles` directory used by quinnjr/claude-code-profiles.
///
/// - Windows: `%LOCALAPPDATA%\claude-profiles\`
/// - macOS/Linux: `$XDG_DATA_HOME/claude-profiles/` (default `~/.local/share/claude-profiles/`)
fn claude_profiles_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("claude-profiles"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(xdg) = std::env::var_os("XDG_DATA_HOME") {
            return Some(PathBuf::from(xdg).join("claude-profiles"));
        }
        dirs::home_dir().map(|h| h.join(".local").join("share").join("claude-profiles"))
    }
}

/// Look for `avatar.png`, `avatar.jpg`, or `avatar.jpeg` in `profile_dir`.
/// Returns a base64 data URL on the first match, or `None` if no file is found.
/// Candidates are tried in order: PNG first, then JPG, then JPEG extension.
fn load_avatar(profile_dir: &std::path::Path) -> Option<String> {
    for (filename, mime) in [
        ("avatar.png", "image/png"),
        ("avatar.jpg", "image/jpeg"),
        ("avatar.jpeg", "image/jpeg"),
    ] {
        let path = profile_dir.join(filename);
        if let Ok(bytes) = std::fs::read(&path) {
            return Some(format!("data:{};base64,{}", mime, STANDARD.encode(&bytes)));
        }
    }
    None
}

fn discover_claude_profiles() -> Vec<ProfileInstance> {
    // The default instance corresponds to ~/.claude (no override). Always shown
    // so users without claudep — or with creds in both places — keep working.
    let mut instances = vec![ProfileInstance::anonymous()];

    let Some(dir) = claude_profiles_dir() else {
        return instances;
    };
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return instances,
    };

    let mut profiles: Vec<ProfileInstance> = entries
        .flatten()
        .filter(|entry| entry.file_type().ok().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.is_empty() || name.starts_with('.') {
                return None;
            }
            let path = entry.path();
            let mut env_overrides = HashMap::new();
            env_overrides.insert(
                "CLAUDE_CONFIG_DIR".to_string(),
                path.to_string_lossy().to_string(),
            );
            let avatar_data_url = load_avatar(&path);
            Some(ProfileInstance {
                id_suffix: name.clone(),
                display_label: Some(name),
                env_overrides,
                avatar_data_url,
            })
        })
        .collect();

    profiles.sort_by(|a, b| a.id_suffix.cmp(&b.id_suffix));
    instances.extend(profiles);

    if instances.len() > 1 {
        log::info!(
            "claude-profiles: discovered {} profile(s) at {}",
            instances.len() - 1,
            dir.display()
        );
    }

    instances
}

/// Build the public provider id from a plugin id and an instance suffix.
///
/// Empty suffix → bare plugin id (preserves the legacy single-instance shape so
/// existing cache entries and HTTP API consumers keep working).
pub fn full_provider_id(plugin_id: &str, id_suffix: &str) -> String {
    if id_suffix.is_empty() {
        plugin_id.to_string()
    } else {
        format!("{}:{}", plugin_id, id_suffix)
    }
}

/// Build the user-facing display name. `None` label collapses to the plugin name.
pub fn full_display_name(plugin_name: &str, display_label: Option<&str>) -> String {
    match display_label {
        Some(label) if !label.is_empty() => format!("{} \u{00b7} {}", plugin_name, label),
        _ => plugin_name.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pacebar_test_{}", name));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn full_provider_id_collapses_empty_suffix() {
        assert_eq!(full_provider_id("claude", ""), "claude");
        assert_eq!(full_provider_id("claude", "work"), "claude:work");
    }

    #[test]
    fn full_display_name_collapses_no_label() {
        assert_eq!(full_display_name("Claude", None), "Claude");
        assert_eq!(full_display_name("Claude", Some("")), "Claude");
        assert_eq!(
            full_display_name("Claude", Some("work")),
            "Claude \u{00b7} work"
        );
    }

    #[test]
    fn unknown_discovery_falls_back_to_single_instance() {
        let instances = discover("does-not-exist");
        assert_eq!(instances.len(), 1);
        assert!(instances[0].id_suffix.is_empty());
        assert!(instances[0].env_overrides.is_empty());
    }

    #[test]
    fn claude_profiles_always_includes_default_first() {
        let instances = discover_claude_profiles();
        assert!(!instances.is_empty());
        assert!(instances[0].id_suffix.is_empty());
        assert!(instances[0].env_overrides.is_empty());
    }

    #[test]
    fn anonymous_instance_has_no_avatar() {
        let inst = ProfileInstance::anonymous();
        assert!(inst.avatar_data_url.is_none());
    }

    #[test]
    fn load_avatar_returns_none_for_empty_dir() {
        let dir = make_temp_dir("avatar_none");
        assert!(load_avatar(&dir).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_avatar_returns_png_data_url() {
        let dir = make_temp_dir("avatar_png");
        let bytes = b"fakepng";
        fs::write(dir.join("avatar.png"), bytes).unwrap();

        let result = load_avatar(&dir).expect("expected data url");
        assert!(result.starts_with("data:image/png;base64,"));
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        assert!(result.ends_with(&encoded));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_avatar_returns_jpg_data_url_when_no_png() {
        let dir = make_temp_dir("avatar_jpg");
        let bytes = b"fakejpeg";
        fs::write(dir.join("avatar.jpg"), bytes).unwrap();

        let result = load_avatar(&dir).expect("expected data url");
        assert!(result.starts_with("data:image/jpeg;base64,"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_avatar_returns_jpeg_ext_when_no_png_or_jpg() {
        let dir = make_temp_dir("avatar_jpeg");
        let bytes = b"fakejpeg2";
        fs::write(dir.join("avatar.jpeg"), bytes).unwrap();

        let result = load_avatar(&dir).expect("expected data url");
        assert!(result.starts_with("data:image/jpeg;base64,"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_avatar_prefers_png_over_jpg() {
        let dir = make_temp_dir("avatar_prefer_png");
        fs::write(dir.join("avatar.png"), b"png_bytes").unwrap();
        fs::write(dir.join("avatar.jpg"), b"jpg_bytes").unwrap();

        let result = load_avatar(&dir).expect("expected data url");
        assert!(result.starts_with("data:image/png;base64,"));

        let _ = fs::remove_dir_all(&dir);
    }
}
