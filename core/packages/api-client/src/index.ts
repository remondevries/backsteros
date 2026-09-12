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
  type FinancialImportResult,
  type Letter,
  type LetterAttachment,
  type PowerSyncCredentials,
  type PowerSyncWriteInput,
  type TaskAttachment,
  type TaskImage,
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
    super(formatApiErrorMessage(status, body));
    this.name = "ApiClientError";
    this.status = status;
    this.code = isErrorBody(body) && typeof body.code === "string" ? body.code : undefined;
    this.details = isErrorBody(body)
      ? body.details
      : zodValidationIssues(body) ?? undefined;
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

/** Hono `@hono/zod-validator` default failure body. */
function zodValidationIssues(body: unknown): Array<{ path: string; message: string }> | null {
  if (!body || typeof body !== "object") return null;
  if ((body as { success?: unknown }).success !== false) return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return null;
  const formatted: Array<{ path: string; message: string }> = [];
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const message =
      typeof (issue as { message?: unknown }).message === "string"
        ? (issue as { message: string }).message
        : "Invalid";
    const pathParts = Array.isArray((issue as { path?: unknown }).path)
      ? (issue as { path: unknown[] }).path
      : [];
    formatted.push({
      path: pathParts.map(String).join("."),
      message,
    });
  }
  return formatted.length > 0 ? formatted : null;
}

function formatApiErrorMessage(status: number, body: unknown): string {
  if (isErrorBody(body) && body.error) return body.error;
  const issues = zodValidationIssues(body);
  if (issues) {
    return issues
      .map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message))
      .join("; ");
  }
  return `BacksterOS API request failed with status ${status}`;
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

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (!signal?.aborted) return;
  // Prefer DOMException so callers can treat this like fetch's AbortError.
  if (typeof DOMException === "function") {
    throw new DOMException("Aborted", "AbortError");
  }
  const error = new Error("Aborted");
  error.name = "AbortError";
  throw error;
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
    // Token resolve can outlive a React effect cleanup; bail before fetch so
    // aborted loads reject as AbortError instead of WebKit's opaque "Load failed".
    const timedFetchOptions = withRequestTimeout(args.fetchOptions);
    throwIfAborted(timedFetchOptions.signal);
    const response = await fetchImpl(args.path, {
      ...timedFetchOptions,
      method: args.method,
      headers,
      body: body as BodyInit | null | undefined,
      credentials: timedFetchOptions.credentials ?? options.credentials,
    });
    const parsed = await parseResponse(response);
    if (!response.ok) throw new ApiClientError(response.status, parsed, response.headers);
    return { status: response.status, body: parsed, headers: response.headers };
  };
}

const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  if (
    typeof AbortSignal !== "undefined" &&
    "timeout" in AbortSignal &&
    typeof (AbortSignal as typeof AbortSignal & {
      timeout: (ms: number) => AbortSignal;
    }).timeout === "function"
  ) {
    return (
      AbortSignal as typeof AbortSignal & {
        timeout: (ms: number) => AbortSignal;
      }
    ).timeout(timeoutMs);
  }
  // WebKit / older runtimes: AbortSignal.timeout is missing — without a
  // fallback, hung HTTP/1.1 slots (SSE filling the 6-conn pool) never abort.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      typeof DOMException === "function"
        ? new DOMException(`Timeout after ${timeoutMs}ms`, "TimeoutError")
        : new Error(`Timeout after ${timeoutMs}ms`),
    );
  }, timeoutMs);
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
    },
    { once: true },
  );
  return controller.signal;
}

function mergeAbortSignals(
  userSignal: AbortSignal | null | undefined,
  timeoutMs: number,
): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined") return userSignal ?? undefined;
  const timeoutSignal = createTimeoutSignal(timeoutMs);
  if (!userSignal) return timeoutSignal;
  if ("any" in AbortSignal) {
    return (AbortSignal as typeof AbortSignal & {
      any: (signals: AbortSignal[]) => AbortSignal;
    }).any([userSignal, timeoutSignal]);
  }
  // No AbortSignal.any — abort the shared controller when either fires.
  const controller = new AbortController();
  const forward = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  if (userSignal.aborted || timeoutSignal.aborted) {
    forward();
    return controller.signal;
  }
  userSignal.addEventListener("abort", forward, { once: true });
  timeoutSignal.addEventListener("abort", forward, { once: true });
  return controller.signal;
}

function withRequestTimeout(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    signal: mergeAbortSignals(init.signal, DEFAULT_REQUEST_TIMEOUT_MS),
  };
}

async function rawRequest(
  options: ApiClientOptions,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required");
  // Token resolve can outlive a React effect cleanup; bail before fetch so
  // aborted loads reject as AbortError instead of WebKit's opaque "Load failed".
  const headers = await authorizationHeaders(options);
  const timedInit = withRequestTimeout(init);
  throwIfAborted(timedInit.signal);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  // JSON string bodies from `requestJson` callers often omit Content-Type;
  // without it Hono leaves `c.req.valid("json")` empty and PATCHes no-op.
  if (
    typeof timedInit.body === "string" &&
    timedInit.body.length > 0 &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }
  const response = await fetchImpl(`${trimBaseUrl(options.baseUrl)}${path}`, {
    ...timedInit,
    headers,
    credentials: timedInit.credentials ?? options.credentials,
  });
  const parsed = await parseResponse(response);
  if (!response.ok) throw new ApiClientError(response.status, parsed, response.headers);
  return parsed;
}

async function rawStreamRequest(
  options: ApiClientOptions,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required");
  const headers = await authorizationHeaders(options);
  throwIfAborted(init.signal);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  if (!headers.has("accept")) {
    headers.set("accept", "text/event-stream");
  }
  const response = await fetchImpl(`${trimBaseUrl(options.baseUrl)}${path}`, {
    ...init,
    headers,
    credentials: init.credentials ?? options.credentials,
  });
  if (!response.ok) {
    const parsed = await parseResponse(response);
    throw new ApiClientError(response.status, parsed, response.headers);
  }
  return response;
}

async function rawBinaryRequest(
  options: ApiClientOptions,
  path: string,
  init: RequestInit = {},
): Promise<Blob> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("A fetch implementation is required");
  const headers = await authorizationHeaders(options);
  const timedInit = withRequestTimeout(init);
  throwIfAborted(timedInit.signal);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  const response = await fetchImpl(`${trimBaseUrl(options.baseUrl)}${path}`, {
    ...timedInit,
    headers,
    credentials: timedInit.credentials ?? options.credentials,
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
  /** Long-lived fetch (SSE). Does not apply the default request timeout. */
  requestStream(path: string, init?: RequestInit): Promise<Response>;
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
  reorderLetterAttachments(
    id: string,
    orderedIds: string[],
  ): Promise<{ attachments: LetterAttachment[] }>;
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
  uploadTaskImage(
    taskId: string,
    image: Blob | ArrayBuffer,
    filename?: string,
    contentType?: string,
  ): Promise<TaskImage>;
  downloadTaskImage(taskId: string, imageId: string): Promise<Blob>;
  listTaskAttachments(
    taskId: string,
  ): Promise<{ attachments: TaskAttachment[] }>;
  uploadTaskAttachment(
    taskId: string,
    file: Blob | ArrayBuffer,
    filename?: string,
    options?: UploadRequestOptions,
  ): Promise<TaskAttachment>;
  reorderTaskAttachments(
    taskId: string,
    orderedIds: string[],
  ): Promise<{ attachments: TaskAttachment[] }>;
  downloadTaskAttachment(taskId: string, attachmentId: string): Promise<Blob>;
  updateTaskAttachment(
    taskId: string,
    attachmentId: string,
    input: { originalFilename: string },
  ): Promise<TaskAttachment>;
  deleteTaskAttachment(
    taskId: string,
    attachmentId: string,
  ): Promise<TaskAttachment>;
  uploadBankAccountCsv(
    bankAccountId: string,
    csv: Blob | ArrayBuffer,
    filename?: string,
    options?: UploadRequestOptions,
  ): Promise<FinancialImportResult>;
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
  const requestStream = (path: string, init?: RequestInit) =>
    rawStreamRequest(normalized, path, init);

  return {
    contract,
    requestJson,
    requestBinary,
    requestStream,
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
    reorderLetterAttachments: (id, orderedIds) =>
      requestJson<{ attachments: LetterAttachment[] }>(
        `/api/v1/letters/${encodeURIComponent(id)}/attachments/reorder`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        },
      ),
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
    uploadTaskImage: (taskId, image, filename, contentType) =>
      requestJson<TaskImage>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/images`,
        {
          method: "POST",
          headers: {
            "content-type": contentType ?? "application/octet-stream",
            ...(filename ? { "x-filename": filename } : {}),
          },
          body: image,
        },
      ),
    downloadTaskImage: (taskId, imageId) =>
      requestBinary(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(imageId)}`,
      ),
    listTaskAttachments: (taskId) =>
      requestJson<{ attachments: TaskAttachment[] }>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/attachments`,
      ),
    uploadTaskAttachment: (taskId, file, filename, uploadOptions) => {
      const body =
        typeof Blob !== "undefined" && file instanceof Blob
          ? file
          : new Blob([file], { type: "application/octet-stream" });
      const contentType =
        body.type && body.type !== ""
          ? body.type
          : "application/octet-stream";
      return uploadBinaryWithProgress(
        normalized,
        "POST",
        `/api/v1/tasks/${encodeURIComponent(taskId)}/attachments`,
        body,
        {
          "content-type": contentType,
          ...(filename ? { "x-filename": filename } : {}),
        },
        uploadOptions,
      ) as Promise<TaskAttachment>;
    },
    reorderTaskAttachments: (taskId, orderedIds) =>
      requestJson<{ attachments: TaskAttachment[] }>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/attachments/reorder`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        },
      ),
    downloadTaskAttachment: (taskId, attachmentId) =>
      requestBinary(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
      ),
    updateTaskAttachment: (taskId, attachmentId, input) =>
      requestJson<TaskAttachment>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
    deleteTaskAttachment: (taskId, attachmentId) =>
      requestJson<TaskAttachment>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
        { method: "DELETE" },
      ),
    uploadBankAccountCsv: (bankAccountId, csv, filename, uploadOptions) =>
      uploadBinaryWithProgress(
        normalized,
        "POST",
        `/api/v1/bank-accounts/${encodeURIComponent(bankAccountId)}/imports`,
        toUploadBody(csv),
        {
          "content-type": "text/csv",
          ...(filename ? { "x-filename": filename } : {}),
        },
        uploadOptions,
      ) as Promise<FinancialImportResult>,
  };
}
