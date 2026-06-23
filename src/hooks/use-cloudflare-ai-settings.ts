import { useState, useEffect } from "react";

export type CloudflareAIDisplayMode = "spent" | "remaining" | "burn" | "percent";

export type CloudflareAISettings = {
  display: CloudflareAIDisplayMode;
  showLimit: boolean;
  capOverride: number | null;
};

export const DEFAULT_CLOUDFLARE_AI_SETTINGS: CloudflareAISettings = {
  display: "spent",
  showLimit: false,
  capOverride: null,
};

export function useCloudflareAISettings() {
  const [settings, setSettings] = useState<CloudflareAISettings>(DEFAULT_CLOUDFLARE_AI_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const raw = await invoke<string | null>("read_plugin_config", { pluginId: "cloudflare-ai" });
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings({
            display: parsed.display ?? "spent",
            showLimit: parsed.showLimit ?? false,
            capOverride: parsed.capOverride ?? null,
          });
        }
      } catch (e) {
        console.warn("Failed to load cloudflare-ai config:", e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const save = async (next: CloudflareAISettings) => {
    setSettings(next);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_plugin_config", {
        pluginId: "cloudflare-ai",
        data: JSON.stringify(next, null, 2),
      });
    } catch (e) {
      console.error("Failed to save cloudflare-ai config:", e);
    }
  };

  return { settings, loaded, save };
}