import type { D1Database } from "@cloudflare/workers-types"
import { getHacknightForTime, listHacknights, getHacknightByNumber } from "../lib/db"
import { hacknightWindowKey } from "../lib/windows"

export async function handleHacknightCurrent(_req: Request, db: D1Database): Promise<Response> {
  const now = new Date().toISOString()
  const slot = hacknightWindowKey(Date.now())

  if (!slot) {
    // Not in a hack night window right now — return next upcoming one
    const upcoming = await db
      .prepare("SELECT * FROM hacknights WHERE starts_at > ? ORDER BY starts_at ASC LIMIT 1")
      .bind(now)
      .first()
    return json({ active: false, upcoming: upcoming ?? null })
  }

  const current = await getHacknightForTime(db, now)
  return json({ active: true, slot, hacknight: current ?? null })
}

export async function handleHacknightList(_req: Request, db: D1Database): Promise<Response> {
  const list = await listHacknights(db)
  return json({ hacknights: list })
}

export async function handleHacknightByNumber(
  _req: Request,
  db: D1Database,
  number: number
): Promise<Response> {
  const hn = await getHacknightByNumber(db, number)
  if (!hn) return jsonError("not found", 404)
  return json(hn)
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
