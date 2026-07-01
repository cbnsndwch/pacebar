import type { Route } from "./+types/home";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { Link } from "react-router";
import { Gauge, RefreshCw, Keyboard, Puzzle, Plug, Network, Download } from "lucide-react";
import { baseOptions } from "@/lib/layout.shared";
import { githubUrl, releasesUrl } from "@/lib/shared";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "PaceBar — Track all your AI coding subscriptions in one place" },
    {
      name: "description",
      content:
        "See your AI coding subscription usage at a glance from your menu bar. No digging through dashboards.",
    },
  ];
}

const FEATURES = [
  {
    icon: Gauge,
    title: "One glance",
    body: "All your AI tools in one panel — with up to four progress bars drawn right into the tray icon.",
  },
  {
    icon: RefreshCw,
    title: "Always up to date",
    body: "Refreshes automatically on a schedule you pick: 5, 15, 30, or 60 minutes.",
  },
  {
    icon: Keyboard,
    title: "Global shortcut",
    body: "Toggle the panel from anywhere with a keyboard shortcut you choose.",
  },
  {
    icon: Puzzle,
    title: "Plugin-based",
    body: "Every provider is a plugin. New ones ship without rebuilding the app.",
  },
  {
    icon: Plug,
    title: "Local HTTP API",
    body: "Let other local apps read the same usage data from 127.0.0.1:6736.",
  },
  {
    icon: Network,
    title: "Proxy support",
    body: "Route provider requests through a SOCKS5 or HTTP proxy when you need to.",
  },
];

const PROVIDERS: [string, string][] = [
  ["Amp", "amp"],
  ["Antigravity", "antigravity"],
  ["Claude Code", "claude"],
  ["Cloudflare AI", "cloudflare-ai"],
  ["Codex", "codex"],
  ["Copilot", "copilot"],
  ["Cursor", "cursor"],
  ["Factory / Droid", "factory"],
  ["Gemini", "gemini"],
  ["JetBrains AI", "jetbrains-ai-assistant"],
  ["Kimi Code", "kimi"],
  ["Kiro", "kiro"],
  ["MiniMax", "minimax"],
  ["OpenCode Go", "opencode-go"],
  ["Perplexity", "perplexity"],
  ["Synthetic", "synthetic"],
  ["Windsurf", "windsurf"],
  ["Z.ai", "zai"],
];

export default function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="flex flex-1 flex-col">
        <Hero />
        <Screenshot />
        <Features />
        <Providers />
        <Footer />
      </main>
    </HomeLayout>
  );
}

function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pt-20 pb-12 text-center sm:pt-28">
      <img
        src="/logo.png"
        alt="PaceBar"
        width={72}
        height={72}
        className="mb-6 rounded-2xl shadow-sm"
      />
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Track all your AI coding
        <br className="hidden sm:block" /> subscriptions in one place
      </h1>
      <p className="text-fd-muted-foreground mt-5 max-w-2xl text-lg">
        PaceBar lives in your menu bar and shows how much of your AI coding subscriptions you've
        used. Progress bars, badges, and clear labels — no digging through dashboards.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href={releasesUrl}
          className="bg-fd-primary text-fd-primary-foreground inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
        >
          <Download className="size-4" />
          Download
        </a>
        <Link
          to="/docs"
          className="border-fd-border hover:bg-fd-accent inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium"
        >
          Read the docs
        </Link>
        <a
          href={githubUrl}
          className="text-fd-muted-foreground hover:text-fd-foreground inline-flex items-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium"
        >
          GitHub
        </a>
      </div>
      <p className="text-fd-muted-foreground mt-4 text-xs">
        macOS (Apple Silicon & Intel) · Windows (x64) · auto-updates
      </p>
    </section>
  );
}

function Screenshot() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-16">
      <div className="border-fd-border bg-fd-card overflow-hidden rounded-xl border shadow-lg">
        <img
          src="/screenshot.png"
          alt="PaceBar showing usage for several AI coding subscriptions"
          className="w-full"
        />
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="border-fd-border border-t">
      <div className="mx-auto w-full max-w-5xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold">What it does</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="border-fd-border bg-fd-card rounded-xl border p-5">
              <div className="bg-fd-primary/10 text-fd-primary mb-3 inline-flex rounded-lg p-2">
                <Icon className="size-5" />
              </div>
              <h3 className="font-medium">{title}</h3>
              <p className="text-fd-muted-foreground mt-1 text-sm">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Providers() {
  return (
    <section className="border-fd-border border-t">
      <div className="mx-auto w-full max-w-5xl px-4 py-16 text-center">
        <h2 className="text-2xl font-semibold">Supported providers</h2>
        <p className="text-fd-muted-foreground mt-2">
          Most need no setup — PaceBar reads credentials already on your machine.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {PROVIDERS.map(([label, id]) => (
            <Link
              key={id}
              to={`/docs/providers/${id}`}
              className="border-fd-border hover:bg-fd-accent rounded-full border px-3.5 py-1.5 text-sm"
            >
              {label}
            </Link>
          ))}
        </div>
        <p className="text-fd-muted-foreground mt-6 text-sm">
          Missing one?{" "}
          <a className="text-fd-foreground underline" href={`${githubUrl}/issues/new`}>
            Open an issue
          </a>{" "}
          or{" "}
          <Link className="text-fd-foreground underline" to="/docs/plugins/authoring">
            write a plugin
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-fd-border text-fd-muted-foreground border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-4 py-10 text-sm sm:flex-row sm:justify-between">
        <p>
          Fork of{" "}
          <a className="hover:text-fd-foreground" href="https://github.com/robinebers/openusage">
            OpenUsage
          </a>{" "}
          · MIT licensed
        </p>
        <nav className="flex gap-4">
          <Link className="hover:text-fd-foreground" to="/docs">
            Docs
          </Link>
          <Link className="hover:text-fd-foreground" to="/changelog">
            Changelog
          </Link>
          <a className="hover:text-fd-foreground" href={githubUrl}>
            GitHub
          </a>
          <a className="hover:text-fd-foreground" href={releasesUrl}>
            Releases
          </a>
        </nav>
      </div>
    </footer>
  );
}
