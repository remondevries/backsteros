import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Map dynamic proxy failures to a Hono-typed HTTP status. */
export function proxyErrorStatus(status: number): ContentfulStatusCode {
  const code = status >= 400 && status <= 599 ? status : 502;
  return code as ContentfulStatusCode;
}
