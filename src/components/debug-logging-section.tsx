import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { FolderOpen } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { loadVerboseLogging, setVerboseLogging } from "@/lib/settings";

/**
 * Verbose debug logging toggle. When enabled, the app writes detailed runtime
 * logs (provider probes, ccusage runs, HTTP calls) to its log file so users can
 * share them for troubleshooting. Self-contained so it needs no prop threading.
 */
export function DebugLoggingSection() {
  const [verbose, setVerbose] = useState(false);

  useEffect(() => {
    void loadVerboseLogging()
      .then(setVerbose)
      .catch((error) => {
        console.error("Failed to load verbose logging setting:", error);
      });
  }, []);

  const handleToggle = (enabled: boolean) => {
    setVerbose(enabled);
    void setVerboseLogging(enabled).catch((error) => {
      console.error("Failed to update verbose logging:", error);
    });
  };

  const handleRevealLog = () => {
    void (async () => {
      try {
        const path = await invoke<string>("get_log_path");
        await revealItemInDir(path);
      } catch (error) {
        console.error("Failed to reveal log file:", error);
      }
    })();
  };

  return (
    <section>
      <h3 className="text-lg font-semibold mb-0">Debug Logging</h3>
      <p className="text-sm text-muted-foreground mb-2">Detailed logs for troubleshooting</p>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm select-none text-foreground">
          <Checkbox
            checked={verbose}
            onCheckedChange={(checked) => handleToggle(checked === true)}
          />
          Enable verbose logging
        </label>
        <Button type="button" variant="outline" size="sm" onClick={handleRevealLog}>
          <FolderOpen className="size-4" />
          Show log file
        </Button>
        <p className="text-xs text-muted-foreground">
          Turn this on, reproduce the issue, then share the log file.
        </p>
      </div>
    </section>
  );
}
