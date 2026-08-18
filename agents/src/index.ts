import { serve } from "@hono/node-server";

import { createApp } from "./app.js";

const upstreamUrl = process.env.CORE_UPSTREAM_URL?.trim();
if (!upstreamUrl) {
  console.error("CORE_UPSTREAM_URL is required (Tailscale URL to core API, e.g. http://host:8788)");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3080);
const hostname = process.env.LISTEN_HOST ?? "0.0.0.0";
const requestTimeoutMs = process.env.REQUEST_TIMEOUT_MS
  ? Number(process.env.REQUEST_TIMEOUT_MS)
  : undefined;

const app = createApp({ upstreamUrl, requestTimeoutMs });

serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info) => {
    console.log(
      `backsteros-agents listening on http://${hostname}:${info.port}`,
    );
    console.log(`Proxying allowed /api/v1/* → ${upstreamUrl}`);
  },
);
