import { useCallback, useEffect } from "react";
import { Sparkles, ShieldCheck, ExternalLink as ExternalLinkIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleMarkdown } from "@/components/simple-markdown";
import { findChangelogEntry } from "@/lib/changelog";
import {
  disableTelemetry,
  enableTelemetry,
  saveLastSeenVersion,
  saveTelemetryNoticeAcknowledged,
} from "@/lib/settings";
import { useAppPreferencesStore } from "@/stores/app-preferences-store";
import { useAppUiStore } from "@/stores/app-ui-store";

const PRIVACY_URL = "https://pacebar.cbnsndwch.dev/docs/features/privacy";

interface WhatsNewDialogProps {
  version: string;
}

/**
 * One-time post-upgrade surface. Shows this version's release notes after an
 * update (`showWhatsNew`) and/or a respectful opt-in telemetry disclosure
 * (`showTelemetryNotice`), both toggled by use-settings-bootstrap. Dismissing
 * persists the "seen" state so it does not reappear; telemetry stays OFF unless
 * the user explicitly enables it here.
 */
export function WhatsNewDialog({ version }: WhatsNewDialogProps) {
  const { showWhatsNew, showTelemetryNotice, setShowWhatsNew, setShowTelemetryNotice } =
    useAppUiStore(
      useShallow((s) => ({
        showWhatsNew: s.showWhatsNew,
        showTelemetryNotice: s.showTelemetryNotice,
        setShowWhatsNew: s.setShowWhatsNew,
        setShowTelemetryNotice: s.setShowTelemetryNotice,
      })),
    );
  const { telemetryOptIn, setTelemetryOptIn } = useAppPreferencesStore(
    useShallow((s) => ({
      telemetryOptIn: s.telemetryOptIn,
      setTelemetryOptIn: s.setTelemetryOptIn,
    })),
  );

  const hasVersion = Boolean(version) && version !== "...";
  const isOpen = (showWhatsNew || showTelemetryNotice) && hasVersion;

  const handleDismiss = useCallback(() => {
    if (showWhatsNew && hasVersion) {
      void saveLastSeenVersion(version).catch((error) => {
        console.error("Failed to save last seen version:", error);
      });
    }
    if (showTelemetryNotice) {
      void saveTelemetryNoticeAcknowledged().catch((error) => {
        console.error("Failed to save telemetry notice acknowledgement:", error);
      });
    }
    setShowWhatsNew(false);
    setShowTelemetryNotice(false);
  }, [
    showWhatsNew,
    showTelemetryNotice,
    hasVersion,
    version,
    setShowWhatsNew,
    setShowTelemetryNotice,
  ]);

  // Close on Escape (counts as acknowledging the surface).
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleDismiss();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleDismiss]);

  if (!isOpen) return null;

  const entry = showWhatsNew ? findChangelogEntry(version) : undefined;

  const handleTelemetryToggle = (next: boolean) => {
    setTelemetryOptIn(next);
    const task = next ? enableTelemetry() : disableTelemetry();
    void task.catch((error) => {
      console.error("Failed to update telemetry opt-in:", error);
    });
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl">
      <div className="bg-card rounded-lg border shadow-2xl flex flex-col w-[92%] max-h-[88%] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 p-3.5 border-b bg-muted/20">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm tracking-tight">
            {showWhatsNew ? `What's New in v${version}` : "A quick note on privacy"}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar overflow-x-hidden space-y-5">
          {showWhatsNew &&
            (entry ? (
              <div className="bg-muted/10 rounded-lg p-1">
                <SimpleMarkdown content={entry.body} />
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                PaceBar has been updated to v{version}. See the full history in Release Notes.
              </p>
            ))}

          {showTelemetryNotice && (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Help improve PaceBar (optional)</h3>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                PaceBar can now share anonymous usage stats so we can see which versions are in use.
                If you turn it on, it sends a random install id, your app version, OS, and CPU
                architecture — at most once a day. No account, no personal data, and nothing about
                how you use the app. It stays off unless you enable it, and turning it off stops
                sharing immediately.
              </p>
              <label className="flex items-center gap-2 text-sm select-none text-foreground">
                <Checkbox
                  key={`whats-new-telemetry-${telemetryOptIn}`}
                  checked={telemetryOptIn}
                  onCheckedChange={(checked) => handleTelemetryToggle(checked === true)}
                />
                Share anonymous usage stats
              </label>
              <button
                onClick={() => openUrl(PRIVACY_URL).catch(console.error)}
                className="text-xs text-[#58a6ff] hover:underline flex items-center gap-1"
              >
                Read our privacy page <ExternalLinkIcon className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-3.5 border-t bg-muted/10">
          <Button size="sm" onClick={handleDismiss}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
