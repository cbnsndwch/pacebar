import { describe, expect, it } from "vitest";
import { buildDiagnosticBlob, decodeDiagnosticBlob, DIAGNOSTIC_BLOB_PREFIX } from "./diagnostics";

describe("diagnostics blob", () => {
  it("round-trips a report through build/decode", () => {
    const blob = buildDiagnosticBlob(
      {
        feature: "leaderboard",
        error: "Failed to fetch",
        details: { workerUrl: "https://example.miami", window: "hacknight" },
      },
      "0.11.0",
    );

    expect(blob.startsWith(DIAGNOSTIC_BLOB_PREFIX)).toBe(true);

    const decoded = decodeDiagnosticBlob(blob);
    expect(decoded).not.toBeNull();
    expect(decoded?.v).toBe(1);
    expect(decoded?.app).toBe("0.11.0");
    expect(decoded?.feature).toBe("leaderboard");
    expect(decoded?.error).toBe("Failed to fetch");
    expect(decoded?.details).toEqual({
      workerUrl: "https://example.miami",
      window: "hacknight",
    });
    expect(typeof decoded?.ts).toBe("string");
  });

  it("handles unicode in the error message", () => {
    const blob = buildDiagnosticBlob({ feature: "x", error: "boom 💥 café" }, "1.0.0");
    expect(decodeDiagnosticBlob(blob)?.error).toBe("boom 💥 café");
  });

  it("returns null for malformed input", () => {
    expect(decodeDiagnosticBlob("not-a-real-blob!!!")).toBeNull();
  });
});
