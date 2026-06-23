/**
 * Diagnostic report blobs for user-submitted support requests.
 *
 * When something fails in the UI we let the user copy a compact, base64-encoded
 * snapshot of the error + environment and paste it into the support channel.
 * The blob NEVER contains secrets (invite tokens, handles are fine) — callers
 * are responsible for only passing non-sensitive context in `details`.
 */

export interface DiagnosticContext {
  /** Short feature/area identifier, e.g. "leaderboard". */
  feature: string;
  /** Human-readable error message (usually what the user already sees). */
  error: string;
  /** Extra non-secret context. NEVER include tokens or other secrets. */
  details?: Record<string, unknown>;
}

export interface DiagnosticReport extends DiagnosticContext {
  /** Blob schema version, so the support side can decode older blobs. */
  v: 1;
  /** ISO timestamp the report was generated. */
  ts: string;
  /** App version (from Tauri). */
  app: string;
  /** Webview user-agent — carries OS + WebView2/WebKit version. */
  ua: string;
}

/** Marker so support tooling can recognise (and version) the blob. */
export const DIAGNOSTIC_BLOB_PREFIX = "PBDIAG1:";

/** UTF-8 safe base64 encode (btoa alone only handles latin1). */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** UTF-8 safe base64 decode. */
function decodeBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Build the copyable support blob: `PBDIAG1:` + base64(JSON(report)). */
export function buildDiagnosticBlob(ctx: DiagnosticContext, appVersion: string): string {
  const report: DiagnosticReport = {
    v: 1,
    ts: new Date().toISOString(),
    app: appVersion,
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    feature: ctx.feature,
    error: ctx.error,
    ...(ctx.details ? { details: ctx.details } : {}),
  };
  return DIAGNOSTIC_BLOB_PREFIX + encodeBase64(JSON.stringify(report));
}

/** Decode a blob produced by {@link buildDiagnosticBlob}; null if malformed. */
export function decodeDiagnosticBlob(blob: string): DiagnosticReport | null {
  const raw = blob.startsWith(DIAGNOSTIC_BLOB_PREFIX)
    ? blob.slice(DIAGNOSTIC_BLOB_PREFIX.length)
    : blob;
  try {
    return JSON.parse(decodeBase64(raw.trim())) as DiagnosticReport;
  } catch {
    return null;
  }
}
