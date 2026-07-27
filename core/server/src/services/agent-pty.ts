import type { AgentPtyConnection } from "@backsteros/contracts";

export class AgentPtyUnavailableError extends Error {
  readonly code = "agent_pty_unavailable" as const;

  constructor(message: string) {
    super(message);
    this.name = "AgentPtyUnavailableError";
  }
}

/**
 * Brokers Tailscale-reachable PTY connection info for trusted shells.
 * Stream stays on the desktop sidecar; core only discovers URL + token.
 */
export function getAgentPtyConnection(): AgentPtyConnection {
  const publicUrl = (process.env.AGENT_PTY_PUBLIC_URL ?? "").trim();
  const token = (process.env.AGENT_PTY_AUTH_TOKEN ?? "").trim();

  if (!publicUrl || !token) {
    throw new AgentPtyUnavailableError(
      "Agent terminal unavailable — configure AGENT_PTY_PUBLIC_URL and AGENT_PTY_AUTH_TOKEN on core, and run `pnpm pty` with matching PTY_AUTH_TOKEN.",
    );
  }

  let httpOrigin: string;
  try {
    const parsed = new URL(publicUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    httpOrigin = parsed.origin;
  } catch {
    throw new AgentPtyUnavailableError(
      "AGENT_PTY_PUBLIC_URL must be an http(s) origin (e.g. http://macbook.tailnet.ts.net:3101).",
    );
  }

  const wsUrl = httpOrigin.replace(/^http/i, "ws");

  return {
    httpOrigin,
    wsUrl,
    token,
  };
}
