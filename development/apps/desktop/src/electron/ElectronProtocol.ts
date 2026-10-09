// @effect-diagnostics nodeBuiltinImport:off globalFetch:off — BacksterOS desktop proxy reads cli.env and falls back to Node fetch when Electron.net fails for loopback.
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";
import * as Path from "effect/Path";
import * as Mime from "effect/unstable/http/Mime";
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

export class ElectronProtocolRegistrationError extends Schema.TaggedError<ElectronProtocolRegistrationError>()(
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

export class ElectronProtocolUnregistrationError extends Schema.TaggedError<ElectronProtocolUnregistrationError>()(
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

// The scheme either proxies to a dev server (`targetOrigin`) or serves the
// built client from disk (`assetDirectory`). Packaged mode still needs a
// `backendOrigin` so relative `/api/*` fetches (Cursor credits, control API)
// reach the local T3 server instead of falling through to index.html.
export type DesktopProtocolRegistrationInput = {
  readonly scheme: string;
  readonly clerkFrontendApiHostname: string | undefined;
} & (
  | { readonly targetOrigin: URL }
  | {
      readonly assetDirectory: string;
      readonly backendOrigin?: URL;
    }
);

/** Local server HTTP routes that must not be served as SPA assets. */
export function isDesktopBackendApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
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
  // GLTFLoader fetches embedded textures through blob URLs after parsing the model.
  const connectSources = ["'self'", "blob:", "http:", "https:", "ws:", "wss:"];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    `connect-src ${connectSources.join(" ")}`,
    `img-src 'self' ${input.scheme}: blob: data: http: https:`,
    `media-src 'self' ${input.scheme}: blob: http: https:`,
    "style-src 'self' 'unsafe-inline'",
    `font-src 'self' ${input.scheme}: data:`,
    "worker-src 'self' blob:",
    // Document viewers use local Blob URLs and signed assets from runtime environments.
    // HTML viewers retain their own sandbox; the renderer's script policy stays unchanged.
    "frame-src 'self' blob: http: https:",
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
        // Custom schemes skip Chromium's V8 code cache unless they opt in.
        // Dev stays off: Vite serves changing code at stable URLs.
        codeCache: true,
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

/** BDV-37: Files/Documents FS — must not reuse the product/gateway upstream. */
export const BACKSTEROS_LOCAL_CORE_PATH_PREFIX = "/backsteros-local-core";

export function isBacksterosApiPath(pathname: string): boolean {
  return (
    pathname === BACKSTEROS_API_PATH_PREFIX || pathname.startsWith(`${BACKSTEROS_API_PATH_PREFIX}/`)
  );
}

export function isBacksterosLocalCorePath(pathname: string): boolean {
  return (
    pathname === BACKSTEROS_LOCAL_CORE_PATH_PREFIX ||
    pathname.startsWith(`${BACKSTEROS_LOCAL_CORE_PATH_PREFIX}/`)
  );
}

function readBacksterosCliEnvValue(
  key: "BACKSTEROS_API_KEY" | "BACKSTEROS_API_URL" | "BACKSTEROS_LOCAL_CORE_URL",
): string {
  try {
    const filePath = NodePath.join(NodeOs.homedir(), ".config", "backsteros", "cli.env");
    if (!NodeFs.existsSync(filePath)) return "";
    const text = NodeFs.readFileSync(filePath, "utf8");
    const match = new RegExp(`^(?:export\\s+)?${key}=(.+)$`, "m").exec(text);
    return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") || "";
  } catch {
    return "";
  }
}

/** True when origin is Mac local-core (:8788) — never a product/gateway upstream. */
function isBacksterosLocalCoreOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return port === "8788";
  } catch {
    return false;
  }
}

export function resolveBacksterosApiOrigin(env: NodeJS.ProcessEnv = process.env): string {
  // BDV-37: product / gateway only. A stale shell export pointing at local-core
  // (:8788 / docker bridge) must not win over cli.env or the HTTPS gateway.
  for (const candidate of [
    env.BACKSTEROS_API_URL?.trim() || "",
    readBacksterosCliEnvValue("BACKSTEROS_API_URL"),
  ]) {
    if (!candidate) continue;
    const cleaned = candidate.replace(/\/$/, "");
    if (isBacksterosLocalCoreOrigin(cleaned)) continue;
    return cleaned;
  }
  return "https://api.local.backsteros.com";
}

/** Mac local-core for working-copy FS (`/fs/*`, `/docs`). Default loopback :8788. */
export function resolveBacksterosLocalCoreOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.BACKSTEROS_LOCAL_CORE_URL?.trim() || "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fromCli = readBacksterosCliEnvValue("BACKSTEROS_LOCAL_CORE_URL");
  if (fromCli) return fromCli.replace(/\/$/, "");
  return "http://127.0.0.1:8788";
}

function resolveBacksterosApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.BACKSTEROS_API_KEY?.trim() || "";
  if (fromEnv) return fromEnv;

  const fromCli = readBacksterosCliEnvValue("BACKSTEROS_API_KEY");
  if (fromCli) return fromCli;

  // Desktop Dev often inherits a shell without repo env; load `.env` / `.env.local`
  // once so `/backsteros-api` can authorize when process env is unset.
  if (env.T3CODE_DESKTOP_DEV !== "1") return "";
  try {
    const candidates = [
      NodePath.resolve(process.cwd(), ".env.local"),
      NodePath.resolve(process.cwd(), ".env"),
      NodePath.resolve(process.cwd(), "../../.env.local"),
      NodePath.resolve(process.cwd(), "../../.env"),
      NodePath.resolve(process.cwd(), "../.env.local"),
      NodePath.resolve(process.cwd(), "../.env"),
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

function backsterosUnreachableResponse(
  cause: unknown,
  origin: string = resolveBacksterosApiOrigin(),
): Response {
  const detail =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "unknown error";
  return new Response(
    JSON.stringify({
      error: "BacksterOS is unreachable",
      detail,
      origin,
    }),
    {
      status: 502,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function proxyBacksterosRequest(
  request: Request,
  requestUrl: URL,
  contentSecurityPolicy: string,
  options: {
    readonly pathPrefix: string;
    readonly origin: string;
  },
): Promise<Response> {
  const suffix = requestUrl.pathname.slice(options.pathPrefix.length) || "/";
  const targetUrl = `${options.origin}${suffix}${requestUrl.search}`;
  const headers = stripHopByHopHeaders(request.headers);
  // Prefer env/cli owner key over a stale renderer Settings key.
  const apiKey = resolveBacksterosApiKey();
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
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
    return withContentSecurityPolicy(
      backsterosUnreachableResponse(cause, options.origin),
      contentSecurityPolicy,
    );
  }
}

async function proxyBacksterosPathIfNeeded(
  request: Request,
  contentSecurityPolicy: string,
): Promise<Response | null> {
  const requestUrl = new URL(request.url);
  if (requestUrl.host !== DESKTOP_HOST) return null;

  if (isBacksterosApiPath(requestUrl.pathname)) {
    return proxyBacksterosRequest(request, requestUrl, contentSecurityPolicy, {
      pathPrefix: BACKSTEROS_API_PATH_PREFIX,
      origin: resolveBacksterosApiOrigin(),
    });
  }

  if (isBacksterosLocalCorePath(requestUrl.pathname)) {
    return proxyBacksterosRequest(request, requestUrl, contentSecurityPolicy, {
      pathPrefix: BACKSTEROS_LOCAL_CORE_PATH_PREFIX,
      origin: resolveBacksterosLocalCoreOrigin(),
    });
  }

  return null;
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

  const backsterResponse = await proxyBacksterosPathIfNeeded(request, contentSecurityPolicy);
  if (backsterResponse) return backsterResponse;

  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, targetOrigin);
  const headers = stripHopByHopHeaders(request.headers);
  // Localhost control plane (`/api/backsteros/control/*`) accepts either a
  // pairing-session cookie or a BacksterOS API key Bearer. The renderer fetch
  // only sends credentials:include — under t3code-dev:// there is often no
  // pairing cookie, which surfaces as a noisy 401 on bindings sync. When the
  // desktop shell has an owner key (env / ~/.config/backsteros/cli.env), attach
  // it the same way `/backsteros-api` does.
  if (
    requestUrl.pathname === "/api/backsteros/control" ||
    requestUrl.pathname.startsWith("/api/backsteros/control/")
  ) {
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
  const response =
    request.method === "GET" || request.method === "HEAD"
      ? await fetchWithTransientRetry(targetUrl.toString(), init)
      : await Electron.net.fetch(targetUrl.toString(), init);
  return withContentSecurityPolicy(response, contentSecurityPolicy);
}

const TRANSIENT_FETCH_RETRY_DELAYS_MS = [0, 50, 150] as const;

// Serves the packaged web client without a backend: files resolve within the
// asset directory, and any other path falls back to index.html so the SPA
// router handles it, except for asset-shaped misses (`/missing.js`) which 404.
const serveDesktopAsset = Effect.fn("desktop.protocol.serveAsset")(function* (
  request: Request,
  assetDirectory: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const url = new URL(request.url);
  if (url.host !== DESKTOP_HOST) return new Response(null, { status: 404 });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405 });
  }
  const pathname = yield* Effect.try(() => decodeURIComponent(url.pathname)).pipe(
    Effect.orElseSucceed(() => null),
  );
  if (pathname === null || pathname.includes("\0")) return new Response(null, { status: 400 });
  const root = path.resolve(assetDirectory);
  const assetPath = path.resolve(root, `.${pathname}`);
  if (assetPath !== root && !assetPath.startsWith(root + path.sep)) {
    return new Response(null, { status: 404 });
  }
  const stat = yield* fileSystem.stat(assetPath).pipe(Effect.orElseSucceed(() => null));
  let filePath = assetPath;
  if (stat?.type !== "File") {
    const wantsHtml = request.headers.get("accept")?.includes("text/html") ?? false;
    if (path.extname(assetPath) !== "" && !wantsHtml) {
      return new Response(null, { status: 404 });
    }
    filePath = path.join(root, "index.html");
  }
  const contents = yield* fileSystem.readFile(filePath).pipe(Effect.orElseSucceed(() => null));
  if (contents === null) return new Response(null, { status: 404 });
  return new Response(request.method === "HEAD" ? null : new Uint8Array(contents), {
    headers: {
      "content-type": Option.getOrElse(Mime.getType(filePath), () => "application/octet-stream"),
    },
  });
});

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
      const nodeInit: RequestInit = {};
      if (init.method !== undefined) nodeInit.method = init.method;
      if (init.headers !== undefined) nodeInit.headers = init.headers;
      if (method !== "GET" && method !== "HEAD" && init.body != null) {
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

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const registered = yield* Ref.make(false);
  const context = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
  const runPromise = Effect.runPromiseWith(context);

  const registerDesktopProtocol = Effect.fn("desktop.electron.protocol.registerDesktopProtocol")(
    function* (input: DesktopProtocolRegistrationInput) {
      if (yield* Ref.get(registered)) return;

      const contentSecurityPolicy = makeDesktopContentSecurityPolicy(input);

      yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            Electron.protocol.handle(input.scheme, async (request) => {
              const backsterResponse = await proxyBacksterosPathIfNeeded(
                request,
                contentSecurityPolicy,
              );
              if (backsterResponse) return backsterResponse;

              if ("assetDirectory" in input) {
                const requestUrl = new URL(request.url);
                // Bundled clients keep relative `/api/*` URLs (Cursor plan usage,
                // Backster control). Without this hop they resolve to index.html
                // under t3code:// and the sidebar shows "Cursor credits unavailable".
                if (
                  input.backendOrigin &&
                  requestUrl.host === DESKTOP_HOST &&
                  isDesktopBackendApiPath(requestUrl.pathname)
                ) {
                  return proxyRequest(request, input.backendOrigin, contentSecurityPolicy);
                }
                return withContentSecurityPolicy(
                  await runPromise(serveDesktopAsset(request, input.assetDirectory)),
                  contentSecurityPolicy,
                );
              }
              return proxyRequest(request, input.targetOrigin, contentSecurityPolicy);
            });
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
