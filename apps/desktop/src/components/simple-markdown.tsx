import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Minimal, dependency-free markdown renderer for release notes / changelog
 * bodies. Handles headings, bullet lists, horizontal rules, bold/italic, links,
 * plain URLs, and GitHub-flavored refs (#123, @user, 7-char commit hashes),
 * turning each into an in-app button that opens the target in the user's
 * browser via the Tauri opener. Shared by the changelog and What's New dialogs.
 */
export function SimpleMarkdown({ content }: { content: string }) {
  // Regex for identifying various markdown elements
  const patterns = [
    // Markdown links: [label](url)
    { type: "link", regex: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g },
    // Plain URLs: https://...
    { type: "url", regex: /(https?:\/\/[^\s<>]*[^\s<>.,:;!'")\]])/g },
    // Bolds: **text** or __text__
    { type: "bold", regex: /(\*\*|__)(.*?)\1/g },
    // Italics: *text* or _text_
    { type: "italic", regex: /(\*|_)(.*?)\1/g },
    // PR/Issue numbers: #123
    { type: "pr", regex: /(#\d+)/g },
    // Usernames: @user
    { type: "user", regex: /(@[\w-]+)/g },
    // Commit hashes: 7 chars hex
    { type: "commit", regex: /\b([a-f0-9]{7})\b/g },
  ];

  const renderText = (text: string): ReactNode => {
    let parts: Array<{ type: string; content: string; url?: string }> = [
      { type: "text", content: text },
    ];

    patterns.forEach((pattern) => {
      const newParts: typeof parts = [];
      parts.forEach((part) => {
        if (part.type !== "text") {
          newParts.push(part);
          return;
        }

        let lastIndex = 0;
        let match;
        const regex = new RegExp(pattern.regex);

        while ((match = regex.exec(part.content)) !== null) {
          if (match.index > lastIndex) {
            newParts.push({ type: "text", content: part.content.slice(lastIndex, match.index) });
          }

          if (pattern.type === "link") {
            newParts.push({ type: "link", content: match[1], url: match[2] });
          } else if (pattern.type === "bold") {
            newParts.push({ type: "bold", content: match[2] });
          } else if (pattern.type === "italic") {
            newParts.push({ type: "italic", content: match[2] });
          } else if (pattern.type === "pr") {
            newParts.push({ type: "pr", content: match[1] });
          } else if (pattern.type === "user") {
            newParts.push({ type: "user", content: match[1] });
          } else if (pattern.type === "commit") {
            const isHex = /^[a-f0-9]+$/.test(match[1]);
            if (isHex && match[1].length === 7) {
              newParts.push({ type: "commit", content: match[1] });
            } else {
              newParts.push({ type: "text", content: match[1] });
            }
          } else if (pattern.type === "url") {
            newParts.push({ type: "link", content: match[1], url: match[1] });
          }

          lastIndex = regex.lastIndex;
        }

        if (lastIndex < part.content.length) {
          newParts.push({ type: "text", content: part.content.slice(lastIndex) });
        }
      });
      parts = newParts;
    });

    const linkClass =
      "text-[#58a6ff] hover:underline hover:text-[#58a6ff]/80 transition-colors cursor-pointer";

    return parts.map((part, i) => {
      if (part.type === "link") {
        return (
          <button
            key={i}
            onClick={() => openUrl(part.url!).catch(console.error)}
            className={linkClass}
          >
            {part.content}
          </button>
        );
      }
      if (part.type === "bold") {
        return (
          <strong key={i} className="font-bold text-foreground">
            {renderText(part.content)}
          </strong>
        );
      }
      if (part.type === "italic") {
        return (
          <em key={i} className="italic text-foreground/90">
            {renderText(part.content)}
          </em>
        );
      }
      if (part.type === "pr") {
        return (
          <button
            key={i}
            onClick={() =>
              openUrl(`https://github.com/cbnsndwch/pacebar/pull/${part.content.slice(1)}`).catch(
                console.error,
              )
            }
            className={linkClass}
          >
            {part.content}
          </button>
        );
      }
      if (part.type === "user") {
        return (
          <button
            key={i}
            onClick={() =>
              openUrl(`https://github.com/${part.content.slice(1)}`).catch(console.error)
            }
            className={linkClass}
          >
            {part.content}
          </button>
        );
      }
      if (part.type === "commit") {
        return (
          <button
            key={i}
            onClick={() =>
              openUrl(`https://github.com/cbnsndwch/pacebar/commit/${part.content}`).catch(
                console.error,
              )
            }
            className={`${linkClass} font-mono`}
          >
            {part.content}
          </button>
        );
      }
      return <span key={i}>{part.content}</span>;
    });
  };

  const lines = content.split("\n");
  return (
    <div className="space-y-1.5 break-words">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed === "---" || trimmed === "***" || trimmed === "--") {
          return <hr key={i} className="border-t border-border/50 my-4" />;
        }
        if (trimmed.startsWith("###")) {
          return (
            <h4 key={i} className="text-sm font-bold mt-4 mb-1 text-foreground">
              {renderText(trimmed.replace(/^###\s*/, ""))}
            </h4>
          );
        }
        if (trimmed.startsWith("##")) {
          return (
            <h3 key={i} className="text-base font-bold mt-5 mb-2 text-foreground">
              {renderText(trimmed.replace(/^##\s*/, ""))}
            </h3>
          );
        }
        if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            return (
              <div key={i} className="flex gap-2 pl-1 text-[13px] leading-relaxed">
                <span className="text-muted-foreground/60 mt-1.5 shrink-0 scale-75">•</span>
                <span className="flex-1 text-foreground/90">
                  {renderText(trimmed.replace(/^[-*]\s*/, ""))}
                </span>
              </div>
            );
          }
        }
        if (!trimmed) return <div key={i} className="h-1" />;
        return (
          <p key={i} className="text-[13px] text-foreground/90 leading-relaxed">
            {renderText(line)}
          </p>
        );
      })}
    </div>
  );
}
