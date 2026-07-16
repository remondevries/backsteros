import { serve } from "@hono/node-server";

import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);

const app = createApp();

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`backsteros-api listening on http://localhost:${info.port}`);
    console.log(`OpenAPI: http://localhost:${info.port}/api/v1/openapi.json`);
  },
);
