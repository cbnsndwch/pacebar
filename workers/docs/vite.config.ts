import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import mdx from "fumadocs-mdx/vite";

export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), mdx(), tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // Allow the dev server to read the repo-root CHANGELOG.md (imported via ?raw
    // on the /changelog route), which lives above this package.
    fs: {
      allow: ["../.."],
    },
  },
});
