/**
 * Dev-only Vite middleware: serve vault-relative files for browser `dev:vite`
 * so Spaces/journal/letter bodies can open without Tauri FS or cloud REST.
 *
 * GET /__backsteros_vault__/Spaces/support/portal/email/overview.md
 */
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const VAULT_URL_PREFIX = "/__backsteros_vault__/";

function readEnvVaultPath(envFile: string): string | null {
  try {
    const raw = fs.readFileSync(envFile, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^BACKSTEROS_VAULT_PATH\s*=\s*(.*)$/);
      if (!match) continue;
      let value = match[1]!.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value.trim() || null;
    }
  } catch {
    // missing file
  }
  return null;
}

function resolveDevVaultRoot(desktopRoot: string): string | null {
  const fromEnv = process.env.BACKSTEROS_VAULT_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return path.resolve(fromEnv);

  const coreEnv = path.resolve(desktopRoot, "../core/server/.env");
  const fromCore = readEnvVaultPath(coreEnv);
  if (fromCore && fs.existsSync(fromCore)) return path.resolve(fromCore);

  return null;
}

function safeJoinVault(root: string, relativeUrlPath: string): string | null {
  const decoded = relativeUrlPath
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .filter(Boolean)
    .join("/");
  if (!decoded || decoded.includes("..") || path.isAbsolute(decoded)) {
    return null;
  }
  const absolute = path.resolve(root, decoded);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) {
    return null;
  }
  return absolute;
}

export function backsterosVaultDevPlugin(desktopRoot: string): Plugin {
  let vaultRoot: string | null = null;

  return {
    name: "backsteros-vault-dev",
    configureServer(server) {
      vaultRoot = resolveDevVaultRoot(desktopRoot);
      if (vaultRoot) {
        console.info(`[vault-dev] serving ${vaultRoot} at ${VAULT_URL_PREFIX}`);
      } else {
        console.warn(
          "[vault-dev] BACKSTEROS_VAULT_PATH not found — browser vault reads disabled",
        );
      }

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith(VAULT_URL_PREFIX)) {
          next();
          return;
        }
        if (!vaultRoot) {
          res.statusCode = 404;
          res.end("vault not configured");
          return;
        }
        const relative = url.slice(VAULT_URL_PREFIX.length).split("?")[0] ?? "";
        const absolute = safeJoinVault(vaultRoot, relative);
        if (!absolute) {
          res.statusCode = 400;
          res.end("invalid path");
          return;
        }
        fs.readFile(absolute, (error, data) => {
          if (error) {
            res.statusCode = error.code === "ENOENT" ? 404 : 500;
            res.end(error.code === "ENOENT" ? "not found" : "read error");
            return;
          }
          const lower = absolute.toLowerCase();
          const type = lower.endsWith(".pdf")
            ? "application/pdf"
            : lower.endsWith(".md")
              ? "text/markdown; charset=utf-8"
              : "application/octet-stream";
          res.setHeader("Content-Type", type);
          res.setHeader("Cache-Control", "no-store");
          res.end(data);
        });
      });
    },
  };
}

export const BACKSTEROS_VAULT_DEV_PREFIX = VAULT_URL_PREFIX;
