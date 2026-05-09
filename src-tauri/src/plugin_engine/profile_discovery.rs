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
            log::warn!("unknown profile discovery '{}'; falling back to single instance", other);
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
            Some(ProfileInstance {
                id_suffix: name.clone(),
                display_label: Some(name),
                env_overrides,
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

    #[test]
    fn full_provider_id_collapses_empty_suffix() {
        assert_eq!(full_provider_id("claude", ""), "claude");
        assert_eq!(full_provider_id("claude", "work"), "claude:work");
    }

    #[test]
    fn full_display_name_collapses_no_label() {
        assert_eq!(full_display_name("Claude", None), "Claude");
        assert_eq!(full_display_name("Claude", Some("")), "Claude");
        assert_eq!(full_display_name("Claude", Some("work")), "Claude \u{00b7} work");
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
}
