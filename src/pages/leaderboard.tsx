import { useEffect, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LeaderboardTable } from "@/components/leaderboard-table"
import { useNowTicker } from "@/hooks/use-now-ticker"
import {
  fetchCurrentHacknight,
  fetchLeaderboard,
  type HacknightCurrentResponse,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardWindow,
} from "@/lib/leaderboard-api"
import { isInHacknightWindow } from "@/lib/hacknight-windows"
import { cn } from "@/lib/utils"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const WINDOW_OPTIONS: { value: LeaderboardWindow; label: string }[] = [
  { value: "hacknight", label: "Hack Night" },
  { value: "daily",     label: "Daily" },
  { value: "weekly",    label: "Weekly" },
  { value: "monthly",   label: "Monthly" },
]

const METRIC_OPTIONS: { value: LeaderboardMetric; label: string }[] = [
  { value: "tokens",    label: "Tokens" },
  { value: "dollars",   label: "Dollars" },
  { value: "providers", label: "Providers" },
  { value: "score",     label: "Score" },
]

const REFRESH_INTERVAL_MS = 60_000

export function LeaderboardPage() {
  const { leaderboardWorkerUrl, leaderboardToken, leaderboardHandle, leaderboardOptIn } =
    useAppPreferencesStore(
      useShallow((state) => ({
        leaderboardWorkerUrl: state.leaderboardWorkerUrl,
        leaderboardToken:     state.leaderboardToken,
        leaderboardHandle:    state.leaderboardHandle,
        leaderboardOptIn:     state.leaderboardOptIn,
      }))
    )

  const [selectedWindow, setSelectedWindow] = useState<LeaderboardWindow>("hacknight")
  const [selectedMetric, setSelectedMetric]   = useState<LeaderboardMetric>("tokens")
  const [entries,  setEntries]   = useState<LeaderboardEntry[]>([])
  const [hacknight, setHacknight] = useState<HacknightCurrentResponse | null>(null)
  const [loading,  setLoading]   = useState(false)
  const [error,    setError]     = useState<string | null>(null)

  // Tick every 60s when a hack night is active so the display stays fresh
  const inSession = isInHacknightWindow()
  const tick = useNowTicker({ enabled: inSession, intervalMs: REFRESH_INTERVAL_MS })

  // Also track when the user changes the window/metric tabs
  const fetchKey = `${selectedWindow}:${selectedMetric}:${tick}`
  const fetchKeyRef = useRef(fetchKey)
  fetchKeyRef.current = fetchKey

  useEffect(() => {
    if (!leaderboardWorkerUrl) return
    if (!leaderboardOptIn)     return

    let cancelled = false
    setLoading(true)
    setError(null)

    const run = async () => {
      try {
        const [hn, lb] = await Promise.all([
          fetchCurrentHacknight(leaderboardWorkerUrl, leaderboardToken),
          fetchLeaderboard(
            leaderboardWorkerUrl,
            leaderboardToken,
            selectedWindow,
            selectedMetric,
            // Pass the active hack night number when viewing hack night window
            selectedWindow === "hacknight" ? undefined : undefined
          ),
        ])
        if (cancelled) return
        setHacknight(hn)
        setEntries(lb.entries)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load leaderboard")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardWorkerUrl, leaderboardToken, leaderboardOptIn, fetchKey])

  // ── Early-exit states ──────────────────────────────────────────────────────

  if (!leaderboardWorkerUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-12 px-4 text-center">
        <Trophy className="size-10 text-muted-foreground" />
        <p className="text-sm font-medium">Not configured</p>
        <p className="text-xs text-muted-foreground">
          Open Settings → Leaderboard to add your display name,<br />
          worker URL, and invite token.
        </p>
      </div>
    )
  }

  if (!leaderboardOptIn) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-12 px-4 text-center">
        <Trophy className="size-10 text-muted-foreground" />
        <p className="text-sm font-medium">Participation off</p>
        <p className="text-xs text-muted-foreground">
          Enable "Share my usage during hack nights" in<br />
          Settings → Leaderboard to join the rankings.
        </p>
      </div>
    )
  }

  // ── Hack night header ──────────────────────────────────────────────────────

  function renderHeader() {
    if (!hacknight) return null
    if (!hacknight.active || !hacknight.hacknight) {
      const next = hacknight.upcoming
      return (
        <div className="flex items-center gap-2 px-1 pb-2">
          <Trophy className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">
            {next ? `Next: Hack Night #${next.number}` : "No session active"}
          </span>
        </div>
      )
    }
    const hn = hacknight.hacknight
    const start = new Date(hn.starts_at)
    const end   = new Date(hn.ends_at)
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" })
    const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
    return (
      <div className="px-1 pb-2">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-amber-500 shrink-0" />
          <span className="text-sm font-semibold">
            Hack Night #{hn.number}
          </span>
          {hn.is_special && (
            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
              Special Edition 🏆
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {fmt.format(start)} · {timeFmt.format(start)} – {timeFmt.format(end)}
        </p>
      </div>
    )
  }

  // ── Main view ──────────────────────────────────────────────────────────────

  return (
    <div className="py-3 space-y-3">
      {renderHeader()}

      {/* Window tabs */}
      <div className="bg-muted/50 rounded-lg p-1">
        <div className="flex gap-1" role="radiogroup" aria-label="Leaderboard window">
          {WINDOW_OPTIONS.map((opt) => {
            const isActive = opt.value === selectedWindow
            return (
              <Button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setSelectedWindow(opt.value)}
              >
                {opt.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Metric tabs */}
      <div className="bg-muted/50 rounded-lg p-1">
        <div className="flex gap-1" role="radiogroup" aria-label="Leaderboard metric">
          {METRIC_OPTIONS.map((opt) => {
            const isActive = opt.value === selectedMetric
            return (
              <Button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setSelectedMetric(opt.value)}
              >
                {opt.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Results */}
      {error ? (
        <p className="text-xs text-destructive px-1">{error}</p>
      ) : loading && entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
      ) : (
        <LeaderboardTable
          entries={entries}
          handle={leaderboardHandle}
          metric={selectedMetric}
        />
      )}

      {/* Last-refresh indicator */}
      {!loading && entries.length > 0 && (
        <p className={cn("text-xs text-muted-foreground text-right px-1", loading && "opacity-50")}>
          {inSession ? "Auto-refreshes every minute" : "Outside session window"}
        </p>
      )}
    </div>
  )
}
