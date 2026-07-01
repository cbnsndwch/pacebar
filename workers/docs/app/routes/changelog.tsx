import type { ReactNode } from "react";
import type { Route } from "./+types/changelog";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { appName, githubUrl } from "@/lib/shared";
// Repo-root CHANGELOG.md is the source of truth. `?raw` inlines it at build time
// (four levels up: routes -> app -> docs -> workers -> repo root).
import changelogMarkdown from "../../../../CHANGELOG.md?raw";

const releasesPageUrl = `${githubUrl}/releases`;

// Drop the leading top-level "# Changelog" heading so it doesn't duplicate the
// page's own <h1>.
const changelogBody = changelogMarkdown.replace(/^\s*#\s+.*\r?\n/, "");

export function meta(_args: Route.MetaArgs) {
  return [
    { title: `Changelog — ${appName}` },
    {
      name: "description",
      content: `Release notes for ${appName}.`,
    },
  ];
}

/** Turn a single line of Markdown into React nodes (links, bold, inline code). */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let lastIndex = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const key = `${keyPrefix}-${index}`;
    if (match[1] !== undefined && match[2] !== undefined) {
      const href = match[2];
      if (/^(https?:\/\/|\/|#)/.test(href)) {
        nodes.push(
          <a key={key} href={href} rel="noopener noreferrer">
            {match[1]}
          </a>,
        );
      } else {
        nodes.push(match[1]);
      }
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={key}>{match[3]}</strong>);
    } else if (match[4] !== undefined) {
      nodes.push(<code key={key}>{match[4]}</code>);
    }

    lastIndex = pattern.lastIndex;
    index += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/** Minimal Markdown renderer: headings, rules, bullet lists, paragraphs + inline marks. */
function renderMarkdown(body: string): ReactNode {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(<ul key={`ul-${blocks.length}`}>{listItems}</ul>);
      listItems = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      blocks.push(<hr key={`b-${idx}`} />);
      return;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushList();
      const inner = renderInline(heading[2], `h-${idx}`);
      blocks.push(
        heading[1].length <= 2 ? (
          <h2 key={`b-${idx}`}>{inner}</h2>
        ) : (
          <h3 key={`b-${idx}`}>{inner}</h3>
        ),
      );
      return;
    }

    const listItem = /^[-*]\s+(.*)$/.exec(trimmed);
    if (listItem) {
      listItems.push(<li key={`li-${idx}`}>{renderInline(listItem[1], `li-${idx}`)}</li>);
      return;
    }

    flushList();
    blocks.push(<p key={`b-${idx}`}>{renderInline(trimmed, `p-${idx}`)}</p>);
  });

  flushList();
  return blocks;
}

export default function Changelog() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Changelog</h1>
        <p className="text-fd-muted-foreground mt-3 text-lg">
          What's new in {appName}. For older or pre-release builds, see the{" "}
          <a className="text-fd-foreground underline" href={releasesPageUrl}>
            GitHub releases
          </a>
          .
        </p>

        <div className="prose mt-10">{renderMarkdown(changelogBody)}</div>

        <footer className="border-fd-border text-fd-muted-foreground mt-16 border-t pt-8 text-sm">
          Looking for downloads or older builds?{" "}
          <a className="text-fd-foreground underline" href={releasesPageUrl}>
            See all releases on GitHub
          </a>
          .
        </footer>
      </main>
    </HomeLayout>
  );
}
