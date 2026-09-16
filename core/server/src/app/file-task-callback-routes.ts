import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import {
  createFileTaskCallbackSchema,
  fileTaskCallbackResultSchema,
} from "@backsteros/contracts";

import type { AuthContext } from "../middleware/auth.js";
import { requireScope } from "../middleware/auth.js";
import {
  parseFileTaskCallbackResult,
  readFileTaskCallback,
  registerFileTaskCallback,
  storePublicFileTaskCallback,
} from "../services/file-task-callbacks.js";

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function forbidden() {
  return { error: "Forbidden", code: "forbidden" as const };
}

function notFound(resource: string) {
  return { error: `${resource} not found`, code: "not_found" as const };
}

function getAuth(c: { get: (key: "auth") => AuthContext | undefined }) {
  return c.get("auth");
}

export function registerFileTaskCallbackRoutes(app: Hono) {
  app.post(
    "/api/v1/file-task-callbacks",
    zValidator("json", createFileTaskCallbackSchema),
    async (c) => {
      const auth = getAuth(c);
      if (!requireScope("tasks:write")(auth)) {
        return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
      }
      const { requestId } = c.req.valid("json");
      const created = await registerFileTaskCallback(
        auth!.workspaceId,
        requestId,
      );
      if ("conflict" in created) {
        return c.json(
          {
            error: "A result is already recorded for this requestId",
            code: "conflict" as const,
          },
          409,
        );
      }
      return c.json(created);
    },
  );

  app.get("/api/v1/file-task-callbacks/:requestId", async (c) => {
    const auth = getAuth(c);
    if (!requireScope("tasks:read")(auth)) {
      return c.json(auth ? forbidden() : unauthorized(), auth ? 403 : 401);
    }
    const requestId = decodeURIComponent(c.req.param("requestId"));
    const poll = await readFileTaskCallback(auth!.workspaceId, requestId);
    if (!poll) {
      return c.json(notFound("File-task callback"), 404);
    }
    return c.json(poll);
  });

  app.post(
    "/api/v1/public/file-task-callbacks/:requestId",
    zValidator("json", fileTaskCallbackResultSchema),
    async (c) => {
      const requestId = decodeURIComponent(c.req.param("requestId"));
      const token = c.req.query("token")?.trim() ?? "";
      if (!token) {
        return c.json(unauthorized(), 401);
      }
      const result = parseFileTaskCallbackResult(c.req.valid("json"));
      if (!result) {
        return c.json(
          { error: "Invalid callback body", code: "bad_request" as const },
          400,
        );
      }
      const stored = await storePublicFileTaskCallback({
        requestId,
        token,
        result,
      });
      if (stored === "mismatch") {
        return c.json(
          {
            error: "requestId in the body must match the path",
            code: "bad_request" as const,
          },
          400,
        );
      }
      if (stored === "unknown") {
        return c.json(notFound("File-task callback"), 404);
      }
      if (stored === "unauthorized") {
        return c.json(unauthorized(), 401);
      }
      if (stored === "conflict") {
        return c.json(
          {
            error: "Result already recorded for this requestId",
            code: "conflict" as const,
          },
          409,
        );
      }
      return c.json({ ok: true as const });
    },
  );
}
