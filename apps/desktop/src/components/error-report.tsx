import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppVersion } from "@/hooks/app/use-app-version";
import { copyToClipboard } from "@/lib/clipboard";
import { buildDiagnosticBlob, type DiagnosticContext } from "@/lib/diagnostics";

interface ErrorReportProps {
  /** The error + non-secret context to encode into the support blob. */
  context: DiagnosticContext;
}

/**
 * Shows an error message plus a button that copies a base64 diagnostic blob
 * for the user to paste into the support channel.
 */
export function ErrorReport({ context }: ErrorReportProps) {
  const appVersion = useAppVersion();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const blob = buildDiagnosticBlob(context, appVersion);
    if (await copyToClipboard(blob)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="px-1 space-y-1.5">
      <p className="text-xs text-destructive">{context.error}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-xs gap-1.5"
        onClick={handleCopy}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied — paste in support" : "Copy error report"}
      </Button>
    </div>
  );
}
