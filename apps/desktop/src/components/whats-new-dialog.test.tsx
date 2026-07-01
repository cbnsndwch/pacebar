import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const opener = vi.hoisted(() => ({ openUrlMock: vi.fn(() => Promise.resolve()) }));
const changelog = vi.hoisted(() => ({ findEntryMock: vi.fn() }));
const settings = vi.hoisted(() => ({
  enableTelemetryMock: vi.fn(() => Promise.resolve()),
  disableTelemetryMock: vi.fn(() => Promise.resolve()),
  saveLastSeenVersionMock: vi.fn(() => Promise.resolve()),
  saveTelemetryNoticeAcknowledgedMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: opener.openUrlMock }));

vi.mock("@/lib/changelog", () => ({
  findChangelogEntry: changelog.findEntryMock,
}));

// Keep the real settings module (app-preferences-store needs its DEFAULT_* + types)
// but stub the side-effecting persistence/telemetry functions.
vi.mock("@/lib/settings", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/settings")>();
  return {
    ...actual,
    enableTelemetry: settings.enableTelemetryMock,
    disableTelemetry: settings.disableTelemetryMock,
    saveLastSeenVersion: settings.saveLastSeenVersionMock,
    saveTelemetryNoticeAcknowledged: settings.saveTelemetryNoticeAcknowledgedMock,
  };
});

import { WhatsNewDialog } from "@/components/whats-new-dialog";
import { useAppPreferencesStore } from "@/stores/app-preferences-store";
import { useAppUiStore } from "@/stores/app-ui-store";

describe("WhatsNewDialog", () => {
  beforeEach(() => {
    useAppUiStore.getState().resetState();
    useAppPreferencesStore.getState().resetState();
    opener.openUrlMock.mockClear();
    changelog.findEntryMock.mockReset();
    changelog.findEntryMock.mockReturnValue(undefined);
    settings.enableTelemetryMock.mockClear();
    settings.disableTelemetryMock.mockClear();
    settings.saveLastSeenVersionMock.mockClear();
    settings.saveTelemetryNoticeAcknowledgedMock.mockClear();
  });

  it("renders nothing when no surface is requested", () => {
    const { container } = render(<WhatsNewDialog version="0.15.0" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the version is still a placeholder", () => {
    useAppUiStore.getState().setShowWhatsNew(true);
    const { container } = render(<WhatsNewDialog version="..." />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows this version's release notes when what's-new is requested", async () => {
    changelog.findEntryMock.mockReturnValue({
      version: "0.15.0",
      heading: "v0.15.0",
      body: "- Opt-in telemetry landed",
    });
    useAppUiStore.getState().setShowWhatsNew(true);

    render(<WhatsNewDialog version="0.15.0" />);

    expect(screen.getByText("What's New in v0.15.0")).toBeInTheDocument();
    expect(screen.getByText("Opt-in telemetry landed")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(settings.saveLastSeenVersionMock).toHaveBeenCalledWith("0.15.0");
    expect(useAppUiStore.getState().showWhatsNew).toBe(false);
  });

  it("shows the telemetry disclosure and enables telemetry only on explicit opt-in", async () => {
    useAppUiStore.getState().setShowTelemetryNotice(true);

    render(<WhatsNewDialog version="0.15.0" />);

    expect(screen.getByText("Help improve PaceBar (optional)")).toBeInTheDocument();
    // Telemetry stays off until the user acts.
    expect(settings.enableTelemetryMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("checkbox"));
    expect(settings.enableTelemetryMock).toHaveBeenCalledTimes(1);
    expect(useAppPreferencesStore.getState().telemetryOptIn).toBe(true);
  });

  it("acknowledges the telemetry notice on dismiss so it does not reappear", async () => {
    useAppUiStore.getState().setShowTelemetryNotice(true);

    render(<WhatsNewDialog version="0.15.0" />);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(settings.saveTelemetryNoticeAcknowledgedMock).toHaveBeenCalledTimes(1);
    expect(useAppUiStore.getState().showTelemetryNotice).toBe(false);
  });

  it("opens the privacy page from the notice", async () => {
    useAppUiStore.getState().setShowTelemetryNotice(true);

    render(<WhatsNewDialog version="0.15.0" />);
    await userEvent.click(screen.getByRole("button", { name: /privacy page/i }));

    expect(opener.openUrlMock).toHaveBeenCalledWith(
      "https://pacebar.cbnsndwch.dev/docs/features/privacy",
    );
  });

  it("falls back to a short message when there is no changelog entry", () => {
    changelog.findEntryMock.mockReturnValue(undefined);
    useAppUiStore.getState().setShowWhatsNew(true);

    render(<WhatsNewDialog version="0.15.0" />);

    expect(screen.getByText(/PaceBar has been updated to v0\.15\.0/)).toBeInTheDocument();
  });

  it("disables telemetry when toggled off", async () => {
    useAppUiStore.getState().setShowTelemetryNotice(true);
    useAppPreferencesStore.getState().setTelemetryOptIn(true);

    render(<WhatsNewDialog version="0.15.0" />);

    await userEvent.click(screen.getByRole("checkbox"));
    expect(settings.disableTelemetryMock).toHaveBeenCalledTimes(1);
    expect(settings.enableTelemetryMock).not.toHaveBeenCalled();
    expect(useAppPreferencesStore.getState().telemetryOptIn).toBe(false);
  });
});
