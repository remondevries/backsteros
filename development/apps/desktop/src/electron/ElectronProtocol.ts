import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";

import * as Electron from "electron";

export const DESKTOP_HOST = "app";
const DESKTOP_PRODUCTION_SCHEME = "t3code";
const DESKTOP_DEVELOPMENT_SCHEME = "t3code-dev";

export function getDesktopScheme(isDevelopment: boolean): string {
  return isDevelopment ? DESKTOP_DEVELOPMENT_SCHEME : DESKTOP_PRODUCTION_SCHEME;
}

function getDesktopOrigin(isDevelopment: boolean): string {
  return `${getDesktopScheme(isDevelopment)}://${DESKTOP_HOST}`;
}

export function getDesktopUrl(isDevelopment: boolean): string {
  return `${getDesktopOrigin(isDevelopment)}/`;
}

export class ElectronProtocolRegistrationError extends Schema.TaggedErrorClass<ElectronProtocolRegistrationError>()(
  "ElectronProtocolRegistrationError",
  {
    scheme: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to register Electron protocol scheme "${this.scheme}".`;
  }
}

export class ElectronProtocolUnregistrationError extends Schema.TaggedErrorClass<ElectronProtocolUnregistrationError>()(
  "ElectronProtocolUnregistrationError",
  {
    scheme: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to unregister Electron protocol scheme "${this.scheme}".`;
  }
}

export interface DesktopProtocolRegistrationInput {
  readonly scheme: string;
  readonly targetOrigin: URL;
  readonly backendOrigin: URL;
  readonly clerkFrontendApiHostname: string | undefined;
}

export class ElectronProtocol extends Context.Service<
  ElectronProtocol,
  {
    readonly registerDesktopProtocol: (
      input: DesktopProtocolRegistrationInput,
    ) => Effect.Effect<void, ElectronProtocolRegistrationError, Scope.Scope>;
  }
>()("@t3tools/desktop/electron/ElectronProtocol") {}

export function makeDesktopContentSecurityPolicy(input: DesktopProtocolRegistrationInput): string {
  const clerkOrigin = input.clerkFrontendApiHostname
    ? `https://${input.clerkFrontendApiHostname}`
    : undefined;
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    ...(clerkOrigin ? [clerkOrigin] : []),
    "https://challenges.cloudflare.com",
  ];

  // The renderer connects directly to user-configured environments in addition to
  // the build-configured Clerk, relay, and OTLP endpoints. Those environment
  // origins are not known when this response policy is created, so restrict
  // connections by the network schemes the client supports instead of by host.
  const connectSources = ["'self'", "http:", "https:", "ws:", "wss:"];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    `connect-src ${connectSources.join(" ")}`,
    `img-src 'self' ${input.scheme}: blob: data: http: https:`,
    `media-src 'self' ${input.scheme}: blob: http: https:`,
    "style-src 'self' 'unsafe-inline'",
    `font-src 'self' ${input.scheme}: data:`,
    "worker-src 'self' blob:",
    "frame-src 'self' https://challenges.cloudflare.com",
    "form-action 'self'",
  ].join("; ");
}

function withContentSecurityPolicy(response: Response, policy: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", policy);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Must run synchronously during process bootstrap, before Electron emits `ready`.
 */
function registerDesktopSchemePrivilegesSync(): void {
  Electron.protocol.registerSchemesAsPrivileged([
    {
      scheme: DESKTOP_PRODUCTION_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
    {
      scheme: DESKTOP_DEVELOPMENT_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

const registerDesktopSchemePrivileges = Effect.sync(registerDesktopSchemePrivilegesSync).pipe(
  Effect.withSpan("desktop.electron.protocol.registerSchemePrivileges"),
);

export const layerSchemePrivileges = Layer.effectDiscard(registerDesktopSchemePrivileges);

/** Same prefix as Vite `server.proxy` and the web BacksterOS client. */
export const BACKSTEROS_API_PATH_PREFIX = "/backsteros-api";

export function isBacksterosApiPath(pathname: string): boolean {
  return (
    pathname === BACKSTEROS_API_PATH_PREFIX || pathname.startsWith(`${BACKSTEROS_API_PATH_PREFIX}/`)
  );
}

export function resolveBacksterosApiOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return (env.BACKSTEROS_API_URL?.trim() || "http://127.0.0.1:8788").replace(/\/$/, "");
}

function resolveBacksterosApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.BACKSTEROS_API_KEY?.trim() || "";
  if (fromEnv) return fromEnv;

  // Desktop Dev often inherits a shell without `.env.local`; load it once so
  // `/backsteros-api` proxy can authorize against local-core.
  if (env.T3CODE_DESKTOP_DEV !== "1") return "";
  try {
    const candidates = [
      NodePath.resolve(process.cwd(), ".env.local"),
      NodePath.resolve(process.cwd(), "../../.env.local"),
      NodePath.resolve(process.cwd(), "../.env.local"),
    ];
    for (const filePath of candidates) {
      if (!NodeFs.existsSync(filePath)) continue;
      const text = NodeFs.readFileSync(filePath, "utf8");
      const match = /^BACKSTEROS_API_KEY=(.+)$/m.exec(text);
      const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, "");
      if (value) return value;
    }
  } catch {
    // Ignore — caller falls through to unauthenticated proxy.
  }
  return "";
}

function stripHopByHopHeaders(headers: Headers): Headers {
  const next = new Headers(headers);
  const headersToRemove: string[] = [];
  for (const name of next.keys()) {
    if (
      name === "host" ||
      name === "origin" ||
      name === "referer" ||
      name === "connection" ||
      name === "content-length" ||
      name === "accept-encoding" ||
      name === "upgrade-insecure-requests" ||
      name.startsWith("sec-fetch-")
    ) {
      headersToRemove.push(name);
    }
  }
  for (const name of headersToRemove) {
    next.delete(name);
  }
  return next;
}

function backsterosUnreachableResponse(cause: unknown): Response {
  const detail =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "unknown error";
  return new Response(
    JSON.stringify({
      error: "BacksterOS is unreachable",
      detail,
      origin: resolveBacksterosApiOrigin(),
    }),
    {
      status: 502,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/**
 * Prefer Chromium `net.fetch` (matches browser cookies / session). If that
 * fails to reach local-core — common after core restarts or under Chromium
 * loopback quirks — fall back to Node's fetch.
 */
async function fetchBacksterosUpstream(
  targetUrl: string,
  init: RequestInit,
  method: string,
): Promise<Response> {
  try {
    return method === "GET" || method === "HEAD"
      ? await fetchWithTransientRetry(targetUrl, init)
      : await Electron.net.fetch(targetUrl, init);
  } catch (electronError) {
    try {
      const nodeInit: RequestInit = {
        method: init.method,
        headers: init.headers,
      };
      if (method !== "GET" && method !== "HEAD" && init.body != null) {
        // Body may already be a locked stream after Electron.net.fetch; buffer if needed.
        if (init.body instanceof ReadableStream) {
          nodeInit.body = await new Response(init.body).arrayBuffer();
        } else {
          nodeInit.body = init.body;
        }
      }
      return await fetch(targetUrl, nodeInit);
    } catch {
      throw electronError;
    }
  }
}

/**
 * Packaged desktop has no Vite proxy. Without this, `/backsteros-api/*` is
 * forwarded to the T3 static host and returns `index.html` (JSON parse errors).
 */
async function proxyBacksterosRequest(
  request: Request,
  requestUrl: URL,
  contentSecurityPolicy: string,
): Promise<Response> {
  const suffix = requestUrl.pathname.slice(BACKSTEROS_API_PATH_PREFIX.length) || "/";
  const targetUrl = `${resolveBacksterosApiOrigin()}${suffix}${requestUrl.search}`;
  const headers = stripHopByHopHeaders(request.headers);
  if (!headers.get("authorization")) {
    const apiKey = resolveBacksterosApiKey();
    if (apiKey) {
      headers.set("Authorization", `Bearer ${apiKey}`);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    (init as RequestInit & { duplex: "half" }).duplex = "half";
  }

  try {
    const response = await fetchBacksterosUpstream(targetUrl, init, request.method);
    return withContentSecurityPolicy(response, contentSecurityPolicy);
  } catch (cause) {
    return withContentSecurityPolicy(backsterosUnreachableResponse(cause), contentSecurityPolicy);
  }
}

async function proxyRequest(
  request: Request,
  targetOrigin: URL,
  contentSecurityPolicy: string,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  if (requestUrl.host !== DESKTOP_HOST) {
    return new Response(null, { status: 404 });
  }

  if (isBacksterosApiPath(requestUrl.pathname)) {
    return proxyBacksterosRequest(request, requestUrl, contentSecurityPolicy);
  }

  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, targetOrigin);
  const headers = stripHopByHopHeaders(request.headers);
  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    (init as RequestInit & { duplex: "half" }).duplex = "half";
  }
  const response =
    request.method === "GET" || request.method === "HEAD"
      ? await fetchWithTransientRetry(targetUrl.toString(), init)
      : await Electron.net.fetch(targetUrl.toString(), init);
  return withContentSecurityPolicy(response, contentSecurityPolicy);
}

const TRANSIENT_FETCH_RETRY_DELAYS_MS = [0, 50, 150] as const;

async function fetchWithTransientRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (const delayMs of TRANSIENT_FETCH_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await NodeTimersPromises.setTimeout(delayMs);
    }

    try {
      return await Electron.net.fetch(url, init);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const registered = yield* Ref.make(false);

  const registerDesktopProtocol = Effect.fn("desktop.electron.protocol.registerDesktopProtocol")(
    function* (input: DesktopProtocolRegistrationInput) {
      if (yield* Ref.get(registered)) return;

      const contentSecurityPolicy = makeDesktopContentSecurityPolicy(input);

      yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            Electron.protocol.handle(input.scheme, (request) =>
              proxyRequest(request, input.targetOrigin, contentSecurityPolicy),
            );
          },
          catch: (cause) => new ElectronProtocolRegistrationError({ scheme: input.scheme, cause }),
        }).pipe(Effect.andThen(Ref.set(registered, true))),
        () =>
          Effect.try({
            try: () => Electron.protocol.unhandle(input.scheme),
            catch: (cause) =>
              new ElectronProtocolUnregistrationError({
                scheme: input.scheme,
                cause,
              }),
          }).pipe(Effect.andThen(Ref.set(registered, false)), Effect.orDie),
      );
    },
  );

  return ElectronProtocol.of({ registerDesktopProtocol });
});

export const layer = Layer.effect(ElectronProtocol, make);
