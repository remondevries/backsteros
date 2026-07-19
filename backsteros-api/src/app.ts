import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { generateOpenApi } from "@ts-rest/open-api";

import { apiContract } from "@backsteros/contracts";

import { registerApiRoutes } from "./app/routes.js";
import { registerOpsRoutes } from "./app/ops-routes.js";
import { registerSyncRoutes } from "./app/sync-routes.js";
import { installOpsLogConsoleCapture } from "./lib/ops-log-buffer.js";
import { isSpacesConfigured } from "./lib/storage.js";
import { MAX_UPLOAD_BYTES } from "./lib/upload-limits.js";

installOpsLogConsoleCapture();

export function createApp() {
  const app = new Hono();

  const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use("*", logger());
  // cross-origin: Next.js avatar/PDF proxies fetch this API from another origin.
  app.use(
    "*",
    secureHeaders({
      crossOriginResourcePolicy: "cross-origin",
    }),
  );
  app.use(
    "*",
    cors({
      origin: corsOrigins,
      allowHeaders: ["Authorization", "Content-Type", "X-Filename"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) =>
        c.json(
          {
            error: "Request body too large",
            code: "payload_too_large" as const,
          },
          413,
        ),
    }),
  );

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    console.error(error);
    return c.json(
      { error: "Internal server error", code: "internal_error" as const },
      500,
    );
  });

  app.get("/health", (c) =>
    c.json({
      ok: true as const,
      service: "backsteros-api",
      version: "0.1.0",
      spacesConfigured: isSpacesConfigured(),
    }),
  );

  app.get("/api/v1/openapi.json", (c) => {
    const document = generateOpenApi(apiContract, {
      info: {
        title: "BacksterOS API",
        version: "0.1.0",
        description:
          "REST API for BacksterOS agents and integrations. Human apps also use PowerSync (Phase 3).",
      },
      servers: [
        {
          url: process.env.PUBLIC_API_URL ?? "http://localhost:8787",
          description: "API base URL",
        },
      ],
    });

    return c.json(document);
  });

  const api = new Hono();
  registerApiRoutes(api);
  registerSyncRoutes(api);
  registerOpsRoutes(api);
  app.route("/", api);

  return app;
}
