export function getPtyWebSocketUrl(options?: {
  cols?: number;
  rows?: number;
  cwd?: string | null;
  sessionId?: string | null;
}): string {
  const base =
    process.env.NEXT_PUBLIC_PTY_WS_URL?.trim() || "ws://127.0.0.1:3101";
  const url = new URL(base);
  if (options?.cols) url.searchParams.set("cols", String(options.cols));
  if (options?.rows) url.searchParams.set("rows", String(options.rows));
  if (options?.cwd) url.searchParams.set("cwd", options.cwd);
  if (options?.sessionId) url.searchParams.set("sessionId", options.sessionId);
  return url.toString();
}
