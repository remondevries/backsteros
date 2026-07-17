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
  type LetterAttachment,
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

async function parseBinaryResponse(response: Response): Promise<Blob> {
  if (response.status === 204 || response.status === 205) {
    return new Blob();
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("json")) {
    const text = await response.text();
    let parsed: unknown = text;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    throw new ApiClientError(response.status || 500, parsed, response.headers);
  }
  // Always read bytes as a Blob so missing/odd Content-Type cannot corrupt images.
  return response.blob();
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

async function rawBinaryRequest(
  options: ApiClientOptions,
  path: string,
  init: RequestInit = {},
): Promise<Blob> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required");
  const headers = await authorizationHeaders(options);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  const response = await fetchImpl(`${trimBaseUrl(options.baseUrl)}${path}`, {
    ...init,
    headers,
    credentials: init.credentials ?? options.credentials,
  });
  if (!response.ok) {
    const parsed = await parseResponse(response);
    throw new ApiClientError(response.status, parsed, response.headers);
  }
  return parseBinaryResponse(response);
}

export type UploadProgressEvent = {
  loaded: number;
  total: number;
  /** 0–1 upload ratio. */
  ratio: number;
};

export type UploadRequestOptions = {
  onProgress?: (event: UploadProgressEvent) => void;
};

function toUploadBody(pdf: Blob | ArrayBuffer): Blob {
  if (typeof Blob !== "undefined" && pdf instanceof Blob) {
    return pdf;
  }
  return new Blob([pdf], { type: "application/pdf" });
}

/**
 * Upload binary with optional progress via XHR (fetch cannot report upload %).
 * Falls back to fetch when XHR is unavailable (e.g. some test environments).
 */
async function uploadBinaryWithProgress(
  options: ApiClientOptions,
  method: "PUT" | "POST",
  path: string,
  body: Blob,
  headersInit: HeadersInit,
  uploadOptions?: UploadRequestOptions,
): Promise<unknown> {
  const onProgress = uploadOptions?.onProgress;
  if (typeof XMLHttpRequest === "undefined") {
    return rawRequest(options, path, {
      method,
      headers: headersInit,
      body,
    });
  }

  const headers = await authorizationHeaders(options);
  new Headers(headersInit).forEach((value, name) => headers.set(name, value));
  const url = `${trimBaseUrl(options.baseUrl)}${path}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (options.credentials === "include") {
      xhr.withCredentials = true;
    }
    headers.forEach((value, name) => {
      xhr.setRequestHeader(name, value);
    });

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) {
          onProgress({ loaded: event.loaded, total: 0, ratio: 0 });
          return;
        }
        onProgress({
          loaded: event.loaded,
          total: event.total,
          ratio: Math.min(1, event.loaded / event.total),
        });
      };
    }

    xhr.onload = () => {
      const responseHeaders = new Headers();
      const rawHeaders = xhr.getAllResponseHeaders().trim();
      if (rawHeaders) {
        for (const line of rawHeaders.split(/[\r\n]+/)) {
          const separator = line.indexOf(":");
          if (separator > 0) {
            responseHeaders.set(
              line.slice(0, separator).trim(),
              line.slice(separator + 1).trim(),
            );
          }
        }
      }

      const contentType =
        responseHeaders.get("content-type")?.toLowerCase() ?? "";
      let parsed: unknown = undefined;
      if (xhr.status !== 204 && xhr.status !== 205 && xhr.responseText) {
        if (contentType.includes("json")) {
          try {
            parsed = JSON.parse(xhr.responseText);
          } catch {
            parsed = xhr.responseText;
          }
        } else {
          parsed = xhr.responseText;
        }
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiClientError(xhr.status, parsed, responseHeaders));
        return;
      }
      onProgress?.({ loaded: body.size, total: body.size, ratio: 1 });
      resolve(parsed);
    };

    xhr.onerror = () => {
      reject(
        new ApiClientError(
          0,
          { error: "Network error during upload." },
          new Headers(),
        ),
      );
    };
    xhr.onabort = () => {
      reject(
        new ApiClientError(0, { error: "Upload aborted." }, new Headers()),
      );
    };

    xhr.send(body);
  });
}

async function putBinaryWithProgress(
  options: ApiClientOptions,
  path: string,
  body: Blob,
  headersInit: HeadersInit,
  uploadOptions?: UploadRequestOptions,
): Promise<unknown> {
  return uploadBinaryWithProgress(
    options,
    "PUT",
    path,
    body,
    headersInit,
    uploadOptions,
  );
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
  uploadLetterPdf(
    id: string,
    pdf: Blob | ArrayBuffer,
    filename?: string,
    options?: UploadRequestOptions,
  ): Promise<Letter>;
  downloadLetterPdf(id: string): Promise<Blob>;
  listLetterAttachments(id: string): Promise<{ attachments: LetterAttachment[] }>;
  uploadLetterAttachment(
    id: string,
    pdf: Blob | ArrayBuffer,
    filename?: string,
    options?: UploadRequestOptions,
  ): Promise<LetterAttachment>;
  downloadLetterAttachment(id: string, attachmentId: string): Promise<Blob>;
  updateLetterAttachment(
    id: string,
    attachmentId: string,
    input: { originalFilename: string },
  ): Promise<LetterAttachment>;
  deleteLetterAttachment(id: string, attachmentId: string): Promise<LetterAttachment>;
  uploadAvatar(
    entityType: string,
    entityId: string,
    image: Blob | ArrayBuffer,
    contentType?: string,
  ): Promise<Avatar>;
  downloadAvatar(entityType: string, entityId: string): Promise<Blob>;
  deleteAvatar(entityType: string, entityId: string): Promise<Avatar>;
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
    rawBinaryRequest(normalized, path, init);

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
    uploadLetterPdf: (id, pdf, filename, uploadOptions) =>
      putBinaryWithProgress(
        normalized,
        `/api/v1/letters/${encodeURIComponent(id)}/pdf`,
        toUploadBody(pdf),
        {
          "content-type": "application/pdf",
          ...(filename ? { "x-filename": filename } : {}),
        },
        uploadOptions,
      ) as Promise<Letter>,
    downloadLetterPdf: (id) =>
      requestBinary(`/api/v1/letters/${encodeURIComponent(id)}/pdf`),
    listLetterAttachments: async (id) => {
      try {
        return (await requestJson(
          `/api/v1/letters/${encodeURIComponent(id)}/attachments`,
        )) as { attachments: LetterAttachment[] };
      } catch (error) {
        // Older API builds don't expose /attachments yet — treat as empty.
        if (error instanceof ApiClientError && error.status === 404) {
          return { attachments: [] };
        }
        throw error;
      }
    },
    uploadLetterAttachment: (id, pdf, filename, uploadOptions) =>
      uploadBinaryWithProgress(
        normalized,
        "POST",
        `/api/v1/letters/${encodeURIComponent(id)}/attachments`,
        toUploadBody(pdf),
        {
          "content-type": "application/pdf",
          ...(filename ? { "x-filename": filename } : {}),
        },
        uploadOptions,
      ) as Promise<LetterAttachment>,
    downloadLetterAttachment: (id, attachmentId) =>
      requestBinary(
        `/api/v1/letters/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
      ),
    updateLetterAttachment: (id, attachmentId, input) =>
      requestJson<LetterAttachment>(
        `/api/v1/letters/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
    deleteLetterAttachment: (id, attachmentId) =>
      requestJson<LetterAttachment>(
        `/api/v1/letters/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
        { method: "DELETE" },
      ),
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
    deleteAvatar: (entityType, entityId) =>
      requestJson<Avatar>(
        `/api/v1/avatars/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
        { method: "DELETE" },
      ),
  };
}
