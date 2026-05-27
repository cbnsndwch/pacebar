import { useCallback } from "react"
import { appDataDir } from "@tauri-apps/api/path"
import {
  saveLeaderboardHandle,
  saveLeaderboardToken,
  saveLeaderboardWorkerUrl,
  saveLeaderboardOptIn,
  saveLeaderboardShareList,
  syncLeaderboardPrefsToPlugin,
  type LeaderboardHandle,
  type LeaderboardToken,
  type LeaderboardWorkerUrl,
} from "@/lib/settings"

type UseSettingsLeaderboardActionsArgs = {
  leaderboardHandle:    LeaderboardHandle
  leaderboardToken:     LeaderboardToken
  leaderboardWorkerUrl: LeaderboardWorkerUrl
  leaderboardOptIn:     boolean
  leaderboardShareList: string[]
  setLeaderboardHandle:    (value: LeaderboardHandle)    => void
  setLeaderboardToken:     (value: LeaderboardToken)     => void
  setLeaderboardWorkerUrl: (value: LeaderboardWorkerUrl) => void
  setLeaderboardOptIn:     (value: boolean)              => void
  setLeaderboardShareList: (value: string[])             => void
}

async function sync(prefs: {
  handle:    LeaderboardHandle
  token:     LeaderboardToken
  workerUrl: LeaderboardWorkerUrl
  optIn:     boolean
  shareList: string[]
}): Promise<void> {
  try {
    const dir = await appDataDir()
    await syncLeaderboardPrefsToPlugin(dir, prefs)
  } catch (err) {
    console.error("Failed to sync leaderboard prefs to plugin:", err)
  }
}

export function useSettingsLeaderboardActions({
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
}: UseSettingsLeaderboardActionsArgs) {
  const handleLeaderboardHandleChange = useCallback(
    (value: LeaderboardHandle) => {
      setLeaderboardHandle(value)
      void saveLeaderboardHandle(value).catch((err) =>
        console.error("Failed to save leaderboard handle:", err)
      )
      void sync({
        handle:    value,
        token:     leaderboardToken,
        workerUrl: leaderboardWorkerUrl,
        optIn:     leaderboardOptIn,
        shareList: leaderboardShareList,
      })
    },
    [leaderboardToken, leaderboardWorkerUrl, leaderboardOptIn, leaderboardShareList, setLeaderboardHandle]
  )

  const handleLeaderboardTokenChange = useCallback(
    (value: LeaderboardToken) => {
      setLeaderboardToken(value)
      void saveLeaderboardToken(value).catch((err) =>
        console.error("Failed to save leaderboard token:", err)
      )
      void sync({
        handle:    leaderboardHandle,
        token:     value,
        workerUrl: leaderboardWorkerUrl,
        optIn:     leaderboardOptIn,
        shareList: leaderboardShareList,
      })
    },
    [leaderboardHandle, leaderboardWorkerUrl, leaderboardOptIn, leaderboardShareList, setLeaderboardToken]
  )

  const handleLeaderboardWorkerUrlChange = useCallback(
    (value: LeaderboardWorkerUrl) => {
      setLeaderboardWorkerUrl(value)
      void saveLeaderboardWorkerUrl(value).catch((err) =>
        console.error("Failed to save leaderboard worker URL:", err)
      )
      void sync({
        handle:    leaderboardHandle,
        token:     leaderboardToken,
        workerUrl: value,
        optIn:     leaderboardOptIn,
        shareList: leaderboardShareList,
      })
    },
    [leaderboardHandle, leaderboardToken, leaderboardOptIn, leaderboardShareList, setLeaderboardWorkerUrl]
  )

  const handleLeaderboardOptInChange = useCallback(
    (value: boolean) => {
      setLeaderboardOptIn(value)
      void saveLeaderboardOptIn(value).catch((err) =>
        console.error("Failed to save leaderboard opt-in:", err)
      )
      void sync({
        handle:    leaderboardHandle,
        token:     leaderboardToken,
        workerUrl: leaderboardWorkerUrl,
        optIn:     value,
        shareList: leaderboardShareList,
      })
    },
    [leaderboardHandle, leaderboardToken, leaderboardWorkerUrl, leaderboardShareList, setLeaderboardOptIn]
  )

  const handleLeaderboardShareListChange = useCallback(
    (value: string[]) => {
      setLeaderboardShareList(value)
      void saveLeaderboardShareList(value).catch((err) =>
        console.error("Failed to save leaderboard share list:", err)
      )
      void sync({
        handle:    leaderboardHandle,
        token:     leaderboardToken,
        workerUrl: leaderboardWorkerUrl,
        optIn:     leaderboardOptIn,
        shareList: value,
      })
    },
    [leaderboardHandle, leaderboardToken, leaderboardWorkerUrl, leaderboardOptIn, setLeaderboardShareList]
  )

  return {
    handleLeaderboardHandleChange,
    handleLeaderboardTokenChange,
    handleLeaderboardWorkerUrlChange,
    handleLeaderboardOptInChange,
    handleLeaderboardShareListChange,
  }
}
