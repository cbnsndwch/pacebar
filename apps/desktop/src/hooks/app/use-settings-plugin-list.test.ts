import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSettingsPluginList } from "@/hooks/app/use-settings-plugin-list";
import type { PluginMeta } from "@/lib/plugin-types";
import type { PluginSettings } from "@/lib/settings";

function createPluginMeta(id: string, name: string, extra?: Partial<PluginMeta>): PluginMeta {
  return {
    id,
    name,
    iconUrl: `/${id}.svg`,
    brandColor: "#000000",
    lines: [],
    primaryCandidates: [],
    supportsAvatar: false,
    ...extra,
  };
}

describe("useSettingsPluginList", () => {
  it("returns ordered settings plugins with enabled state", () => {
    const pluginSettings: PluginSettings = {
      order: ["codex", "missing", "cursor"],
      disabled: ["cursor"],
    };

    const { result } = renderHook(() =>
      useSettingsPluginList({
        pluginSettings,
        pluginsMeta: [createPluginMeta("cursor", "Cursor"), createPluginMeta("codex", "Codex")],
      }),
    );

    expect(result.current).toEqual([
      { id: "codex", name: "Codex", enabled: true, supportsAvatar: false },
      { id: "cursor", name: "Cursor", enabled: false, supportsAvatar: false },
    ]);
  });

  it("forwards supportsAvatar and avatarUrl from PluginMeta", () => {
    const { result } = renderHook(() =>
      useSettingsPluginList({
        pluginSettings: { order: ["claude:work"], disabled: [] },
        pluginsMeta: [
          createPluginMeta("claude:work", "Claude · work", {
            supportsAvatar: true,
            avatarUrl: "data:image/png;base64,abc",
          }),
        ],
      }),
    );

    expect(result.current[0]?.supportsAvatar).toBe(true);
    expect(result.current[0]?.avatarUrl).toBe("data:image/png;base64,abc");
  });

  it("avatarUrl is undefined when PluginMeta has none", () => {
    const { result } = renderHook(() =>
      useSettingsPluginList({
        pluginSettings: { order: ["codex"], disabled: [] },
        pluginsMeta: [createPluginMeta("codex", "Codex")],
      }),
    );

    expect(result.current[0]?.supportsAvatar).toBe(false);
    expect(result.current[0]?.avatarUrl).toBeUndefined();
  });

  it("returns empty list when settings are not loaded", () => {
    const { result } = renderHook(() =>
      useSettingsPluginList({
        pluginSettings: null,
        pluginsMeta: [createPluginMeta("codex", "Codex")],
      }),
    );

    expect(result.current).toEqual([]);
  });
});
