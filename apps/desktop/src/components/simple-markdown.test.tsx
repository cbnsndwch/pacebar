import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const opener = vi.hoisted(() => ({ openUrlMock: vi.fn(() => Promise.resolve()) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: opener.openUrlMock }));

import { SimpleMarkdown } from "@/components/simple-markdown";

describe("SimpleMarkdown", () => {
  beforeEach(() => opener.openUrlMock.mockClear());

  it("renders headings, list items, bold, italic, a rule, and plain text", () => {
    render(
      <SimpleMarkdown content={"## H3\n### H4\n- bullet\n**bolded** _slanted_\n---\nplain line"} />,
    );
    expect(screen.getByText("H3")).toBeInTheDocument();
    expect(screen.getByText("H4")).toBeInTheDocument();
    expect(screen.getByText("bullet")).toBeInTheDocument();
    expect(screen.getByText("bolded")).toBeInTheDocument();
    expect(screen.getByText("slanted")).toBeInTheDocument();
    expect(screen.getByText("plain line")).toBeInTheDocument();
  });

  it("links markdown links, plain URLs, PRs, users, and commit hashes", async () => {
    render(
      <SimpleMarkdown
        content={
          "See [docs](https://example.com/docs) and https://example.com/plain\n" +
          "PR #123 by @user in abcdef1"
        }
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "docs" }));
    expect(opener.openUrlMock).toHaveBeenCalledWith("https://example.com/docs");

    await userEvent.click(screen.getByRole("button", { name: "https://example.com/plain" }));
    expect(opener.openUrlMock).toHaveBeenCalledWith("https://example.com/plain");

    await userEvent.click(screen.getByRole("button", { name: "#123" }));
    expect(opener.openUrlMock).toHaveBeenCalledWith(
      "https://github.com/cbnsndwch/pacebar/pull/123",
    );

    await userEvent.click(screen.getByRole("button", { name: "@user" }));
    expect(opener.openUrlMock).toHaveBeenCalledWith("https://github.com/user");

    await userEvent.click(screen.getByRole("button", { name: "abcdef1" }));
    expect(opener.openUrlMock).toHaveBeenCalledWith(
      "https://github.com/cbnsndwch/pacebar/commit/abcdef1",
    );
  });

  it("does not treat non-7-char hex runs as commit hashes", () => {
    render(<SimpleMarkdown content={"abcd (too short) and 12345678 (too long)"} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
