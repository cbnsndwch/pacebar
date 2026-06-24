import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const settingsState = vi.hoisted(() => ({
  loadVerboseLogging: vi.fn(() => Promise.resolve(false)),
  setVerboseLogging: vi.fn(() => Promise.resolve()),
}));
const tauriState = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve("/logs/PaceBar.log")),
  revealItemInDir: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/settings", () => ({
  loadVerboseLogging: settingsState.loadVerboseLogging,
  setVerboseLogging: settingsState.setVerboseLogging,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauriState.invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: tauriState.revealItemInDir }));

import { DebugLoggingSection } from "@/components/debug-logging-section";

describe("DebugLoggingSection", () => {
  beforeEach(() => {
    settingsState.loadVerboseLogging.mockClear().mockResolvedValue(false);
    settingsState.setVerboseLogging.mockClear().mockResolvedValue(undefined);
    tauriState.invoke.mockClear().mockResolvedValue("/logs/PaceBar.log");
    tauriState.revealItemInDir.mockClear().mockResolvedValue(undefined);
  });

  it("reflects the stored verbose state on mount", async () => {
    settingsState.loadVerboseLogging.mockResolvedValue(true);
    render(<DebugLoggingSection />);
    await waitFor(() =>
      expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true"),
    );
  });

  it("enables verbose logging when toggled on", async () => {
    render(<DebugLoggingSection />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(settingsState.setVerboseLogging).toHaveBeenCalledWith(true);
  });

  it("reveals the log file via get_log_path", async () => {
    render(<DebugLoggingSection />);
    await userEvent.click(screen.getByRole("button", { name: /show log file/i }));
    expect(tauriState.invoke).toHaveBeenCalledWith("get_log_path");
    await waitFor(() =>
      expect(tauriState.revealItemInDir).toHaveBeenCalledWith("/logs/PaceBar.log"),
    );
  });
});
