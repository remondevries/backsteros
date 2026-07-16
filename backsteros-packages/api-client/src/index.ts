import {
  initClient,
  type ApiFetcher,
  type ApiFetcherArgs,
  type InitClientReturn,
} from "@ts-rest/core";
import {
  apiContract,
  type ApiContract,
  type Avatar,
  type Letter,
  type PowerSyncCredentials,
  type PowerSyncWriteInput,
} from "@backsteros/contracts";

export type TokenProvider = () => string | null | undefined | Promise<string | null | undefined>;

export type ClerkTokenGetter<TOptions = never> = (
  options?: TOptions,
) => Promise<string | null>;

export function createClerkTokenProvider<TOptions = never>(
  getToken: ClerkTokenGetter<TOptions>,
  options?: TOptions,
): TokenProvider {
  return () => getToken(options);
}

export type ApiClientOptions = {
  baseUrl: string;
  getToken?: TokenProvider;
  fetch?: typeof globalThis.fetch;
  credentials?: RequestCredentials;
  defaultHeaders?: HeadersInit;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly body: unknown;
  readonly headers: Headers;

  constructor(status: number, body: unknown, headers: Headers) {
    const message =
      isErrorBody(body) && body.error
        ? body.error
        : `BacksterOS API request failed with status ${status}`;
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = isErrorBody(body) && typeof body.code === "string" ? body.code : undefined;
    this.details = isErrorBody(body) ? body.details : undefined;
    this.body = body;
    this.headers = headers;
  }
}

function isErrorBody(value: unknown): value is {
  error: string;
  code?: string;
  details?: unknown;
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      "error" in value &&
      typeof (value as { error?: unknown }).error === "string",
  );
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function isBinaryBody(value: unknown): value is BodyInit {
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== "undefined" && value instanceof Blob) ||
    (typeof FormData !== "undefined" && value instanceof FormData) ||
    (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams)
  );
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("json")) {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (
    contentType.startsWith("application/pdf") ||
    contentType.startsWith("image/") ||
    contentType.startsWith("application/octet-stream")
  ) {
    return response.blob();
  }
  return response.text();
}

async function authorizationHeaders(options: ApiClientOptions): Promise<Headers> {
  const headers = new Headers(options.defaultHeaders);
  const token = await options.getToken?.();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

function createFetcher(options: ApiClientOptions): ApiFetcher {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required");

  return async (args: ApiFetcherArgs) => {
    const headers = await authorizationHeaders(options);
    for (const [name, value] of Object.entries(args.headers)) {
      if (value !== undefined) headers.set(name, value);
    }

    const body = isBinaryBody(args.rawBody) ? args.rawBody : args.body;
    const response = await fetchImpl(args.path, {
      ...args.fetchOptions,
      method: args.method,
      headers,
      body: body as BodyInit | null | undefined,
      credentials: args.fetchOptions?.credentials ?? options.credentials,
    });
    const parsed = await parseResponse(response);
    if (!response.ok) throw new ApiClientError(response.status, parsed, response.headers);
    return { status: response.status, body: parsed, headers: response.headers };
  };
}

async function rawRequest(
  options: ApiClientOptions,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required");
  const headers = await authorizationHeaders(options);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  const response = await fetchImpl(`${trimBaseUrl(options.baseUrl)}${path}`, {
    ...init,
    headers,
    credentials: init.credentials ?? options.credentials,
  });
  const parsed = await parseResponse(response);
  if (!response.ok) throw new ApiClientError(response.status, parsed, response.headers);
  return parsed;
}

export type BacksterosApiClient = {
  contract: InitClientReturn<ApiContract, {
    baseUrl: string;
    api: ApiFetcher;
  }>;
  requestJson<T>(path: string, init?: RequestInit): Promise<T>;
  requestBinary(path: string, init?: RequestInit): Promise<Blob>;
  getPowerSyncCredentials(): Promise<PowerSyncCredentials>;
  writePowerSync(input: PowerSyncWriteInput): Promise<{ ok: true }>;
  uploadLetterPdf(id: string, pdf: Blob | ArrayBuffer, filename?: string): Promise<Letter>;
  downloadLetterPdf(id: string): Promise<Blob>;
  uploadAvatar(
    entityType: string,
    entityId: string,
    image: Blob | ArrayBuffer,
    contentType?: string,
  ): Promise<Avatar>;
  downloadAvatar(entityType: string, entityId: string): Promise<Blob>;
};

export function createApiClient(options: ApiClientOptions): BacksterosApiClient {
  const normalized = { ...options, baseUrl: trimBaseUrl(options.baseUrl) };
  const fetcher = createFetcher(normalized);
  const contract = initClient(apiContract, {
    baseUrl: normalized.baseUrl,
    api: fetcher,
  });
  const requestJson = <T>(path: string, init?: RequestInit) =>
    rawRequest(normalized, path, init) as Promise<T>;
  const requestBinary = (path: string, init?: RequestInit) =>
    rawRequest(normalized, path, init) as Promise<Blob>;

  return {
    contract,
    requestJson,
    requestBinary,
    getPowerSyncCredentials: () =>
      requestJson<PowerSyncCredentials>("/api/v1/powersync/token"),
    writePowerSync: (input) =>
      requestJson<{ ok: true }>("/api/v1/powersync/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    uploadLetterPdf: (id, pdf, filename) =>
      requestJson<Letter>(`/api/v1/letters/${encodeURIComponent(id)}/pdf`, {
        method: "PUT",
        headers: {
          "content-type": "application/pdf",
          ...(filename ? { "x-filename": filename } : {}),
        },
        body: pdf,
      }),
    downloadLetterPdf: (id) =>
      requestBinary(`/api/v1/letters/${encodeURIComponent(id)}/pdf`),
    uploadAvatar: (entityType, entityId, image, contentType) =>
      requestJson<Avatar>(
        `/api/v1/avatars/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
        {
          method: "PUT",
          headers: { "content-type": contentType ?? "application/octet-stream" },
          body: image,
        },
      ),
    downloadAvatar: (entityType, entityId) =>
      requestBinary(
        `/api/v1/avatars/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
      ),
  };
}
