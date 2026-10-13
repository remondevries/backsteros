import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Connect } from "vite";
import type { Plugin } from "vite";

type BacksterosConfig = {
  baseUrl: string;
  apiKey: string;
};

function parseDotenv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of contents.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadBacksterosConfig(): BacksterosConfig {
  const cliPath = join(homedir(), ".config/backsteros/cli.env");
  const file = existsSync(cliPath)
    ? parseDotenv(readFileSync(cliPath, "utf8"))
    : {};
  const baseUrl = (
    process.env.BACKSTEROS_API_URL ??
    file.BACKSTEROS_API_URL ??
    "http://127.0.0.1:8788"
  )
    .trim()
    .replace(/\/$/, "");
  const apiKey = (
    process.env.BACKSTEROS_API_KEY ??
    file.BACKSTEROS_API_KEY ??
    ""
  ).trim();
  if (!apiKey) {
    throw new Error(
      "BACKSTEROS_API_KEY missing (~/.config/backsteros/cli.env)",
    );
  }
  return { baseUrl, apiKey };
}

function readRequestBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(
  res: Connect.ServerResponse,
  status: number,
  payload: unknown,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/** Dev proxy for Director ↔ BacksterOS meetings (list / create / patch). */
export function backsterosMeetingsPlugin(): Plugin {
  return {
    name: "backsteros-meetings",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? "";
        const pathname = rawUrl.split("?")[0] ?? "";
        if (!pathname.startsWith("/api/backsteros/meetings")) {
          next();
          return;
        }

        try {
          const config = loadBacksterosConfig();
          const method = (req.method ?? "GET").toUpperCase();
          const listPath = "/api/backsteros/meetings";
          const itemMatch = pathname.match(
            /^\/api\/backsteros\/meetings\/([^/]+)\/?$/,
          );

          let upstreamPath = "/api/v1/meetings";
          if (itemMatch) {
            upstreamPath = `/api/v1/meetings/${decodeURIComponent(itemMatch[1]!)}`;
          } else if (pathname !== listPath && pathname !== `${listPath}/`) {
            next();
            return;
          }

          if (method !== "GET" && method !== "POST" && method !== "PATCH") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }
          if (method === "POST" && itemMatch) {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }
          if (method === "PATCH" && !itemMatch) {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
          }

          const headers: Record<string, string> = {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "application/json",
          };
          let body: string | undefined;
          if (method === "POST" || method === "PATCH") {
            body = await readRequestBody(req);
            headers["Content-Type"] = "application/json";
          }

          const response = await fetch(`${config.baseUrl}${upstreamPath}`, {
            method,
            headers,
            body,
          });
          const text = await response.text();
          res.statusCode = response.status;
          res.setHeader(
            "Content-Type",
            response.headers.get("content-type") || "application/json",
          );
          res.end(text);
        } catch (error) {
          sendJson(res, 503, {
            error:
              error instanceof Error
                ? error.message
                : "BacksterOS unavailable",
          });
        }
      });
    },
  };
}
