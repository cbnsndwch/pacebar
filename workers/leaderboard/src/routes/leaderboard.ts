import type { D1Database } from "@cloudflare/workers-types"

import { getLeaderboard, type LeaderboardMetric } from "../lib/db"
import { dailyWindow, weeklyWindow, monthlyWindow, } from "../lib/windows"

const VALID_METRICS: LeaderboardMetric[] = ["tokens", "dollars", "providers", "score"]

function parseMetric(raw: string | null): LeaderboardMetric {
    if (raw && (VALID_METRICS as string[]).includes(raw)) return raw as LeaderboardMetric
    return "tokens"
}

export async function handleLeaderboard(req: Request, db: D1Database): Promise<Response> {
    const url = new URL(req.url)
    const window = url.searchParams.get("window") ?? "hacknight"
    const metric = parseMetric(url.searchParams.get("metric"))
    const nowMs = Date.now()

    let windowKey: string

    switch (window) {
        case "daily":
            windowKey = dailyWindow(nowMs).key
            break
        case "weekly":
            windowKey = weeklyWindow(nowMs).key
            break
        case "monthly":
            windowKey = monthlyWindow(nowMs).key
            break
        case "hacknight": {
            const n = url.searchParams.get("n")
            if (n) {
                windowKey = `hn-${n}`
            } else {
                // Default: latest hack night that has any reports
                const latest = await db
                    .prepare(`
            SELECT window_key FROM reports
            WHERE window_type = 'hacknight'
            ORDER BY submitted_at DESC LIMIT 1
          `)
                    .first<{ window_key: string }>()
                windowKey = latest?.window_key ?? `hn-0`
            }
            break
        }
        default:
            return jsonError(`unknown window: ${window}`, 400)
    }

    const entries = await getLeaderboard(db, windowKey, metric)

    return json({
        windowKey,
        window,
        metric,
        entries,
        fetchedAt: new Date().toISOString(),
    })
}

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
}

function jsonError(message: string, status: number): Response {
    return json({ error: message }, status)
}
