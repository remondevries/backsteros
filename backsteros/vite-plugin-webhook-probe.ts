/**
 * Dev-only outbound webhook probe for Settings → Agent Test connection.
 * Cloud does not yet expose POST /agents/:id/webhook/test; Vite can POST the
 * same synthetic payload from Node (no browser CORS) using the secret the UI
 * just saved. Never logs URL or secret.
 */
import type { Plugin } from "vite";
import { randomUUID } from "node:crypto";

const PROBE_PATH = "/__webhook_probe__";
const EVENT = "agent.chat.message";
const SECRET_HEADER = "x-backsteros-webhook-secret";
const DELIVERY_HEADER = "x-backsteros-delivery-id";
const TIMEOUT_MS = 10_000;

type ProbeBody = {
  url?: unknown;
  secret?: unknown;
  agentId?: unknown;
  agentName?: unknown;
};

function readJson(req: {
  on: (event: string, cb: (chunk?: Buffer) => void) => void;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function backsterosWebhookProbePlugin(): Plugin {
  return {
    name: "backsteros-webhook-probe",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(PROBE_PATH) || req.method !== "POST") {
          next();
          return;
        }
        res.setHeader("content-type", "application/json");
        try {
          const body = (await readJson(req)) as ProbeBody;
          const url = typeof body.url === "string" ? body.url.trim() : "";
          const secret =
            typeof body.secret === "string" ? body.secret.trim() : "";
          const agentId =
            typeof body.agentId === "string" && body.agentId.trim()
              ? body.agentId.trim()
              : "test";
          const agentName =
            typeof body.agentName === "string" && body.agentName.trim()
              ? body.agentName.trim()
              : "Agent";
          if (!isHttpsUrl(url)) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                ok: false,
                error: "Webhook URL must be https.",
                deliveryId: null,
              }),
            );
            return;
          }
          if (!secret) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                ok: false,
                error: "Save the webhook secret, then Test again.",
                deliveryId: null,
              }),
            );
            return;
          }
          const deliveryId = randomUUID();
          const now = new Date().toISOString();
          const message = {
            id: "test",
            role: "user",
            text: "BacksterOS webhook test",
            createdAt: now,
          };
          const payload = {
            event: EVENT,
            workspaceId: "test",
            agentId,
            agentName,
            threadId: "test",
            message,
            context: [message],
            deliveryId,
            timestamp: now,
          };
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
          try {
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                [DELIVERY_HEADER]: deliveryId,
                [SECRET_HEADER]: secret,
                authorization: `Bearer ${secret}`,
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            if (!response.ok) {
              res.statusCode = 200;
              res.end(
                JSON.stringify({
                  ok: false,
                  error: `Webhook returned HTTP ${response.status}`,
                  deliveryId,
                }),
              );
              return;
            }
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, error: null, deliveryId }));
          } catch (error) {
            const messageText =
              error instanceof Error ? error.message : "Webhook delivery failed";
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                ok: false,
                error: messageText,
                deliveryId,
              }),
            );
          } finally {
            clearTimeout(timer);
          }
        } catch {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              ok: false,
              error: "Invalid probe payload",
              deliveryId: null,
            }),
          );
        }
      });
    },
  };
}
