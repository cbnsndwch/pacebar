import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { useNowTicker } from "@/hooks/use-now-ticker";
import {
  fetchCurrentHacknight,
  fetchLeaderboard,
  fetchModelLeaderboard,
  type HacknightCurrentResponse,
  type LeaderboardEntry,
  type LeaderboardGroupBy,
  type LeaderboardMetric,
  type LeaderboardWindow,
  type ModelLeaderboardEntry,
} from "@/lib/leaderboard-api";
import { cn } from "@/lib/utils";
import { ErrorReport } from "@/components/error-report";
import { useAppPreferencesStore } from "@/stores/app-preferences-store";

const WINDOW_OPTIONS: { value: LeaderboardWindow; label: string }[] = [
  { value: "hacknight", label: "Hack Night" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const METRIC_OPTIONS: { value: LeaderboardMetric; label: string }[] = [
  { value: "tokens", label: "Tokens" },
  { value: "dollars", label: "Dollars" },
  { value: "providers", label: "Providers" },
  { value: "score", label: "Score" },
];

const MODEL_METRIC_OPTIONS: { value: LeaderboardMetric; label: string }[] = [
  { value: "tokens", label: "Tokens" },
  { value: "dollars", label: "Dollars" },
];

const GROUP_OPTIONS: { value: LeaderboardGroupBy; label: string }[] = [
  { value: "users", label: "People" },
  { value: "model", label: "Models" },
];

const REFRESH_INTERVAL_MS = 60_000;
// While no session is live, poll less often just to notice one starting.
const IDLE_REFRESH_INTERVAL_MS = 5 * 60_000;

function formatTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function rankBadge(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function ModelLeaderboardTable({
  entries,
  metric,
}: {
  entries: ModelLeaderboardEntry[];
  metric: LeaderboardMetric;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No model entries yet — be the first to report!
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {entries.map((entry) => {
        const value =
          metric === "dollars"
            ? `$${entry.dollars_spent.toFixed(2)}`
            : `${formatTokens(entry.tokens_used)} tokens`;
        const topLabel = entry.top_handle
          ? `${entry.top_handle} · ${formatTokens(entry.top_tokens)}t`
          : "—";
        return (
          <div
            key={entry.model_key}
            className="flex flex-col gap-0.5 px-3 py-2 rounded-md text-sm hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <span className="w-7 shrink-0 text-center tabular-nums">{rankBadge(entry.rank)}</span>
              <span className="flex-1 truncate font-medium">
                {entry.model_name ?? entry.model_id}
              </span>
              <span className="tabular-nums text-muted-foreground">{value}</span>
            </div>
            <div className="flex items-center pl-10 text-xs text-muted-foreground">
              <span className="flex-1 truncate">Top: {topLabel}</span>
              <span className="tabular-nums">
                {entry.users} user{entry.users !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LeaderboardPage() {
  const { leaderboardWorkerUrl, leaderboardToken, leaderboardHandle, leaderboardOptIn } =
    useAppPreferencesStore(
      useShallow((state) => ({
        leaderboardWorkerUrl: state.leaderboardWorkerUrl,
        leaderboardToken: state.leaderboardToken,
        leaderboardHandle: state.leaderboardHandle,
        leaderboardOptIn: state.leaderboardOptIn,
      })),
    );

  const [selectedWindow, setSelectedWindow] = useState<LeaderboardWindow>("hacknight");
  const [selectedMetric, setSelectedMetric] = useState<LeaderboardMetric>("tokens");
  const [selectedGroupBy, setSelectedGroupBy] = useState<LeaderboardGroupBy>("users");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [modelEntries, setModelEntries] = useState<ModelLeaderboardEntry[]>([]);
  const [hacknight, setHacknight] = useState<HacknightCurrentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether a session is live comes from the published calendar (the worker's
  // /hacknight/current), not a local clock. Refresh quickly during a session,
  // slowly otherwise so a session starting is still picked up while open.
  const inSession = hacknight?.active ?? false;
  const tick = useNowTicker({
    enabled: true,
    intervalMs: inSession ? REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS,
  });

  // Model leaderboards only make sense for hack night windows right now.
  const effectiveGroupBy = selectedWindow === "hacknight" ? selectedGroupBy : "users";

  // Also track when the user changes the window/metric/group tabs
  const fetchKey = `${selectedWindow}:${selectedMetric}:${effectiveGroupBy}:${tick}`;
  const fetchKeyRef = useRef(fetchKey);
  fetchKeyRef.current = fetchKey;

  useEffect(() => {
    if (!leaderboardWorkerUrl) return;
    if (!leaderboardOptIn) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const [hn, lb] = await Promise.all([
          fetchCurrentHacknight(leaderboardWorkerUrl, leaderboardToken),
          effectiveGroupBy === "model"
            ? fetchModelLeaderboard(
                leaderboardWorkerUrl,
                leaderboardToken,
                selectedWindow,
                selectedMetric,
                selectedWindow === "hacknight" ? undefined : undefined,
              )
            : fetchLeaderboard(
                leaderboardWorkerUrl,
                leaderboardToken,
                selectedWindow,
                selectedMetric,
                selectedWindow === "hacknight" ? undefined : undefined,
                "users",
              ),
        ]);
        if (cancelled) return;
        setHacknight(hn);
        if (effectiveGroupBy === "model") {
          setModelEntries((lb as { entries: ModelLeaderboardEntry[] }).entries);
          setEntries([]);
        } else {
          setEntries((lb as { entries: LeaderboardEntry[] }).entries);
          setModelEntries([]);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardWorkerUrl, leaderboardToken, leaderboardOptIn, fetchKey]);

  // If the model view is active with an unsupported metric, fall back to tokens.
  useEffect(() => {
    if (
      effectiveGroupBy === "model" &&
      selectedMetric !== "tokens" &&
      selectedMetric !== "dollars"
    ) {
      setSelectedMetric("tokens");
    }
  }, [effectiveGroupBy, selectedMetric]);

  // ── Early-exit states ──────────────────────────────────────────────────────

  if (!leaderboardWorkerUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-12 px-4 text-center">
        <Trophy className="size-10 text-muted-foreground" />
        <p className="text-sm font-medium">Not configured</p>
        <p className="text-xs text-muted-foreground">
          Open Settings → Leaderboard to add your display name,
          <br />
          worker URL, and invite token.
        </p>
      </div>
    );
  }

  if (!leaderboardOptIn) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-12 px-4 text-center">
        <Trophy className="size-10 text-muted-foreground" />
        <p className="text-sm font-medium">Participation off</p>
        <p className="text-xs text-muted-foreground">
          Enable "Share my usage during hack nights" in
          <br />
          Settings → Leaderboard to join the rankings.
        </p>
      </div>
    );
  }

  // ── Hack night header ──────────────────────────────────────────────────────

  function renderHeader() {
    if (!hacknight) return null;
    if (!hacknight.active || !hacknight.hacknight) {
      const upcoming = hacknight.upcoming ?? [];
      const dateFmt = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
      return (
        <div className="px-1 pb-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">
              {upcoming.length > 0 ? "Upcoming sessions" : "No session active"}
            </span>
          </div>
          {upcoming.length > 0 && (
            <ul className="space-y-1 pl-6">
              {upcoming.map((s) => {
                const start = new Date(s.starts_at);
                return (
                  <li key={s.number} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium truncate">Hack Night #{s.number}</span>
                      {s.is_special && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-1 py-px rounded-full font-medium shrink-0">
                          Special 🏆
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {dateFmt.format(start)} · {timeFmt.format(start)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      );
    }
    const hn = hacknight.hacknight;
    const start = new Date(hn.starts_at);
    const end = new Date(hn.ends_at);
    const fmt = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
    return (
      <div className="px-1 pb-2">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-amber-500 shrink-0" />
          <span className="text-sm font-semibold">Hack Night #{hn.number}</span>
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
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────

  return (
    <div className="py-3 space-y-3">
      {renderHeader()}

      {/* Window tabs */}
      <div className="bg-muted/50 rounded-lg p-1">
        <div className="flex gap-1" role="radiogroup" aria-label="Leaderboard window">
          {WINDOW_OPTIONS.map((opt) => {
            const isActive = opt.value === selectedWindow;
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
            );
          })}
        </div>
      </div>

      {/* Metric tabs */}
      <div className="bg-muted/50 rounded-lg p-1">
        <div className="flex gap-1" role="radiogroup" aria-label="Leaderboard metric">
          {(effectiveGroupBy === "model" ? MODEL_METRIC_OPTIONS : METRIC_OPTIONS).map((opt) => {
            const isActive = opt.value === selectedMetric;
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
            );
          })}
        </div>
      </div>

      {/* Group tabs (People vs Models) — only for hack night */}
      {selectedWindow === "hacknight" && (
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Leaderboard group">
            {GROUP_OPTIONS.map((opt) => {
              const isActive = opt.value === selectedGroupBy;
              return (
                <Button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setSelectedGroupBy(opt.value)}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {error ? (
        <ErrorReport
          context={{
            feature: "leaderboard",
            error,
            details: {
              workerUrl: leaderboardWorkerUrl,
              window: selectedWindow,
              metric: selectedMetric,
              groupBy: effectiveGroupBy,
              optIn: leaderboardOptIn,
            },
          }}
        />
      ) : loading && entries.length === 0 && modelEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
      ) : entries.length === 0 && modelEntries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
          <Trophy className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">No rankings yet</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This board ranks AI-coding usage among hello_miami builders. While participation is on,
            your usage is shared automatically during Hack Nights (Tuesday &amp; Thursday evenings,
            ET).{" "}
            {inSession
              ? "A session is live — be the first on the board!"
              : "Check back during the next Hack Night to compete."}
          </p>
        </div>
      ) : effectiveGroupBy === "model" ? (
        <ModelLeaderboardTable entries={modelEntries} metric={selectedMetric} />
      ) : (
        <LeaderboardTable entries={entries} handle={leaderboardHandle} metric={selectedMetric} />
      )}

      {/* Last-refresh indicator */}
      {!loading && entries.length > 0 && (
        <p className={cn("text-xs text-muted-foreground text-right px-1", loading && "opacity-50")}>
          {inSession ? "Auto-refreshes every minute" : "Outside session window"}
        </p>
      )}
    </div>
  );
}
