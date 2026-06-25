import { useShallow } from "zustand/react/shallow";
import { LeaderboardPage } from "@/pages/leaderboard";
import { OverviewPage } from "@/pages/overview";
import { ProviderDetailPage } from "@/pages/provider-detail";
import { SettingsPage } from "@/pages/settings";
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views";
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list";
import type { TraySettingsPreview } from "@/hooks/app/use-tray-icon";
import { useAppPreferencesStore } from "@/stores/app-preferences-store";
import { useAppUiStore } from "@/stores/app-ui-store";
import type {
  AutoUpdateIntervalMinutes,
  DisplayMode,
  GlobalShortcut,
  LeaderboardHandle,
  LeaderboardToken,
  LeaderboardWorkerUrl,
  MenubarIconStyle,
  ResetTimerDisplayMode,
  ThemeMode,
} from "@/lib/settings";
import { useCloudflareAISettings } from "@/hooks/use-cloudflare-ai-settings";

type AppContentDerivedProps = {
  displayPlugins: DisplayPluginState[];
  settingsPlugins: SettingsPluginState[];
  selectedPlugin: DisplayPluginState | null;
};

export type AppContentActionProps = {
  onRetryPlugin: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onToggle: (id: string) => void;
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void;
  onThemeModeChange: (mode: ThemeMode) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onResetTimerDisplayModeChange: (mode: ResetTimerDisplayMode) => void;
  onResetTimerDisplayModeToggle: () => void;
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void;
  traySettingsPreview: TraySettingsPreview;
  onGlobalShortcutChange: (value: GlobalShortcut) => void;
  onStartOnLoginChange: (value: boolean) => void;
  onTelemetryOptInChange: (value: boolean) => void;
  onAvatarChange: (pluginId: string, dataUrl: string | null) => void;
  // Leaderboard
  onLeaderboardHandleChange: (value: LeaderboardHandle) => void;
  onLeaderboardTokenChange: (value: LeaderboardToken) => void;
  onLeaderboardWorkerUrlChange: (value: LeaderboardWorkerUrl) => void;
  onLeaderboardOptInChange: (value: boolean) => void;
  onLeaderboardShareListChange: (value: string[]) => void;
};

export type AppContentProps = AppContentDerivedProps & AppContentActionProps;

export function AppContent({
  displayPlugins,
  settingsPlugins,
  selectedPlugin,
  onRetryPlugin,
  onReorder,
  onToggle,
  onAutoUpdateIntervalChange,
  onThemeModeChange,
  onDisplayModeChange,
  onResetTimerDisplayModeChange,
  onResetTimerDisplayModeToggle,
  onMenubarIconStyleChange,
  traySettingsPreview,
  onGlobalShortcutChange,
  onStartOnLoginChange,
  onTelemetryOptInChange,
  onAvatarChange,
  onLeaderboardHandleChange,
  onLeaderboardTokenChange,
  onLeaderboardWorkerUrlChange,
  onLeaderboardOptInChange,
  onLeaderboardShareListChange,
}: AppContentProps) {
  const { activeView } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
    })),
  );

  const {
    displayMode,
    resetTimerDisplayMode,
    menubarIconStyle,
    autoUpdateInterval,
    globalShortcut,
    themeMode,
    startOnLogin,
    telemetryOptIn,
    leaderboardHandle,
    leaderboardToken,
    leaderboardWorkerUrl,
    leaderboardOptIn,
    leaderboardShareList,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      displayMode: state.displayMode,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      menubarIconStyle: state.menubarIconStyle,
      autoUpdateInterval: state.autoUpdateInterval,
      globalShortcut: state.globalShortcut,
      themeMode: state.themeMode,
      startOnLogin: state.startOnLogin,
      telemetryOptIn: state.telemetryOptIn,
      leaderboardHandle: state.leaderboardHandle,
      leaderboardToken: state.leaderboardToken,
      leaderboardWorkerUrl: state.leaderboardWorkerUrl,
      leaderboardOptIn: state.leaderboardOptIn,
      leaderboardShareList: state.leaderboardShareList,
    })),
  );

  const { settings: cfAISettings, save: saveCfAISettings } = useCloudflareAISettings();

  if (activeView === "home") {
    return (
      <OverviewPage
        plugins={displayPlugins}
        onRetryPlugin={onRetryPlugin}
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
      />
    );
  }

  if (activeView === "settings") {
    return (
      <SettingsPage
        plugins={settingsPlugins}
        onReorder={onReorder}
        onToggle={onToggle}
        onAvatarChange={onAvatarChange}
        autoUpdateInterval={autoUpdateInterval}
        onAutoUpdateIntervalChange={onAutoUpdateIntervalChange}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
        displayMode={displayMode}
        onDisplayModeChange={onDisplayModeChange}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeChange={onResetTimerDisplayModeChange}
        menubarIconStyle={menubarIconStyle}
        onMenubarIconStyleChange={onMenubarIconStyleChange}
        traySettingsPreview={traySettingsPreview}
        globalShortcut={globalShortcut}
        onGlobalShortcutChange={onGlobalShortcutChange}
        startOnLogin={startOnLogin}
        onStartOnLoginChange={onStartOnLoginChange}
        telemetryOptIn={telemetryOptIn}
        onTelemetryOptInChange={onTelemetryOptInChange}
        leaderboardHandle={leaderboardHandle}
        leaderboardToken={leaderboardToken}
        leaderboardWorkerUrl={leaderboardWorkerUrl}
        leaderboardOptIn={leaderboardOptIn}
        leaderboardShareList={leaderboardShareList}
        onLeaderboardHandleChange={onLeaderboardHandleChange}
        onLeaderboardTokenChange={onLeaderboardTokenChange}
        onLeaderboardWorkerUrlChange={onLeaderboardWorkerUrlChange}
        onLeaderboardOptInChange={onLeaderboardOptInChange}
        onLeaderboardShareListChange={onLeaderboardShareListChange}
        cloudflareAIDisplay={cfAISettings.display}
        cloudflareAIShowLimit={cfAISettings.showLimit}
        cloudflareAICapOverride={cfAISettings.capOverride}
        cloudflareAIGatewayUrl={cfAISettings.gatewayUrl}
        cloudflareAIRouterKey={cfAISettings.routerKey}
        cloudflareAIWindow={cfAISettings.window}
        onCloudflareAIDisplayChange={(v) => saveCfAISettings({ ...cfAISettings, display: v })}
        onCloudflareAIShowLimitChange={(v) => saveCfAISettings({ ...cfAISettings, showLimit: v })}
        onCloudflareAICapOverrideChange={(v) =>
          saveCfAISettings({ ...cfAISettings, capOverride: v })
        }
        onCloudflareAIGatewayUrlChange={(v) => saveCfAISettings({ ...cfAISettings, gatewayUrl: v })}
        onCloudflareAIRouterKeyChange={(v) => saveCfAISettings({ ...cfAISettings, routerKey: v })}
        onCloudflareAIWindowChange={(v) => saveCfAISettings({ ...cfAISettings, window: v })}
      />
    );
  }

  if (activeView === "leaderboard") {
    return <LeaderboardPage />;
  }

  const handleRetry = selectedPlugin
    ? () => onRetryPlugin(selectedPlugin.meta.id)
    : /* v8 ignore next */ undefined;

  return (
    <ProviderDetailPage
      plugin={selectedPlugin}
      onRetry={handleRetry}
      displayMode={displayMode}
      resetTimerDisplayMode={resetTimerDisplayMode}
      onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
    />
  );
}
