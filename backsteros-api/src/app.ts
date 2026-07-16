import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { generateOpenApi } from "@ts-rest/open-api";

import { apiContract } from "@backsteros/contracts";

import { registerApiRoutes } from "./app/routes.js";

export function createApp() {
  const app = new Hono();

  const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: corsOrigins,
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.get("/health", (c) =>
    c.json({
      ok: true as const,
      service: "backsteros-api",
      version: "0.1.0",
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
  app.route("/", api);

  return app;
}
