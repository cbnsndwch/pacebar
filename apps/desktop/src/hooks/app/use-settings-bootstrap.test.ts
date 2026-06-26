import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  arePluginSettingsEqualMock,
  disableAutostartMock,
  enableAutostartMock,
  getEnabledPluginIdsMock,
  invokeMock,
  isAutostartEnabledMock,
  isTauriMock,
  loadAutoUpdateIntervalMock,
  loadDisplayModeMock,
  loadGlobalShortcutMock,
  loadMenubarIconStyleMock,
  loadPluginSettingsMock,
  loadResetTimerDisplayModeMock,
  loadStartOnLoginMock,
  loadTelemetryOptInMock,
  loadThemeModeMock,
  migrateLegacyTraySettingsMock,
  migratePluginProfileInstancesEnabledMock,
  normalizePluginSettingsMock,
  savePluginSettingsMock,
  loadLeaderboardHandleMock,
  loadLeaderboardTokenMock,
  loadLeaderboardWorkerUrlMock,
  loadLeaderboardOptInMock,
  loadLeaderboardShareListMock,
  syncLeaderboardPrefsToPluginMock,
  appDataDirMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
  isAutostartEnabledMock: vi.fn(),
  enableAutostartMock: vi.fn(),
  disableAutostartMock: vi.fn(),
  arePluginSettingsEqualMock: vi.fn(),
  getEnabledPluginIdsMock: vi.fn(),
  loadAutoUpdateIntervalMock: vi.fn(),
  loadDisplayModeMock: vi.fn(),
  loadGlobalShortcutMock: vi.fn(),
  loadMenubarIconStyleMock: vi.fn(),
  loadPluginSettingsMock: vi.fn(),
  loadResetTimerDisplayModeMock: vi.fn(),
  loadStartOnLoginMock: vi.fn(),
  loadTelemetryOptInMock: vi.fn(),
  loadThemeModeMock: vi.fn(),
  migrateLegacyTraySettingsMock: vi.fn(),
  migratePluginProfileInstancesEnabledMock: vi.fn(),
  normalizePluginSettingsMock: vi.fn(),
  savePluginSettingsMock: vi.fn(),
  loadLeaderboardHandleMock: vi.fn(),
  loadLeaderboardTokenMock: vi.fn(),
  loadLeaderboardWorkerUrlMock: vi.fn(),
  loadLeaderboardOptInMock: vi.fn(),
  loadLeaderboardShareListMock: vi.fn(),
  syncLeaderboardPrefsToPluginMock: vi.fn(),
  appDataDirMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: appDataDirMock,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}));

vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: disableAutostartMock,
  enable: enableAutostartMock,
  isEnabled: isAutostartEnabledMock,
}));

vi.mock("@/lib/settings", () => ({
  arePluginSettingsEqual: arePluginSettingsEqualMock,
  DEFAULT_AUTO_UPDATE_INTERVAL: 15,
  DEFAULT_DISPLAY_MODE: "left",
  DEFAULT_GLOBAL_SHORTCUT: null,
  DEFAULT_MENUBAR_ICON_STYLE: "provider",
  DEFAULT_RESET_TIMER_DISPLAY_MODE: "relative",
  DEFAULT_START_ON_LOGIN: false,
  DEFAULT_TELEMETRY_OPT_IN: false,
  DEFAULT_THEME_MODE: "system",
  DEFAULT_LEADERBOARD_HANDLE: null,
  DEFAULT_LEADERBOARD_TOKEN: null,
  DEFAULT_LEADERBOARD_WORKER_URL: null,
  DEFAULT_LEADERBOARD_OPT_IN: false,
  DEFAULT_LEADERBOARD_SHARE_LIST: [],
  getEnabledPluginIds: getEnabledPluginIdsMock,
  loadAutoUpdateInterval: loadAutoUpdateIntervalMock,
  loadDisplayMode: loadDisplayModeMock,
  loadGlobalShortcut: loadGlobalShortcutMock,
  loadMenubarIconStyle: loadMenubarIconStyleMock,
  loadPluginSettings: loadPluginSettingsMock,
  loadResetTimerDisplayMode: loadResetTimerDisplayModeMock,
  loadStartOnLogin: loadStartOnLoginMock,
  loadTelemetryOptIn: loadTelemetryOptInMock,
  loadThemeMode: loadThemeModeMock,
  loadLeaderboardHandle: loadLeaderboardHandleMock,
  loadLeaderboardToken: loadLeaderboardTokenMock,
  loadLeaderboardWorkerUrl: loadLeaderboardWorkerUrlMock,
  loadLeaderboardOptIn: loadLeaderboardOptInMock,
  loadLeaderboardShareList: loadLeaderboardShareListMock,
  syncLeaderboardPrefsToPlugin: syncLeaderboardPrefsToPluginMock,
  migrateLegacyTraySettings: migrateLegacyTraySettingsMock,
  migratePluginProfileInstancesEnabled: migratePluginProfileInstancesEnabledMock,
  normalizePluginSettings: normalizePluginSettingsMock,
  savePluginSettings: savePluginSettingsMock,
}));

import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap";

function createArgs() {
  return {
    setPluginSettings: vi.fn(),
    setPluginsMeta: vi.fn(),
    setAutoUpdateInterval: vi.fn(),
    setThemeMode: vi.fn(),
    setDisplayMode: vi.fn(),
    setResetTimerDisplayMode: vi.fn(),
    setGlobalShortcut: vi.fn(),
    setStartOnLogin: vi.fn(),
    setMenubarIconStyle: vi.fn(),
    setTelemetryOptIn: vi.fn(),
    setLoadingForPlugins: vi.fn(),
    setErrorForPlugins: vi.fn(),
    startBatch: vi.fn().mockResolvedValue(undefined),
    setLeaderboardHandle: vi.fn(),
    setLeaderboardToken: vi.fn(),
    setLeaderboardWorkerUrl: vi.fn(),
    setLeaderboardOptIn: vi.fn(),
    setLeaderboardShareList: vi.fn(),
  };
}

describe("useSettingsBootstrap", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    isTauriMock.mockReset();
    isAutostartEnabledMock.mockReset();
    enableAutostartMock.mockReset();
    disableAutostartMock.mockReset();
    arePluginSettingsEqualMock.mockReset();
    getEnabledPluginIdsMock.mockReset();
    loadAutoUpdateIntervalMock.mockReset();
    loadDisplayModeMock.mockReset();
    loadGlobalShortcutMock.mockReset();
    loadMenubarIconStyleMock.mockReset();
    loadPluginSettingsMock.mockReset();
    loadResetTimerDisplayModeMock.mockReset();
    loadStartOnLoginMock.mockReset();
    loadTelemetryOptInMock.mockReset();
    loadThemeModeMock.mockReset();
    migrateLegacyTraySettingsMock.mockReset();
    migratePluginProfileInstancesEnabledMock.mockReset();
    normalizePluginSettingsMock.mockReset();
    savePluginSettingsMock.mockReset();
    loadLeaderboardHandleMock.mockReset();
    loadLeaderboardTokenMock.mockReset();
    loadLeaderboardWorkerUrlMock.mockReset();
    loadLeaderboardOptInMock.mockReset();
    loadLeaderboardShareListMock.mockReset();
    syncLeaderboardPrefsToPluginMock.mockReset();
    appDataDirMock.mockReset();

    isTauriMock.mockReturnValue(true);
    isAutostartEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue([
      {
        id: "codex",
        name: "Codex",
        iconUrl: "/codex.svg",
        brandColor: "#000000",
        lines: [],
        primaryCandidates: [],
      },
    ]);
    loadPluginSettingsMock.mockResolvedValue({ order: ["codex"], disabled: [] });
    normalizePluginSettingsMock.mockImplementation((stored) => stored);
    arePluginSettingsEqualMock.mockReturnValue(true);
    loadAutoUpdateIntervalMock.mockResolvedValue(15);
    loadThemeModeMock.mockResolvedValue("dark");
    loadDisplayModeMock.mockResolvedValue("used");
    loadResetTimerDisplayModeMock.mockResolvedValue("relative");
    loadGlobalShortcutMock.mockResolvedValue("CommandOrControl+Shift+O");
    loadMenubarIconStyleMock.mockResolvedValue("provider");
    loadStartOnLoginMock.mockResolvedValue(true);
    loadTelemetryOptInMock.mockResolvedValue(false);
    migrateLegacyTraySettingsMock.mockResolvedValue(undefined);
    migratePluginProfileInstancesEnabledMock.mockResolvedValue(undefined);
    savePluginSettingsMock.mockResolvedValue(undefined);
    getEnabledPluginIdsMock.mockReturnValue(["codex"]);
    loadLeaderboardHandleMock.mockResolvedValue(null);
    loadLeaderboardTokenMock.mockResolvedValue(null);
    loadLeaderboardWorkerUrlMock.mockResolvedValue(null);
    loadLeaderboardOptInMock.mockResolvedValue(false);
    loadLeaderboardShareListMock.mockResolvedValue([]);
    syncLeaderboardPrefsToPluginMock.mockResolvedValue(undefined);
    appDataDirMock.mockResolvedValue("/tmp/appdata");
  });

  it("disables autostart when applyStartOnLogin receives false", async () => {
    const args = createArgs();
    const { result } = renderHook(() => useSettingsBootstrap(args));

    await result.current.applyStartOnLogin(false);

    expect(disableAutostartMock).toHaveBeenCalledTimes(1);
    expect(enableAutostartMock).not.toHaveBeenCalled();
  });

  it("falls back to default reset timer mode when loading fails", async () => {
    const resetModeError = new Error("reset timer mode unavailable");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    loadResetTimerDisplayModeMock.mockRejectedValueOnce(resetModeError);
    const args = createArgs();

    renderHook(() => useSettingsBootstrap(args));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to load reset timer display mode:",
        resetModeError,
      );
      expect(args.setResetTimerDisplayMode).toHaveBeenCalledWith("relative");
    });

    errorSpy.mockRestore();
  });
});
