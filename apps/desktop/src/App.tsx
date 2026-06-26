import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { invoke } from "@tauri-apps/api/core";
import { AppShell } from "@/components/app/app-shell";
import { useAppPluginViews } from "@/hooks/app/use-app-plugin-views";
import { useProbe } from "@/hooks/app/use-probe";
import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap";
import { useSettingsDisplayActions } from "@/hooks/app/use-settings-display-actions";
import { useSettingsLeaderboardActions } from "@/hooks/app/use-settings-leaderboard-actions";
import { useSettingsPluginActions } from "@/hooks/app/use-settings-plugin-actions";
import { useSettingsPluginList } from "@/hooks/app/use-settings-plugin-list";
import { useSettingsSystemActions } from "@/hooks/app/use-settings-system-actions";
import { useSettingsTheme } from "@/hooks/app/use-settings-theme";
import { useTrayIcon } from "@/hooks/app/use-tray-icon";
import { REFRESH_COOLDOWN_MS, savePluginSettings } from "@/lib/settings";
import { type PluginContextAction } from "@/components/side-nav";
import { useAppPluginStore } from "@/stores/app-plugin-store";
import { useAppPreferencesStore } from "@/stores/app-preferences-store";
import { useAppUiStore } from "@/stores/app-ui-store";

const TRAY_PROBE_DEBOUNCE_MS = 500;
const TRAY_SETTINGS_DEBOUNCE_MS = 2000;

function App() {
  const { activeView, setActiveView } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
      setActiveView: state.setActiveView,
    })),
  );

  const { pluginsMeta, setPluginsMeta, pluginSettings, setPluginSettings } = useAppPluginStore(
    useShallow((state) => ({
      pluginsMeta: state.pluginsMeta,
      setPluginsMeta: state.setPluginsMeta,
      pluginSettings: state.pluginSettings,
      setPluginSettings: state.setPluginSettings,
    })),
  );

  const {
    autoUpdateInterval,
    setAutoUpdateInterval,
    themeMode,
    setThemeMode,
    displayMode,
    setDisplayMode,
    menubarIconStyle,
    setMenubarIconStyle,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setGlobalShortcut,
    setStartOnLogin,
    setTelemetryOptIn,
    leaderboardHandle,
    leaderboardToken,
    leaderboardWorkerUrl,
    leaderboardOptIn,
    leaderboardShareList,
    setLeaderboardHandle,
    setLeaderboardToken,
    setLeaderboardWorkerUrl,
    setLeaderboardOptIn,
    setLeaderboardShareList,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      autoUpdateInterval: state.autoUpdateInterval,
      setAutoUpdateInterval: state.setAutoUpdateInterval,
      themeMode: state.themeMode,
      setThemeMode: state.setThemeMode,
      displayMode: state.displayMode,
      setDisplayMode: state.setDisplayMode,
      menubarIconStyle: state.menubarIconStyle,
      setMenubarIconStyle: state.setMenubarIconStyle,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      setResetTimerDisplayMode: state.setResetTimerDisplayMode,
      setGlobalShortcut: state.setGlobalShortcut,
      setStartOnLogin: state.setStartOnLogin,
      setTelemetryOptIn: state.setTelemetryOptIn,
      leaderboardHandle: state.leaderboardHandle,
      leaderboardToken: state.leaderboardToken,
      leaderboardWorkerUrl: state.leaderboardWorkerUrl,
      leaderboardOptIn: state.leaderboardOptIn,
      leaderboardShareList: state.leaderboardShareList,
      setLeaderboardHandle: state.setLeaderboardHandle,
      setLeaderboardToken: state.setLeaderboardToken,
      setLeaderboardWorkerUrl: state.setLeaderboardWorkerUrl,
      setLeaderboardOptIn: state.setLeaderboardOptIn,
      setLeaderboardShareList: state.setLeaderboardShareList,
    })),
  );

  const scheduleProbeTrayUpdateRef = useRef<() => void>(() => {});
  const handleProbeResult = useCallback(() => {
    scheduleProbeTrayUpdateRef.current();
  }, []);

  const {
    pluginStates,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    autoUpdateNextAt,
    setAutoUpdateNextAt,
    handleRetryPlugin,
    handleRefreshAll,
  } = useProbe({
    pluginSettings,
    autoUpdateInterval,
    onProbeResult: handleProbeResult,
  });

  const { scheduleTrayIconUpdate, traySettingsPreview } = useTrayIcon({
    pluginsMeta,
    pluginSettings,
    pluginStates,
    displayMode,
    menubarIconStyle,
    activeView,
  });

  useEffect(() => {
    scheduleProbeTrayUpdateRef.current = () => {
      scheduleTrayIconUpdate("probe", TRAY_PROBE_DEBOUNCE_MS);
    };
  }, [scheduleTrayIconUpdate]);

  const { applyStartOnLogin } = useSettingsBootstrap({
    setPluginSettings,
    setPluginsMeta,
    setAutoUpdateInterval,
    setThemeMode,
    setDisplayMode,
    setMenubarIconStyle,
    setResetTimerDisplayMode,
    setGlobalShortcut,
    setStartOnLogin,
    setTelemetryOptIn,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    setLeaderboardHandle,
    setLeaderboardToken,
    setLeaderboardWorkerUrl,
    setLeaderboardOptIn,
    setLeaderboardShareList,
  });

  useSettingsTheme(themeMode);

  const {
    handleThemeModeChange,
    handleDisplayModeChange,
    handleResetTimerDisplayModeChange,
    handleResetTimerDisplayModeToggle,
    handleMenubarIconStyleChange,
  } = useSettingsDisplayActions({
    setThemeMode,
    setDisplayMode,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setMenubarIconStyle,
    scheduleTrayIconUpdate,
  });

  const {
    handleLeaderboardHandleChange,
    handleLeaderboardTokenChange,
    handleLeaderboardWorkerUrlChange,
    handleLeaderboardOptInChange,
    handleLeaderboardShareListChange,
  } = useSettingsLeaderboardActions({
    leaderboardHandle,
    leaderboardToken,
    leaderboardWorkerUrl,
    leaderboardOptIn,
    leaderboardShareList,
    setLeaderboardHandle,
    setLeaderboardToken,
    setLeaderboardWorkerUrl,
    setLeaderboardOptIn,
    setLeaderboardShareList,
  });

  const {
    handleAutoUpdateIntervalChange,
    handleGlobalShortcutChange,
    handleStartOnLoginChange,
    handleTelemetryOptInChange,
  } = useSettingsSystemActions({
    pluginSettings,
    setAutoUpdateInterval,
    setAutoUpdateNextAt,
    setGlobalShortcut,
    setStartOnLogin,
    setTelemetryOptIn,
    applyStartOnLogin,
  });

  const { handleReorder, handleToggle } = useSettingsPluginActions({
    pluginSettings,
    setPluginSettings,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    scheduleTrayIconUpdate,
  });

  const settingsPlugins = useSettingsPluginList({
    pluginSettings,
    pluginsMeta,
  });

  const { displayPlugins, navPlugins, selectedPlugin } = useAppPluginViews({
    activeView,
    setActiveView,
    pluginSettings,
    pluginsMeta,
    pluginStates,
  });

  const pluginSettingsRef = useRef(pluginSettings);
  useEffect(() => {
    pluginSettingsRef.current = pluginSettings;
  }, [pluginSettings]);

  const handlePluginContextAction = useCallback(
    (pluginId: string, action: PluginContextAction) => {
      if (action === "reload") {
        handleRetryPlugin(pluginId);
        return;
      }

      const currentSettings = pluginSettingsRef.current;
      if (!currentSettings) return;
      const alreadyDisabled = currentSettings.disabled.includes(pluginId);
      if (alreadyDisabled) return;

      const nextSettings = {
        ...currentSettings,
        disabled: [...currentSettings.disabled, pluginId],
      };
      setPluginSettings(nextSettings);
      scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS);
      void savePluginSettings(nextSettings).catch((error) => {
        console.error("Failed to save plugin toggle:", error);
      });

      if (activeView === pluginId) {
        setActiveView("home");
      }
    },
    [activeView, handleRetryPlugin, scheduleTrayIconUpdate, setActiveView, setPluginSettings],
  );

  const handleAvatarChange = useCallback(
    (pluginId: string, dataUrl: string | null) => {
      if (dataUrl) {
        const commaIdx = dataUrl.indexOf(",");
        const header = dataUrl.slice(0, commaIdx);
        const mimeType = header.replace(/^data:/, "").replace(/;base64$/, "");
        const binaryStr = atob(dataUrl.slice(commaIdx + 1));
        const bytes = Array.from({ length: binaryStr.length }, (_, i) => binaryStr.charCodeAt(i));
        invoke("set_profile_avatar", { pluginId, bytes, mimeType })
          .then(() => {
            setPluginsMeta(
              pluginsMeta.map((p) => (p.id === pluginId ? { ...p, avatarUrl: dataUrl } : p)),
            );
          })
          .catch((err) => {
            console.error("set_profile_avatar failed:", err);
          });
      } else {
        invoke("remove_profile_avatar", { pluginId })
          .then(() => {
            setPluginsMeta(
              pluginsMeta.map((p) => (p.id === pluginId ? { ...p, avatarUrl: undefined } : p)),
            );
          })
          .catch((err) => {
            console.error("remove_profile_avatar failed:", err);
          });
      }
    },
    [pluginsMeta, setPluginsMeta],
  );

  const isPluginRefreshAvailable = useCallback(
    (pluginId: string) => {
      const pluginState = pluginStates[pluginId];
      if (!pluginState) return true;
      if (pluginState.loading) return false;
      if (!pluginState.lastManualRefreshAt) return true;
      return Date.now() - pluginState.lastManualRefreshAt >= REFRESH_COOLDOWN_MS;
    },
    [pluginStates],
  );

  return (
    <AppShell
      onRefreshAll={handleRefreshAll}
      navPlugins={navPlugins}
      displayPlugins={displayPlugins}
      settingsPlugins={settingsPlugins}
      autoUpdateNextAt={autoUpdateNextAt}
      selectedPlugin={selectedPlugin}
      onPluginContextAction={handlePluginContextAction}
      isPluginRefreshAvailable={isPluginRefreshAvailable}
      onNavReorder={handleReorder}
      appContentProps={{
        onRetryPlugin: handleRetryPlugin,
        onReorder: handleReorder,
        onToggle: handleToggle,
        onAutoUpdateIntervalChange: handleAutoUpdateIntervalChange,
        onThemeModeChange: handleThemeModeChange,
        onDisplayModeChange: handleDisplayModeChange,
        onResetTimerDisplayModeChange: handleResetTimerDisplayModeChange,
        onResetTimerDisplayModeToggle: handleResetTimerDisplayModeToggle,
        onMenubarIconStyleChange: handleMenubarIconStyleChange,
        traySettingsPreview,
        onGlobalShortcutChange: handleGlobalShortcutChange,
        onStartOnLoginChange: handleStartOnLoginChange,
        onTelemetryOptInChange: handleTelemetryOptInChange,
        onAvatarChange: handleAvatarChange,
        onLeaderboardHandleChange: handleLeaderboardHandleChange,
        onLeaderboardTokenChange: handleLeaderboardTokenChange,
        onLeaderboardWorkerUrlChange: handleLeaderboardWorkerUrlChange,
        onLeaderboardOptInChange: handleLeaderboardOptInChange,
        onLeaderboardShareListChange: handleLeaderboardShareListChange,
      }}
    />
  );
}

export { App };
