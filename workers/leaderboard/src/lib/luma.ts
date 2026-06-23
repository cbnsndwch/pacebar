/**
 * Fetch and parse the Luma iCal feed to extract hack night events.
 *
 * Expected event title patterns (case-insensitive):
 *   "Hello Miami Hack Night #42"
 *   "Hello Miami Hack Night #42: Special Edition"
 *   "Hello Miami Hack Night #42 - Special Edition"
 */

export interface ParsedHacknight {
  number: number;
  title: string;
  is_special: boolean;
  starts_at: string; // ISO 8601
  ends_at: string; // ISO 8601
}

// ─── iCal minimal parser ─────────────────────────────────────────────────────

function unfold(raw: string): string {
  // RFC 5545 line folding: CRLF + whitespace = continuation
  return raw.replace(/\r?\n[ \t]/g, "");
}

function icalToIso(value: string): string {
  // DTSTART / DTEND can be:
  //   20260521T183000Z      (UTC)
  //   20260521T183000       (floating — treat as UTC)
  //   20260521              (date-only — midnight UTC)

  // strip params like TZID=...
  const clean = value.replace(/^[A-Z;=a-z0-9_-]+:/, "");

  if (clean.length === 8) {
    // date-only
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00Z`;
  }

  const y = clean.slice(0, 4);
  const mo = clean.slice(4, 6);
  const d = clean.slice(6, 8);
  const h = clean.slice(9, 11);
  const mi = clean.slice(11, 13);
  const s = clean.slice(13, 15);
  const tz = clean.endsWith("Z") ? "Z" : "Z";
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${tz}`;
}

export function parseIcal(raw: string): ParsedHacknight[] {
  const unfolded = unfold(raw);
  const results: ParsedHacknight[] = [];

  // Split on VEVENT boundaries
  const eventBlocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);

  for (const block of eventBlocks) {
    const end = block.indexOf("END:VEVENT");
    const body = end >= 0 ? block.slice(0, end) : block;

    const lines: Record<string, string> = {};
    for (const line of body.split(/\r?\n/)) {
      const sep = line.indexOf(":");
      if (sep < 0) continue;
      const key = line.slice(0, sep).split(";")[0].toUpperCase();
      lines[key] = line.slice(sep + 1).trim();
    }

    const summary = lines["SUMMARY"] ?? "";
    const dtstart = lines["DTSTART"] ?? "";
    const dtend = lines["DTEND"] ?? "";

    if (!summary || !dtstart) continue;

    // Extract hack night number
    const numMatch = summary.match(/hack\s+night\s+#(\d+)/i);
    if (!numMatch) continue;

    const number = parseInt(numMatch[1], 10);
    const isSpecial = /special/i.test(summary);

    results.push({
      number,
      title: summary,
      is_special: isSpecial,
      starts_at: dtstart ? icalToIso(dtstart) : "",
      ends_at: dtend ? icalToIso(dtend) : "",
    });
  }

  return results;
}

// ─── Fetch from Luma ─────────────────────────────────────────────────────────

const DEFAULT_ICAL_URL = "https://api.lu.ma/ical/v1/calendar/hello_miami";

export async function fetchLumaHacknights(icalUrl = DEFAULT_ICAL_URL): Promise<ParsedHacknight[]> {
  const resp = await fetch(icalUrl, {
    headers: { "User-Agent": "PaceBar-Leaderboard/1.0" },
  });
  if (!resp.ok) {
    throw new Error(`Luma iCal fetch failed: ${resp.status} ${resp.statusText}`);
  }
  const raw = await resp.text();
  return parseIcal(raw);
}
