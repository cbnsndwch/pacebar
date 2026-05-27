import { cn } from "@/lib/utils"
import type { LeaderboardEntry, LeaderboardMetric } from "@/lib/leaderboard-api"

function rankBadge(rank: number): string {
  if (rank === 1) return "🥇"
  if (rank === 2) return "🥈"
  if (rank === 3) return "🥉"
  return `#${rank}`
}

function formatTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B"
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return String(n)
}

function formatValue(entry: LeaderboardEntry, metric: LeaderboardMetric): string {
  switch (metric) {
    case "tokens":    return `${formatTokens(entry.tokens_used)} tokens`
    case "dollars":   return `$${entry.dollars_spent.toFixed(2)}`
    case "providers": return `${entry.providers_active} provider${entry.providers_active !== 1 ? "s" : ""}`
    case "score":     return `${entry.score.toFixed(0)} pts`
  }
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  handle:  string | null
  metric:  LeaderboardMetric
}

export function LeaderboardTable({ entries, handle, metric }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No entries yet — be the first to report!
      </p>
    )
  }

  return (
    <div className="space-y-0.5">
      {entries.map((entry) => {
        const isMe = handle != null && entry.handle === handle
        return (
          <div
            key={entry.handle}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm",
              isMe
                ? "bg-primary/10 ring-1 ring-primary font-medium"
                : "hover:bg-muted/50"
            )}
          >
            <span className="w-7 shrink-0 text-center tabular-nums">
              {rankBadge(entry.rank)}
            </span>
            <span className="flex-1 truncate">{entry.handle}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatValue(entry, metric)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
