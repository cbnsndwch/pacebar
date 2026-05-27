import { create } from "zustand"
import {
  DEFAULT_AUTO_UPDATE_INTERVAL,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_THEME_MODE,
  DEFAULT_LEADERBOARD_HANDLE,
  DEFAULT_LEADERBOARD_TOKEN,
  DEFAULT_LEADERBOARD_WORKER_URL,
  DEFAULT_LEADERBOARD_OPT_IN,
  DEFAULT_LEADERBOARD_SHARE_LIST,
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type ResetTimerDisplayMode,
  type ThemeMode,
  type LeaderboardHandle,
  type LeaderboardToken,
  type LeaderboardWorkerUrl,
} from "@/lib/settings"

type AppPreferencesStore = {
  autoUpdateInterval: AutoUpdateIntervalMinutes
  themeMode: ThemeMode
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  globalShortcut: GlobalShortcut
  startOnLogin: boolean
  menubarIconStyle: MenubarIconStyle
  // Leaderboard
  leaderboardHandle:    LeaderboardHandle
  leaderboardToken:     LeaderboardToken
  leaderboardWorkerUrl: LeaderboardWorkerUrl
  leaderboardOptIn:     boolean
  leaderboardShareList: string[]
  setAutoUpdateInterval: (value: AutoUpdateIntervalMinutes) => void
  setThemeMode: (value: ThemeMode) => void
  setDisplayMode: (value: DisplayMode) => void
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setGlobalShortcut: (value: GlobalShortcut) => void
  setStartOnLogin: (value: boolean) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setLeaderboardHandle:    (value: LeaderboardHandle)    => void
  setLeaderboardToken:     (value: LeaderboardToken)     => void
  setLeaderboardWorkerUrl: (value: LeaderboardWorkerUrl) => void
  setLeaderboardOptIn:     (value: boolean)              => void
  setLeaderboardShareList: (value: string[])             => void
  resetState: () => void
}

const initialState = {
  autoUpdateInterval: DEFAULT_AUTO_UPDATE_INTERVAL,
  themeMode: DEFAULT_THEME_MODE,
  displayMode: DEFAULT_DISPLAY_MODE,
  resetTimerDisplayMode: DEFAULT_RESET_TIMER_DISPLAY_MODE,
  globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
  startOnLogin: DEFAULT_START_ON_LOGIN,
  menubarIconStyle: DEFAULT_MENUBAR_ICON_STYLE,
  leaderboardHandle:    DEFAULT_LEADERBOARD_HANDLE,
  leaderboardToken:     DEFAULT_LEADERBOARD_TOKEN,
  leaderboardWorkerUrl: DEFAULT_LEADERBOARD_WORKER_URL,
  leaderboardOptIn:     DEFAULT_LEADERBOARD_OPT_IN,
  leaderboardShareList: DEFAULT_LEADERBOARD_SHARE_LIST,
}

export const useAppPreferencesStore = create<AppPreferencesStore>((set) => ({
  ...initialState,
  setAutoUpdateInterval:   (value) => set({ autoUpdateInterval: value }),
  setThemeMode:            (value) => set({ themeMode: value }),
  setDisplayMode:          (value) => set({ displayMode: value }),
  setResetTimerDisplayMode:(value) => set({ resetTimerDisplayMode: value }),
  setGlobalShortcut:       (value) => set({ globalShortcut: value }),
  setStartOnLogin:         (value) => set({ startOnLogin: value }),
  setMenubarIconStyle:     (value) => set({ menubarIconStyle: value }),
  setLeaderboardHandle:    (value) => set({ leaderboardHandle: value }),
  setLeaderboardToken:     (value) => set({ leaderboardToken: value }),
  setLeaderboardWorkerUrl: (value) => set({ leaderboardWorkerUrl: value }),
  setLeaderboardOptIn:     (value) => set({ leaderboardOptIn: value }),
  setLeaderboardShareList: (value) => set({ leaderboardShareList: value }),
  resetState: () => set(initialState),
}))
