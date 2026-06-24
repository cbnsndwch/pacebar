import type { D1Database } from "@cloudflare/workers-types";

import {
  getHacknightForTime,
  getUpcomingHacknights,
  listHacknights,
  getHacknightByNumber,
  getHacknightWinners,
} from "../lib/db";

export async function handleHacknightCurrent(_req: Request, db: D1Database): Promise<Response> {
  const now = new Date().toISOString();

  // A session is active iff `now` falls within a published event's window.
  const current = await getHacknightForTime(db, now);
  if (current) {
    return json({ active: true, hacknight: current });
  }

  // Otherwise return the upcoming published sessions (soonest first).
  const upcoming = await getUpcomingHacknights(db, now, 5);
  return json({ active: false, upcoming });
}

export async function handleHacknightList(_req: Request, db: D1Database): Promise<Response> {
  const list = await listHacknights(db);
  return json({ hacknights: list });
}

export async function handleHacknightByNumber(
  _req: Request,
  db: D1Database,
  number: number,
): Promise<Response> {
  const hn = await getHacknightByNumber(db, number);
  if (!hn) return jsonError("not found", 404);
  return json(hn);
}

export async function handleHacknightWinners(
  _req: Request,
  db: D1Database,
  number: number,
): Promise<Response> {
  const hn = await getHacknightByNumber(db, number);
  if (!hn) return jsonError("not found", 404);
  const winners = await getHacknightWinners(db, hn.id);
  return json({ hacknight: hn, winners });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function jsonError(message: string, status: number): Response {
  return json({ error: message }, status);
}
