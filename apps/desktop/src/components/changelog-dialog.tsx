import { useEffect } from "react";
import { ChevronRight, ExternalLink as ExternalLinkIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getChangelogEntries, normalizeVersion } from "@/lib/changelog";
import { SimpleMarkdown } from "@/components/simple-markdown";

interface ChangelogDialogProps {
  currentVersion: string;
  onBack: () => void;
  onClose: () => void;
}

const RELEASES_URL = "https://github.com/cbnsndwch/pacebar/releases";

export function ChangelogDialog({ currentVersion, onBack, onClose }: ChangelogDialogProps) {
  const entries = getChangelogEntries();
  // Base version so prerelease builds (e.g. "0.15.0-rc.3") badge their base entry.
  const current = normalizeVersion(currentVersion).split("-")[0];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] rounded-xl">
      <div className="bg-card rounded-lg border shadow-2xl flex flex-col w-[92%] h-[88%] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-3.5 border-b bg-muted/20">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground"
              title="Back"
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
            <h2 className="font-semibold text-sm tracking-tight">Release Notes</h2>
          </div>
          <button
            onClick={() => openUrl(RELEASES_URL).catch(console.error)}
            className="text-[10px] text-[#58a6ff] hover:underline flex items-center gap-1"
          >
            GitHub <ExternalLinkIcon className="w-3 h-3" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar overflow-x-hidden">
          {entries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-60">
              <span className="text-sm font-medium mb-1">No release notes found</span>
              <button
                onClick={() => openUrl(RELEASES_URL).catch(console.error)}
                className="text-xs text-[#58a6ff] hover:underline"
              >
                View all releases on GitHub
              </button>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
              {entries.map((entry) => {
                const isCurrent = entry.version === current;
                return (
                  <section key={entry.heading}>
                    <div className="flex items-baseline gap-2 mb-3 border-b pb-2">
                      <h3 className="font-bold text-lg">{entry.heading}</h3>
                      {isCurrent && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="bg-muted/10 rounded-lg p-1">
                      <SimpleMarkdown content={entry.body} />
                    </div>
                  </section>
                );
              })}

              <div className="pt-6 border-t border-dashed">
                <p className="text-[10px] text-muted-foreground text-center">
                  Also available as a{" "}
                  <button
                    onClick={() =>
                      openUrl("https://pacebar.cbnsndwch.dev/changelog").catch(console.error)
                    }
                    className="text-[#58a6ff] hover:underline"
                  >
                    web changelog
                  </button>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
