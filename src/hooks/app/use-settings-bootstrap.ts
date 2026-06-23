import { useCallback, useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import type { PluginMeta } from "@/lib/plugin-types";
import {
  arePluginSettingsEqual,
  DEFAULT_AUTO_UPDATE_INTERVAL,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_LEADERBOARD_HANDLE,
  DEFAULT_LEADERBOARD_OPT_IN,
  DEFAULT_LEADERBOARD_SHARE_LIST,
  DEFAULT_LEADERBOARD_TOKEN,
  DEFAULT_LEADERBOARD_WORKER_URL,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_THEME_MODE,
  getEnabledPluginIds,
  loadAutoUpdateInterval,
  loadDisplayMode,
  loadGlobalShortcut,
  loadLeaderboardHandle,
  loadLeaderboardOptIn,
  loadLeaderboardShareList,
  loadLeaderboardToken,
  loadLeaderboardWorkerUrl,
  loadMenubarIconStyle,
  migrateLegacyTraySettings,
  loadPluginSettings,
  loadResetTimerDisplayMode,
  loadStartOnLogin,
  loadThemeMode,
  migratePluginProfileInstancesEnabled,
  normalizePluginSettings,
  savePluginSettings,
  syncLeaderboardPrefsToPlugin,
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type GlobalShortcut,
  type LeaderboardHandle,
  type LeaderboardToken,
  type LeaderboardWorkerUrl,
  type MenubarIconStyle,
  type PluginSettings,
  type ResetTimerDisplayMode,
  type ThemeMode,
} from "@/lib/settings";

type UseSettingsBootstrapArgs = {
  setPluginSettings: (value: PluginSettings | null) => void;
  setPluginsMeta: (value: PluginMeta[]) => void;
  setAutoUpdateInterval: (value: AutoUpdateIntervalMinutes) => void;
  setThemeMode: (value: ThemeMode) => void;
  setDisplayMode: (value: DisplayMode) => void;
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void;
  setGlobalShortcut: (value: GlobalShortcut) => void;
  setStartOnLogin: (value: boolean) => void;
  setMenubarIconStyle: (value: MenubarIconStyle) => void;
  setLoadingForPlugins: (ids: string[]) => void;
  setErrorForPlugins: (ids: string[], error: string) => void;
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>;
  // Leaderboard
  setLeaderboardHandle: (value: LeaderboardHandle) => void;
  setLeaderboardToken: (value: LeaderboardToken) => void;
  setLeaderboardWorkerUrl: (value: LeaderboardWorkerUrl) => void;
  setLeaderboardOptIn: (value: boolean) => void;
  setLeaderboardShareList: (value: string[]) => void;
};

export function useSettingsBootstrap({
  setPluginSettings,
  setPluginsMeta,
  setAutoUpdateInterval,
  setThemeMode,
  setDisplayMode,
  setResetTimerDisplayMode,
  setGlobalShortcut,
  setStartOnLogin,
  setMenubarIconStyle,
  setLoadingForPlugins,
  setErrorForPlugins,
  startBatch,
  setLeaderboardHandle,
  setLeaderboardToken,
  setLeaderboardWorkerUrl,
  setLeaderboardOptIn,
  setLeaderboardShareList,
}: UseSettingsBootstrapArgs) {
  const applyStartOnLogin = useCallback(async (value: boolean) => {
    if (!isTauri()) return;
    const currentlyEnabled = await isAutostartEnabled();
    if (currentlyEnabled === value) return;

    if (value) {
      await enableAutostart();
      return;
    }

    await disableAutostart();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      try {
        const availablePlugins = await invoke<PluginMeta[]>("list_plugins");
        if (!isMounted) return;
        setPluginsMeta(availablePlugins);

        try {
          await migratePluginProfileInstancesEnabled();
        } catch (error) {
          console.error("Failed to migrate plugin profile instances:", error);
        }

        const storedSettings = await loadPluginSettings();
        const normalized = normalizePluginSettings(storedSettings, availablePlugins);
        if (!arePluginSettingsEqual(storedSettings, normalized)) {
          await savePluginSettings(normalized);
        }

        let storedInterval = DEFAULT_AUTO_UPDATE_INTERVAL;
        try {
          storedInterval = await loadAutoUpdateInterval();
        } catch (error) {
          console.error("Failed to load auto-update interval:", error);
        }

        let storedThemeMode = DEFAULT_THEME_MODE;
        try {
          storedThemeMode = await loadThemeMode();
        } catch (error) {
          console.error("Failed to load theme mode:", error);
        }

        let storedDisplayMode = DEFAULT_DISPLAY_MODE;
        try {
          storedDisplayMode = await loadDisplayMode();
        } catch (error) {
          console.error("Failed to load display mode:", error);
        }

        let storedResetTimerDisplayMode = DEFAULT_RESET_TIMER_DISPLAY_MODE;
        try {
          storedResetTimerDisplayMode = await loadResetTimerDisplayMode();
        } catch (error) {
          console.error("Failed to load reset timer display mode:", error);
        }

        let storedGlobalShortcut = DEFAULT_GLOBAL_SHORTCUT;
        try {
          storedGlobalShortcut = await loadGlobalShortcut();
        } catch (error) {
          console.error("Failed to load global shortcut:", error);
        }

        let storedStartOnLogin = DEFAULT_START_ON_LOGIN;
        try {
          storedStartOnLogin = await loadStartOnLogin();
        } catch (error) {
          console.error("Failed to load start on login:", error);
        }

        try {
          await applyStartOnLogin(storedStartOnLogin);
        } catch (error) {
          console.error("Failed to apply start on login setting:", error);
        }
        try {
          await migrateLegacyTraySettings();
        } catch (error) {
          console.error("Failed to migrate legacy tray settings:", error);
        }

        let storedMenubarIconStyle = DEFAULT_MENUBAR_ICON_STYLE;
        try {
          storedMenubarIconStyle = await loadMenubarIconStyle();
        } catch (error) {
          console.error("Failed to load menubar icon style:", error);
        }

        let storedLeaderboardHandle = DEFAULT_LEADERBOARD_HANDLE;
        try {
          storedLeaderboardHandle = await loadLeaderboardHandle();
        } catch (error) {
          console.error("Failed to load leaderboard handle:", error);
        }

        let storedLeaderboardToken = DEFAULT_LEADERBOARD_TOKEN;
        try {
          storedLeaderboardToken = await loadLeaderboardToken();
        } catch (error) {
          console.error("Failed to load leaderboard token:", error);
        }

        let storedLeaderboardWorkerUrl = DEFAULT_LEADERBOARD_WORKER_URL;
        try {
          storedLeaderboardWorkerUrl = await loadLeaderboardWorkerUrl();
        } catch (error) {
          console.error("Failed to load leaderboard worker URL:", error);
        }

        let storedLeaderboardOptIn = DEFAULT_LEADERBOARD_OPT_IN;
        try {
          storedLeaderboardOptIn = await loadLeaderboardOptIn();
        } catch (error) {
          console.error("Failed to load leaderboard opt-in:", error);
        }

        let storedLeaderboardShareList = DEFAULT_LEADERBOARD_SHARE_LIST;
        try {
          storedLeaderboardShareList = await loadLeaderboardShareList();
        } catch (error) {
          console.error("Failed to load leaderboard share list:", error);
        }

        if (isMounted) {
          setPluginSettings(normalized);
          setAutoUpdateInterval(storedInterval);
          setThemeMode(storedThemeMode);
          setDisplayMode(storedDisplayMode);
          setResetTimerDisplayMode(storedResetTimerDisplayMode);
          setGlobalShortcut(storedGlobalShortcut);
          setStartOnLogin(storedStartOnLogin);
          setMenubarIconStyle(storedMenubarIconStyle);
          setLeaderboardHandle(storedLeaderboardHandle);
          setLeaderboardToken(storedLeaderboardToken);
          setLeaderboardWorkerUrl(storedLeaderboardWorkerUrl);
          setLeaderboardOptIn(storedLeaderboardOptIn);
          setLeaderboardShareList(storedLeaderboardShareList);

          // Sync leaderboard prefs to the plugin file so plugin.js can read them
          try {
            const dir = await appDataDir();
            await syncLeaderboardPrefsToPlugin(dir, {
              handle: storedLeaderboardHandle,
              token: storedLeaderboardToken,
              workerUrl: storedLeaderboardWorkerUrl,
              optIn: storedLeaderboardOptIn,
              shareList: storedLeaderboardShareList,
            });
          } catch (error) {
            console.error("Failed to sync leaderboard prefs to plugin on startup:", error);
          }

          const enabledIds = getEnabledPluginIds(normalized);
          setLoadingForPlugins(enabledIds);
          try {
            await startBatch(enabledIds);
          } catch (error) {
            console.error("Failed to start probe batch:", error);
            if (isMounted) {
              setErrorForPlugins(enabledIds, "Failed to start probe");
            }
          }
        }
      } catch (e) {
        console.error("Failed to load plugin settings:", e);
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, [
    applyStartOnLogin,
    setAutoUpdateInterval,
    setDisplayMode,
    setErrorForPlugins,
    setGlobalShortcut,
    setLeaderboardHandle,
    setLeaderboardOptIn,
    setLeaderboardShareList,
    setLeaderboardToken,
    setLeaderboardWorkerUrl,
    setLoadingForPlugins,
    setMenubarIconStyle,
    migrateLegacyTraySettings,
    setPluginSettings,
    setPluginsMeta,
    setResetTimerDisplayMode,
    setStartOnLogin,
    setThemeMode,
    startBatch,
  ]);

  return {
    applyStartOnLogin,
  };
}
