import { createRequestHandler, RouterContextProvider } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, _env, _ctx) {
    // React Router v8 requires a RouterContextProvider as the load context.
    // The docs site's loaders don't read Cloudflare bindings, so a bare
    // provider is enough; add context keys here if that changes.
    return requestHandler(request, new RouterContextProvider());
  },
} satisfies ExportedHandler<Env>;
