import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChangelogEntry } from "@/lib/changelog";

const openerState = vi.hoisted(() => ({
  openUrlMock: vi.fn(() => Promise.resolve()),
}));

const changelogState = vi.hoisted(() => ({
  entries: [] as ChangelogEntry[],
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openerState.openUrlMock,
}));

vi.mock("@/lib/changelog", () => ({
  getChangelogEntries: () => changelogState.entries,
  normalizeVersion: (v: string) => v.trim().replace(/^v/i, ""),
}));

import { ChangelogDialog } from "@/components/changelog-dialog";

describe("ChangelogDialog", () => {
  beforeEach(() => {
    changelogState.entries = [];
    openerState.openUrlMock.mockClear();
  });

  it("renders the empty state and links to GitHub when there are no entries", async () => {
    render(<ChangelogDialog currentVersion="1.0.0" onBack={() => {}} onClose={() => {}} />);

    expect(screen.getByText("No release notes found")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "View all releases on GitHub" }));
    expect(openerState.openUrlMock).toHaveBeenCalledWith(
      "https://github.com/cbnsndwch/pacebar/releases",
    );
  });

  it("renders every entry, marks the current version, and formats markdown", async () => {
    changelogState.entries = [
      {
        version: "1.2.3",
        heading: "v1.2.3",
        body:
          "## Heading\n" +
          "- item\n" +
          "PR #123 by @user in commit abcdef1\n" +
          "See [docs](https://example.com/docs)",
      },
      { version: "1.0.0", heading: "v1.0.0", body: "older notes" },
    ];

    render(<ChangelogDialog currentVersion="1.2.3" onBack={() => {}} onClose={() => {}} />);

    // Both versions rendered (full history).
    expect(screen.getByText("v1.2.3")).toBeInTheDocument();
    expect(screen.getByText("v1.0.0")).toBeInTheDocument();
    // Only the running version is marked current.
    expect(screen.getAllByText("Current")).toHaveLength(1);
    // Markdown rendered.
    expect(screen.getByText("Heading")).toBeInTheDocument();
    expect(screen.getByText("item")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "docs" }));
    expect(openerState.openUrlMock).toHaveBeenCalledWith("https://example.com/docs");

    openerState.openUrlMock.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "#123" }));
    expect(openerState.openUrlMock).toHaveBeenCalledWith(
      "https://github.com/cbnsndwch/pacebar/pull/123",
    );

    openerState.openUrlMock.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "abcdef1" }));
    expect(openerState.openUrlMock).toHaveBeenCalledWith(
      "https://github.com/cbnsndwch/pacebar/commit/abcdef1",
    );
  });

  it("handles a currentVersion that isn't in the list (no Current badge)", () => {
    changelogState.entries = [{ version: "0.1.0", heading: "v0.1.0", body: "old" }];

    render(<ChangelogDialog currentVersion="9.9.9" onBack={() => {}} onClose={() => {}} />);

    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });

  it("invokes navigation callbacks and closes on Escape", async () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    changelogState.entries = [{ version: "1.0.0", heading: "v1.0.0", body: "body" }];

    render(<ChangelogDialog currentVersion="1.0.0" onBack={onBack} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens the web changelog link", async () => {
    changelogState.entries = [{ version: "1.0.0", heading: "v1.0.0", body: "body" }];

    render(<ChangelogDialog currentVersion="1.0.0" onBack={() => {}} onClose={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: "web changelog" }));
    expect(openerState.openUrlMock).toHaveBeenCalledWith("https://pacebar.cbnsndwch.dev/changelog");
  });
});
