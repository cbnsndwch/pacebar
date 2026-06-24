import { LazyStore } from "@tauri-apps/plugin-store";
import type { PluginMeta } from "@/lib/plugin-types";

// Refresh cooldown duration in milliseconds (5 minutes)
export const REFRESH_COOLDOWN_MS = 300_000;

// Spec: persist plugin order + disabled list; new plugins append, default disabled unless in DEFAULT_ENABLED_PLUGINS.
export type PluginSettings = {
  order: string[];
  disabled: string[];
};

export type AutoUpdateIntervalMinutes = 5 | 15 | 30 | 60;

export type ThemeMode = "system" | "light" | "dark";

export type DisplayMode = "used" | "left";

export type ResetTimerDisplayMode = "relative" | "absolute";

export type MenubarIconStyle = "provider" | "bars" | "donut";

export type GlobalShortcut = string | null;

// ─── Leaderboard ─────────────────────────────────────────────────────────────
export type LeaderboardHandle = string | null;
export type LeaderboardToken = string | null;
export type LeaderboardWorkerUrl = string | null;

const SETTINGS_STORE_PATH = "settings.json";
const PLUGIN_SETTINGS_KEY = "plugins";
const AUTO_UPDATE_SETTINGS_KEY = "autoUpdateInterval";
const THEME_MODE_KEY = "themeMode";
const DISPLAY_MODE_KEY = "displayMode";
const RESET_TIMER_DISPLAY_MODE_KEY = "resetTimerDisplayMode";
const MENUBAR_ICON_STYLE_KEY = "menubarIconStyle";
const LEGACY_TRAY_ICON_STYLE_KEY = "trayIconStyle";
const LEGACY_TRAY_SHOW_PERCENTAGE_KEY = "trayShowPercentage";
const GLOBAL_SHORTCUT_KEY = "globalShortcut";
const START_ON_LOGIN_KEY = "startOnLogin";
const LOG_LEVEL_KEY = "logLevel";

// Verbose logging maps to the shared `logLevel` store key (also driven by the
// tray "Debug Level" menu). On = "trace" (everything), off = "error" (default).
const VERBOSE_LOG_LEVEL = "trace";
const QUIET_LOG_LEVEL = "error";

const LEADERBOARD_HANDLE_KEY = "leaderboard.handle";
const LEADERBOARD_TOKEN_KEY = "leaderboard.token";
const LEADERBOARD_WORKER_URL_KEY = "leaderboard.workerUrl";
const LEADERBOARD_OPT_IN_KEY = "leaderboard.optIn";
const LEADERBOARD_SHARE_LIST_KEY = "leaderboard.shareList";

export const DEFAULT_AUTO_UPDATE_INTERVAL: AutoUpdateIntervalMinutes = 15;
export const DEFAULT_THEME_MODE: ThemeMode = "system";
export const DEFAULT_DISPLAY_MODE: DisplayMode = "left";
export const DEFAULT_RESET_TIMER_DISPLAY_MODE: ResetTimerDisplayMode = "relative";
export const DEFAULT_MENUBAR_ICON_STYLE: MenubarIconStyle = "provider";
export const DEFAULT_GLOBAL_SHORTCUT: GlobalShortcut = null;
export const DEFAULT_START_ON_LOGIN = false;

export const DEFAULT_LEADERBOARD_HANDLE: LeaderboardHandle = null;
export const DEFAULT_LEADERBOARD_TOKEN: LeaderboardToken = null;
export const DEFAULT_LEADERBOARD_WORKER_URL: LeaderboardWorkerUrl = null;
export const DEFAULT_LEADERBOARD_OPT_IN = false;
export const DEFAULT_LEADERBOARD_SHARE_LIST: string[] = [];

const AUTO_UPDATE_INTERVALS: AutoUpdateIntervalMinutes[] = [5, 15, 30, 60];
const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];
const DISPLAY_MODES: DisplayMode[] = ["used", "left"];
const RESET_TIMER_DISPLAY_MODES: ResetTimerDisplayMode[] = ["relative", "absolute"];
const MENUBAR_ICON_STYLES: MenubarIconStyle[] = ["provider", "donut", "bars"];

export const MENUBAR_ICON_STYLE_OPTIONS: { value: MenubarIconStyle; label: string }[] = [
  { value: "provider", label: "Plugin" },
  { value: "donut", label: "Donut" },
  { value: "bars", label: "Bars" },
];

export const AUTO_UPDATE_OPTIONS: { value: AutoUpdateIntervalMinutes; label: string }[] =
  AUTO_UPDATE_INTERVALS.map((value) => ({
    value,
    label: value === 60 ? "1 hour" : `${value} min`,
  }));

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = THEME_MODES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));

export const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "used", label: "Used" },
];

export const RESET_TIMER_DISPLAY_OPTIONS: { value: ResetTimerDisplayMode; label: string }[] = [
  { value: "relative", label: "Relative" },
  { value: "absolute", label: "Absolute" },
];

const store = new LazyStore(SETTINGS_STORE_PATH);

const DEFAULT_ENABLED_PLUGINS = new Set(["claude", "codex", "cursor"]);

const PLUGIN_PROFILES_MIGRATION_KEY = "migrations.pluginProfilesAutoEnabled";

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  order: [],
  disabled: [],
};

/**
 * Strip a profile-instance suffix from a provider id.
 * `claude:work` → `claude`; `claude` → `claude`.
 */
function basePluginId(id: string): string {
  const idx = id.indexOf(":");
  return idx > 0 ? id.slice(0, idx) : id;
}

function isDefaultEnabled(id: string): boolean {
  return DEFAULT_ENABLED_PLUGINS.has(basePluginId(id));
}

export async function loadPluginSettings(): Promise<PluginSettings> {
  const stored = await store.get<PluginSettings>(PLUGIN_SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_PLUGIN_SETTINGS };
  return {
    order: Array.isArray(stored.order) ? stored.order : [],
    disabled: Array.isArray(stored.disabled) ? stored.disabled : [],
  };
}

export async function savePluginSettings(settings: PluginSettings): Promise<void> {
  await store.set(PLUGIN_SETTINGS_KEY, settings);
  await store.save();
}

function isAutoUpdateInterval(value: unknown): value is AutoUpdateIntervalMinutes {
  return (
    typeof value === "number" && AUTO_UPDATE_INTERVALS.includes(value as AutoUpdateIntervalMinutes)
  );
}

export async function loadAutoUpdateInterval(): Promise<AutoUpdateIntervalMinutes> {
  const stored = await store.get<unknown>(AUTO_UPDATE_SETTINGS_KEY);
  if (isAutoUpdateInterval(stored)) return stored;
  return DEFAULT_AUTO_UPDATE_INTERVAL;
}

export async function saveAutoUpdateInterval(interval: AutoUpdateIntervalMinutes): Promise<void> {
  await store.set(AUTO_UPDATE_SETTINGS_KEY, interval);
  await store.save();
}

export function normalizePluginSettings(
  settings: PluginSettings,
  plugins: PluginMeta[],
): PluginSettings {
  const knownIds = plugins.map((plugin) => plugin.id);
  const knownSet = new Set(knownIds);

  const order: string[] = [];
  const seen = new Set<string>();
  for (const id of settings.order) {
    if (!knownSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  const newlyAdded: string[] = [];
  for (const id of knownIds) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
      newlyAdded.push(id);
    }
  }

  const disabled = settings.disabled.filter((id) => knownSet.has(id));
  for (const id of newlyAdded) {
    if (!isDefaultEnabled(id) && !disabled.includes(id)) {
      disabled.push(id);
    }
  }
  return { order, disabled };
}

export function arePluginSettingsEqual(a: PluginSettings, b: PluginSettings): boolean {
  if (a.order.length !== b.order.length) return false;
  if (a.disabled.length !== b.disabled.length) return false;
  for (let i = 0; i < a.order.length; i += 1) {
    if (a.order[i] !== b.order[i]) return false;
  }
  for (let i = 0; i < a.disabled.length; i += 1) {
    if (a.disabled[i] !== b.disabled[i]) return false;
  }
  return true;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEME_MODES.includes(value as ThemeMode);
}

export async function loadThemeMode(): Promise<ThemeMode> {
  const stored = await store.get<unknown>(THEME_MODE_KEY);
  if (isThemeMode(stored)) return stored;
  return DEFAULT_THEME_MODE;
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await store.set(THEME_MODE_KEY, mode);
  await store.save();
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return typeof value === "string" && DISPLAY_MODES.includes(value as DisplayMode);
}

export async function loadDisplayMode(): Promise<DisplayMode> {
  const stored = await store.get<unknown>(DISPLAY_MODE_KEY);
  if (isDisplayMode(stored)) return stored;
  return DEFAULT_DISPLAY_MODE;
}

export async function saveDisplayMode(mode: DisplayMode): Promise<void> {
  await store.set(DISPLAY_MODE_KEY, mode);
  await store.save();
}

function isResetTimerDisplayMode(value: unknown): value is ResetTimerDisplayMode {
  return (
    typeof value === "string" && RESET_TIMER_DISPLAY_MODES.includes(value as ResetTimerDisplayMode)
  );
}

export async function loadResetTimerDisplayMode(): Promise<ResetTimerDisplayMode> {
  const stored = await store.get<unknown>(RESET_TIMER_DISPLAY_MODE_KEY);
  if (isResetTimerDisplayMode(stored)) return stored;
  return DEFAULT_RESET_TIMER_DISPLAY_MODE;
}

export async function saveResetTimerDisplayMode(mode: ResetTimerDisplayMode): Promise<void> {
  await store.set(RESET_TIMER_DISPLAY_MODE_KEY, mode);
  await store.save();
}

function isMenubarIconStyle(value: unknown): value is MenubarIconStyle {
  return typeof value === "string" && MENUBAR_ICON_STYLES.includes(value as MenubarIconStyle);
}

export async function loadMenubarIconStyle(): Promise<MenubarIconStyle> {
  const stored = await store.get<unknown>(MENUBAR_ICON_STYLE_KEY);
  if (isMenubarIconStyle(stored)) return stored;
  return DEFAULT_MENUBAR_ICON_STYLE;
}

export async function saveMenubarIconStyle(style: MenubarIconStyle): Promise<void> {
  await store.set(MENUBAR_ICON_STYLE_KEY, style);
  await store.save();
}

type LegacyStoreWithDelete = {
  delete?: (key: string) => Promise<void>;
};

async function deleteStoreKey(key: string): Promise<void> {
  const maybeDelete = (store as unknown as LegacyStoreWithDelete).delete;
  if (typeof maybeDelete === "function") {
    await maybeDelete.call(store, key);
    return;
  }
  // Fallback for store implementations without delete support.
  await store.set(key, null);
}

export async function migrateLegacyTraySettings(): Promise<void> {
  const [legacyTrayStyle, legacyShowPercentage, currentMenubarStyle] = await Promise.all([
    store.get<unknown>(LEGACY_TRAY_ICON_STYLE_KEY),
    store.get<unknown>(LEGACY_TRAY_SHOW_PERCENTAGE_KEY),
    store.get<unknown>(MENUBAR_ICON_STYLE_KEY),
  ]);

  const hasLegacyTrayStyle = legacyTrayStyle != null;
  const hasLegacyShowPercentage = legacyShowPercentage != null;
  if (!hasLegacyTrayStyle && !hasLegacyShowPercentage) return;

  if (hasLegacyTrayStyle && currentMenubarStyle == null) {
    if (legacyTrayStyle === "bars") {
      await store.set(MENUBAR_ICON_STYLE_KEY, "bars");
    } else if (legacyTrayStyle === "circle") {
      await store.set(MENUBAR_ICON_STYLE_KEY, "donut");
    }
  }

  const removals: Promise<void>[] = [];
  if (hasLegacyTrayStyle) removals.push(deleteStoreKey(LEGACY_TRAY_ICON_STYLE_KEY));
  if (hasLegacyShowPercentage) removals.push(deleteStoreKey(LEGACY_TRAY_SHOW_PERCENTAGE_KEY));
  await Promise.all(removals);
  await store.save();
}

export function getEnabledPluginIds(settings: PluginSettings): string[] {
  const disabledSet = new Set(settings.disabled);
  return settings.order.filter((id) => !disabledSet.has(id));
}

/**
 * One-shot cleanup for users who upgraded across the introduction of
 * profile-instance ids (e.g. `claude:work`). The previous normalizePluginSettings
 * would auto-disable those ids because `DEFAULT_ENABLED_PLUGINS` only knew the
 * bare id. Clear them once so the user sees their profiles by default; once the
 * migration flag is set, future explicit disables stick.
 */
export async function migratePluginProfileInstancesEnabled(): Promise<void> {
  const done = await store.get<unknown>(PLUGIN_PROFILES_MIGRATION_KEY);
  if (done === true) return;

  const settings = await loadPluginSettings();
  const cleaned = settings.disabled.filter((id) => {
    if (!id.includes(":")) return true;
    return !DEFAULT_ENABLED_PLUGINS.has(basePluginId(id));
  });

  if (cleaned.length !== settings.disabled.length) {
    await savePluginSettings({ ...settings, disabled: cleaned });
  }
  await store.set(PLUGIN_PROFILES_MIGRATION_KEY, true);
  await store.save();
}

function isGlobalShortcut(value: unknown): value is GlobalShortcut {
  if (value === null) return true;
  return typeof value === "string";
}

export async function loadGlobalShortcut(): Promise<GlobalShortcut> {
  const stored = await store.get<unknown>(GLOBAL_SHORTCUT_KEY);
  if (isGlobalShortcut(stored)) return stored;
  return DEFAULT_GLOBAL_SHORTCUT;
}

export async function saveGlobalShortcut(shortcut: GlobalShortcut): Promise<void> {
  await store.set(GLOBAL_SHORTCUT_KEY, shortcut);
  await store.save();
}

export async function loadStartOnLogin(): Promise<boolean> {
  const stored = await store.get<unknown>(START_ON_LOGIN_KEY);
  if (typeof stored === "boolean") return stored;
  return DEFAULT_START_ON_LOGIN;
}

export async function saveStartOnLogin(value: boolean): Promise<void> {
  await store.set(START_ON_LOGIN_KEY, value);
  await store.save();
}

export async function loadVerboseLogging(): Promise<boolean> {
  const stored = await store.get<unknown>(LOG_LEVEL_KEY);
  // "debug" and "trace" are the verbose levels; anything else counts as off.
  return stored === "debug" || stored === "trace";
}

/**
 * Toggle verbose debug logging. Delegates to the `set_log_level` Tauri command,
 * which both persists `logLevel` to settings.json and applies it to the running
 * logger so verbose output starts immediately (no restart needed).
 */
export async function setVerboseLogging(enabled: boolean): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_log_level", { level: enabled ? VERBOSE_LOG_LEVEL : QUIET_LOG_LEVEL });
}

// ─── Leaderboard settings ────────────────────────────────────────────────────

export async function loadLeaderboardHandle(): Promise<LeaderboardHandle> {
  const v = await store.get<unknown>(LEADERBOARD_HANDLE_KEY);
  return typeof v === "string" ? v : DEFAULT_LEADERBOARD_HANDLE;
}

export async function saveLeaderboardHandle(handle: LeaderboardHandle): Promise<void> {
  await store.set(LEADERBOARD_HANDLE_KEY, handle);
  await store.save();
}

export async function loadLeaderboardToken(): Promise<LeaderboardToken> {
  const v = await store.get<unknown>(LEADERBOARD_TOKEN_KEY);
  return typeof v === "string" ? v : DEFAULT_LEADERBOARD_TOKEN;
}

export async function saveLeaderboardToken(token: LeaderboardToken): Promise<void> {
  await store.set(LEADERBOARD_TOKEN_KEY, token);
  await store.save();
}

export async function loadLeaderboardWorkerUrl(): Promise<LeaderboardWorkerUrl> {
  const v = await store.get<unknown>(LEADERBOARD_WORKER_URL_KEY);
  return typeof v === "string" ? v : DEFAULT_LEADERBOARD_WORKER_URL;
}

export async function saveLeaderboardWorkerUrl(url: LeaderboardWorkerUrl): Promise<void> {
  await store.set(LEADERBOARD_WORKER_URL_KEY, url);
  await store.save();
}

export async function loadLeaderboardOptIn(): Promise<boolean> {
  const v = await store.get<unknown>(LEADERBOARD_OPT_IN_KEY);
  return typeof v === "boolean" ? v : DEFAULT_LEADERBOARD_OPT_IN;
}

export async function saveLeaderboardOptIn(optIn: boolean): Promise<void> {
  await store.set(LEADERBOARD_OPT_IN_KEY, optIn);
  await store.save();
}

export async function loadLeaderboardShareList(): Promise<string[]> {
  const v = await store.get<unknown>(LEADERBOARD_SHARE_LIST_KEY);
  return Array.isArray(v) ? (v as string[]) : DEFAULT_LEADERBOARD_SHARE_LIST;
}

export async function saveLeaderboardShareList(list: string[]): Promise<void> {
  await store.set(LEADERBOARD_SHARE_LIST_KEY, list);
  await store.save();
}

/**
 * Write leaderboard prefs to the plugin's dedicated prefs file so
 * plugin.js can read them without going through the Tauri store API.
 * Call this whenever any leaderboard setting changes.
 *
 * Uses the `write_leaderboard_prefs` Tauri command (no plugin-fs dependency).
 * The `_appDataDir` parameter is kept for API compatibility but unused.
 */
export async function syncLeaderboardPrefsToPlugin(
  _appDataDir: string,
  prefs: {
    handle: LeaderboardHandle;
    token: LeaderboardToken;
    workerUrl: LeaderboardWorkerUrl;
    optIn: boolean;
    shareList: string[];
  },
): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_leaderboard_prefs", { data: JSON.stringify(prefs) });
}
