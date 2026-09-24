import type { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { emailAgentCallbackResultSchema } from "@backsteros/contracts";

import type { AuthContext } from "../middleware/auth.js";
import { publishEmailUpdated } from "../lib/email-inbox-events.js";
import {
  loadEmailAgentCallbackRow,
  readEmailAgentCallback,
  storeEmailAgentCallbackResult,
} from "../services/email-agent-callbacks.js";
import { dispatchEmailAgentCallbackSuccess } from "../services/email-agent-callback-dispatch.js";

function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}

function notFound(resource: string) {
  return { error: `${resource} not found`, code: "not_found" as const };
}

function getAuth(c: { get: (key: "auth") => AuthContext | undefined }) {
  return c.get("auth");
}

export function registerEmailAgentCallbackRoutes(app: Hono) {
  app.get("/api/v1/email/agent-draft-callbacks/:requestId", async (c) => {
    const auth = getAuth(c);
    if (!auth) return c.json(unauthorized(), 401);
    const requestId = decodeURIComponent(c.req.param("requestId"));
    const poll = await readEmailAgentCallback(auth.workspaceId, requestId);
    if (!poll) return c.json(notFound("Email agent draft callback"), 404);
    return c.json(poll);
  });

  app.post(
    "/api/v1/public/email-agent-callbacks/:requestId",
    zValidator("json", emailAgentCallbackResultSchema),
    async (c) => {
      const requestId = decodeURIComponent(c.req.param("requestId"));
      const token = c.req.query("token")?.trim() || "";
      if (!token) {
        return c.json({ error: "Missing token", code: "unauthorized" }, 401);
      }
      const body = c.req.valid("json");
      if (body.requestId !== requestId) {
        return c.json({ error: "requestId mismatch", code: "bad_request" }, 400);
      }

      const row = await loadEmailAgentCallbackRow(requestId);
      if (!row) return c.json(notFound("Email agent draft callback"), 404);
      if (row.result != null) {
        return c.json({ error: "Callback already completed", code: "conflict" }, 409);
      }

      if (body.ok === false) {
        const stored = await storeEmailAgentCallbackResult({
          requestId,
          token,
          result: body,
        });
        if (stored === "unauthorized") {
          return c.json(unauthorized(), 401);
        }
        if (stored !== "ok") {
          return c.json({ error: `Callback store failed (${stored})`, code: "bad_request" }, 400);
        }
        return c.json({ ok: true });
      }

      try {
        const enriched = await dispatchEmailAgentCallbackSuccess({
          row: {
            workspaceId: row.workspaceId,
            inboxId: row.inboxId,
            messageId: row.messageId,
          },
          body,
        });
        const stored = await storeEmailAgentCallbackResult({
          requestId,
          token,
          result: enriched,
        });
        if (stored === "unauthorized") {
          return c.json(unauthorized(), 401);
        }
        if (stored !== "ok") {
          return c.json(
            { error: `Callback store failed (${stored})`, code: "bad_request" },
            400,
          );
        }
        publishEmailUpdated({
          workspaceId: row.workspaceId,
          inboxId: enriched.inboxId ?? row.inboxId,
          messageId: row.messageId,
        });
        return c.json({
          ok: true,
          intent: enriched.intent,
          draftId: enriched.draftId,
          inboxId: enriched.inboxId,
          taskId: enriched.task?.taskId,
          meetingId: enriched.event?.meetingId,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not apply email agent command";
        await storeEmailAgentCallbackResult({
          requestId,
          token,
          result: {
            ok: false,
            requestId,
            error: message,
          },
        }).catch(() => undefined);
        return c.json({ error: message, code: "bad_request" }, 400);
      }
    },
  );
}
