import type { Config } from "@react-router/dev/config";

export default {
  // SSR on the Worker. Static assets (JS/CSS/MDX chunks) are served from the
  // assets binding; HTML is rendered per request. Low-traffic docs site — no
  // need to prerender. (React Router v8 always enables the Vite Environment
  // API, so no future flag is needed.)
  ssr: true,
} satisfies Config;
