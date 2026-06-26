import type { PluginMeta, PluginOutput } from "@/lib/plugin-types";
import type { PluginSettings } from "@/lib/settings";
import { DEFAULT_DISPLAY_MODE, type DisplayMode } from "@/lib/settings";
import { clamp01 } from "@/lib/utils";

type PluginState = {
  data: PluginOutput | null;
  loading: boolean;
  error: string | null;
};

export type TrayPrimaryBar = {
  id: string;
  fraction?: number;
  /** Verbatim menu-bar text for capless count metrics (e.g. "1.2M"). Overrides percent. */
  text?: string;
};

/** Abbreviate a count for the menu bar: 1234567 -> "1.2M". */
export function formatTrayCountText(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

type ProgressLine = Extract<
  PluginOutput["lines"][number],
  { type: "progress"; label: string; used: number; limit: number }
>;

function isProgressLine(line: PluginOutput["lines"][number]): line is ProgressLine {
  return line.type === "progress";
}

export function getTrayPrimaryBars(args: {
  pluginsMeta: PluginMeta[];
  pluginSettings: PluginSettings | null;
  pluginStates: Record<string, PluginState | undefined>;
  maxBars?: number;
  displayMode?: DisplayMode;
  pluginId?: string;
}): TrayPrimaryBar[] {
  const {
    pluginsMeta,
    pluginSettings,
    pluginStates,
    maxBars = 4,
    displayMode = DEFAULT_DISPLAY_MODE,
    pluginId,
  } = args;
  if (!pluginSettings) return [];

  const metaById = new Map(pluginsMeta.map((p) => [p.id, p]));
  const disabled = new Set(pluginSettings.disabled);
  const orderedIds = pluginId ? [pluginId] : pluginSettings.order;

  const out: TrayPrimaryBar[] = [];
  for (const id of orderedIds) {
    if (disabled.has(id)) continue;
    const meta = metaById.get(id);
    if (!meta) continue;

    // Skip if no primary candidates defined
    if (!meta.primaryCandidates || meta.primaryCandidates.length === 0) continue;

    const state = pluginStates[id];
    const data = state?.data ?? null;

    let fraction: number | undefined;
    let text: string | undefined;
    if (data) {
      // Find first candidate that exists in runtime data
      const primaryLabel = meta.primaryCandidates.find((label) =>
        data.lines.some((line) => isProgressLine(line) && line.label === label),
      );
      if (primaryLabel) {
        const primaryLine = data.lines.find(
          (line): line is ProgressLine => isProgressLine(line) && line.label === primaryLabel,
        );
        if (primaryLine) {
          if (primaryLine.format?.kind === "count" && primaryLine.limit <= 0) {
            // Capless count: show the raw abbreviated number, no percent.
            text = formatTrayCountText(primaryLine.used);
          } else if (primaryLine.limit > 0) {
            const shownAmount =
              displayMode === "used" ? primaryLine.used : primaryLine.limit - primaryLine.used;
            fraction = clamp01(shownAmount / primaryLine.limit);
          }
        }
      }
    }

    out.push({ id, fraction, text });
    if (out.length >= maxBars) break;
  }

  return out;
}
