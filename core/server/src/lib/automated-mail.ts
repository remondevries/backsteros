/**
 * Shared auto-reply / bounce detection for email-thread retriage and ticket
 * status moves (OS-187 / OS-195). Never bounce Waiting/Done on out-of-office.
 */

export type AutomatedMailHeaders =
  | Array<{ name: string; value: string }>
  | Record<string, string>
  | null
  | undefined;

export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  const raw = (match?.[1] ?? from).trim().toLowerCase();
  return raw.includes("@") ? raw : raw;
}

function headerMap(headers: AutomatedMailHeaders): Map<string, string> {
  const out = new Map<string, string>();
  if (!headers) return out;
  if (Array.isArray(headers)) {
    for (const row of headers) {
      const name = row.name?.trim().toLowerCase();
      if (!name) continue;
      out.set(name, row.value ?? "");
    }
    return out;
  }
  for (const [name, value] of Object.entries(headers)) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    out.set(key, value ?? "");
  }
  return out;
}

function isMailerDaemonLocal(local: string): boolean {
  return (
    local === "mailer-daemon" ||
    local === "postmaster" ||
    local.startsWith("mailer-daemon+") ||
    local.startsWith("postmaster+")
  );
}

/**
 * Auto-replies and bounces must not move thread/ticket status.
 * Checks Auto-Submitted, X-Autoreply/X-Autorespond, Precedence, Return-Path,
 * and mailer-daemon/postmaster senders.
 */
export function isAutomatedMailSkipStatus(input: {
  from: string;
  headers?: AutomatedMailHeaders;
}): boolean {
  const fromEmail = extractEmailAddress(input.from);
  const local = fromEmail.split("@")[0] ?? "";
  if (isMailerDaemonLocal(local)) return true;

  const headers = headerMap(input.headers);
  const autoSubmitted = headers.get("auto-submitted")?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (headers.has("x-autoreply") || headers.has("x-autorespond")) return true;
  const precedence = headers.get("precedence")?.trim().toLowerCase();
  if (
    precedence === "bulk" ||
    precedence === "auto_reply" ||
    precedence === "junk"
  ) {
    return true;
  }
  const returnPath = headers.get("return-path")?.trim() ?? "";
  if (returnPath) {
    const returnEmail = extractEmailAddress(returnPath);
    const returnLocal = returnEmail.split("@")[0] ?? "";
    if (isMailerDaemonLocal(returnLocal)) return true;
  }
  return false;
}
