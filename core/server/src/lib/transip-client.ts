/**
 * Thin TransIP REST API v6 client (domains list).
 * @see https://api.transip.eu/rest/docs.html
 */

const TRANSIP_API_BASE = "https://api.transip.nl/v6";

export class TransipApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "TransipApiError";
    this.status = status;
    this.code = code;
  }
}

export type TransipDomain = {
  name: string;
  status: string | null;
  registrationDate: string | null;
  renewalDate: string | null;
  isDnsOnly: boolean;
  tags: string[];
};

type RawDomain = {
  name?: unknown;
  status?: unknown;
  registrationDate?: unknown;
  renewalDate?: unknown;
  isDnsOnly?: unknown;
  tags?: unknown;
};

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function mapTransipDomain(raw: RawDomain): TransipDomain | null {
  const name = asOptionalString(raw.name)?.toLowerCase() ?? null;
  if (!name) return null;
  return {
    name,
    status: asOptionalString(raw.status),
    registrationDate: asOptionalString(raw.registrationDate),
    renewalDate: asOptionalString(raw.renewalDate),
    isDnsOnly: raw.isDnsOnly === true,
    tags: asStringArray(raw.tags),
  };
}

export function buildDomainProjectSummary(domain: TransipDomain): string {
  const parts: string[] = ["TransIP domain"];
  if (domain.status) parts.push(`status ${domain.status}`);
  if (domain.renewalDate) parts.push(`renews ${domain.renewalDate}`);
  if (domain.registrationDate) parts.push(`registered ${domain.registrationDate}`);
  if (domain.isDnsOnly) parts.push("DNS-only");
  return parts.join(" · ");
}

export type TransipClientOptions = {
  accessToken: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

export class TransipClient {
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: TransipClientOptions) {
    this.accessToken = options.accessToken.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = (options.baseUrl ?? TRANSIP_API_BASE).replace(/\/+$/, "");
  }

  private async requestJson<T>(
    method: string,
    path: string,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
    const text = await response.text();
    let body: unknown = null;
    if (text.trim()) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      const message =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : `TransIP API ${response.status}`;
      const code =
        response.status === 401 || response.status === 403
          ? "transip_auth_failed"
          : "transip_api_error";
      throw new TransipApiError(response.status, code, message);
    }
    return body as T;
  }

  /**
   * List all domains. Uses pageSize pagination when TransIP returns link headers;
   * falls back to a single unbounded list when no pagination is used.
   */
  async listDomains(): Promise<TransipDomain[]> {
    const pageSize = 100;
    const collected: TransipDomain[] = [];
    let page = 1;

    for (;;) {
      const path = `/domains?pageSize=${pageSize}&page=${page}`;
      const body = await this.requestJson<{
        domains?: RawDomain[];
      }>("GET", path);
      const batch = (body.domains ?? [])
        .map((raw) => mapTransipDomain(raw))
        .filter((domain): domain is TransipDomain => domain != null);
      collected.push(...batch);
      if (batch.length < pageSize) break;
      page += 1;
      if (page > 100) break;
    }

    return collected;
  }
}
