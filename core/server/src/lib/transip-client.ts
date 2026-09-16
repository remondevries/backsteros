/**
 * Thin TransIP REST API v6 client (domains).
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
  /** Null when active; `"cancelled"` when the domain has been cancelled. */
  cancellationStatus: string | null;
  cancellationDate: string | null;
  registrationDate: string | null;
  renewalDate: string | null;
  isDnsOnly: boolean;
  tags: string[];
};

export type TransipNameserver = {
  hostname: string;
  ipv4: string | null;
  ipv6: string | null;
};

export type TransipWhoisContact = {
  type: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  companyKvk: string | null;
  companyType: string | null;
  street: string | null;
  number: string | null;
  postalCode: string | null;
  city: string | null;
  phoneNumber: string | null;
  faxNumber: string | null;
  email: string | null;
  country: string | null;
};

export type TransipDomainDetail = TransipDomain & {
  authCode: string | null;
  authCodeError: string | null;
  nameservers: TransipNameserver[];
  contacts: TransipWhoisContact[];
};

type RawDomain = {
  name?: unknown;
  status?: unknown;
  cancellationStatus?: unknown;
  cancellationDate?: unknown;
  registrationDate?: unknown;
  renewalDate?: unknown;
  isDnsOnly?: unknown;
  tags?: unknown;
  nameservers?: unknown;
  contacts?: unknown;
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

function mapNameserver(raw: unknown): TransipNameserver | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const hostname = asOptionalString(record.hostname)?.toLowerCase() ?? null;
  if (!hostname) return null;
  return {
    hostname,
    ipv4: asOptionalString(record.ipv4),
    ipv6: asOptionalString(record.ipv6),
  };
}

function mapWhoisContact(raw: unknown): TransipWhoisContact | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  return {
    type: asOptionalString(record.type),
    firstName: asOptionalString(record.firstName),
    lastName: asOptionalString(record.lastName),
    companyName: asOptionalString(record.companyName),
    companyKvk: asOptionalString(record.companyKvk),
    companyType: asOptionalString(record.companyType),
    street: asOptionalString(record.street),
    number: asOptionalString(record.number),
    postalCode: asOptionalString(record.postalCode),
    city: asOptionalString(record.city),
    phoneNumber: asOptionalString(record.phoneNumber),
    faxNumber: asOptionalString(record.faxNumber),
    email: asOptionalString(record.email),
    country: asOptionalString(record.country),
  };
}

export function mapTransipDomain(raw: RawDomain): TransipDomain | null {
  const name = asOptionalString(raw.name)?.toLowerCase() ?? null;
  if (!name) return null;
  return {
    name,
    status: asOptionalString(raw.status),
    cancellationStatus: asOptionalString(raw.cancellationStatus),
    cancellationDate: asOptionalString(raw.cancellationDate),
    registrationDate: asOptionalString(raw.registrationDate),
    renewalDate: asOptionalString(raw.renewalDate),
    isDnsOnly: raw.isDnsOnly === true,
    tags: asStringArray(raw.tags),
  };
}

/**
 * Domains that should land in On Hold for review.
 * TransIP keeps lifecycle in `status` (`gone`, `dropinprogress`, …) and
 * cancellation separately in `cancellationStatus` (`cancelled`).
 */
export function isTransipDomainCancelledLike(
  domain: {
    status?: string | null;
    cancellationStatus?: string | null;
  } | string | null | undefined,
): boolean {
  if (domain == null) return false;
  if (typeof domain === "string") {
    const value = domain.trim().toLowerCase();
    return (
      value === "cancelled" ||
      value === "canceled" ||
      value === "expired" ||
      value === "gone" ||
      value === "dropinprogress"
    );
  }
  const cancel = domain.cancellationStatus?.trim().toLowerCase() ?? "";
  if (cancel === "cancelled" || cancel === "canceled") return true;
  const status = domain.status?.trim().toLowerCase() ?? "";
  return (
    status === "gone" ||
    status === "dropinprogress" ||
    status === "expired" ||
    status === "cancelled" ||
    status === "canceled"
  );
}

export function buildDomainProjectSummary(domain: TransipDomain): string {
  const parts: string[] = ["TransIP domain"];
  if (domain.status) parts.push(`status ${domain.status}`);
  if (domain.cancellationStatus) {
    parts.push(`cancellation ${domain.cancellationStatus}`);
  }
  if (domain.renewalDate) parts.push(`renews ${domain.renewalDate}`);
  if (domain.registrationDate) parts.push(`registered ${domain.registrationDate}`);
  if (domain.isDnsOnly) parts.push("DNS-only");
  if (domain.tags.length > 0) parts.push(`tags ${domain.tags.join(", ")}`);
  return parts.join(" · ");
}

/** Entity-icon payload: TransIP mark + brand paint + optional registrar tags. */
export function buildTransipDomainProjectIcon(tags: string[] = []): string {
  const payload: Record<string, unknown> = {
    t: "i",
    k: "transip",
    c: "#408fce",
  };
  if (tags.length > 0) payload.tags = [...tags];
  return JSON.stringify(payload);
}

export function parseTransipDomainTagsFromIcon(
  icon: string | null | undefined,
): string[] {
  const value = icon?.trim() ?? "";
  if (!value.startsWith("{")) return [];
  try {
    const parsed = JSON.parse(value) as { tags?: unknown };
    return asStringArray(parsed.tags);
  } catch {
    return [];
  }
}

export function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].map((tag) => tag.toLowerCase()).sort();
  const right = [...b].map((tag) => tag.toLowerCase()).sort();
  return left.every((tag, index) => tag === right[index]);
}

/** TransIP returns `YYYY-MM-DD`; project dates are ISO datetimes. */
export function transipYmdToIso(ymd: string | null | undefined): string | null {
  const value = ymd?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return `${value}T00:00:00.000Z`;
}

/** Compare stored project dates to TransIP `YYYY-MM-DD` values. */
export function projectDateToYmd(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
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
    options?: { body?: unknown },
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...(options?.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        options?.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
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
      const path = `/domains?pageSize=${pageSize}&page=${page}&include=goneDomains`;
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

  /**
   * Domain detail with nameservers + WHOIS contacts, plus auth/EPP code when
   * the TLD exposes it via GET (some TLDs only email the code).
   */
  async getDomainDetail(domainName: string): Promise<TransipDomainDetail> {
    const name = domainName.trim().toLowerCase();
    if (!name) {
      throw new TransipApiError(400, "transip_api_error", "Domain name required");
    }
    const encoded = encodeURIComponent(name);
    const body = await this.requestJson<{ domain?: RawDomain }>(
      "GET",
      `/domains/${encoded}?include=nameservers,contacts`,
    );
    const mapped = body.domain ? mapTransipDomain(body.domain) : null;
    if (!mapped) {
      throw new TransipApiError(404, "transip_api_error", "Domain not found");
    }

    const nameservers = Array.isArray(body.domain?.nameservers)
      ? body.domain.nameservers
          .map((entry) => mapNameserver(entry))
          .filter((entry): entry is TransipNameserver => entry != null)
      : [];
    const contacts = Array.isArray(body.domain?.contacts)
      ? body.domain.contacts
          .map((entry) => mapWhoisContact(entry))
          .filter((entry): entry is TransipWhoisContact => entry != null)
      : [];

    let authCode: string | null = null;
    let authCodeError: string | null = null;
    try {
      const authBody = await this.requestJson<{ authCode?: unknown }>(
        "GET",
        `/domains/${encoded}/auth-code`,
      );
      authCode = asOptionalString(authBody.authCode);
      if (!authCode) {
        authCodeError = "Auth code not returned for this TLD";
      }
    } catch (error) {
      if (error instanceof TransipApiError) {
        authCodeError = error.message;
      } else {
        authCodeError = "Could not load auth code";
      }
    }

    return {
      ...mapped,
      authCode,
      authCodeError,
      nameservers,
      contacts,
    };
  }

  /**
   * Replace WHOIS contacts at the registrar. TransIP replaces the full contact
   * set — pass every role you want to keep (registrant / administrative / technical).
   */
  async updateDomainContacts(
    domainName: string,
    contacts: TransipWhoisContact[],
  ): Promise<TransipWhoisContact[]> {
    const name = domainName.trim().toLowerCase();
    if (!name) {
      throw new TransipApiError(400, "transip_api_error", "Domain name required");
    }
    if (contacts.length === 0) {
      throw new TransipApiError(
        400,
        "transip_api_error",
        "At least one WHOIS contact is required",
      );
    }
    const encoded = encodeURIComponent(name);
    const payload = contacts.map((contact) => ({
      type: contact.type?.trim() || "registrant",
      firstName: contact.firstName?.trim() ?? "",
      lastName: contact.lastName?.trim() ?? "",
      companyName: contact.companyName?.trim() ?? "",
      companyKvk: contact.companyKvk?.trim() ?? "",
      companyType: contact.companyType?.trim() ?? "",
      street: contact.street?.trim() ?? "",
      number: contact.number?.trim() ?? "",
      postalCode: contact.postalCode?.trim() ?? "",
      city: contact.city?.trim() ?? "",
      phoneNumber: contact.phoneNumber?.trim() ?? "",
      faxNumber: contact.faxNumber?.trim() ?? "",
      email: contact.email?.trim() ?? "",
      country: contact.country?.trim().toLowerCase() ?? "",
    }));
    await this.requestJson("PUT", `/domains/${encoded}/contacts`, {
      body: { contacts: payload },
    });
    const detail = await this.getDomainDetail(name);
    return detail.contacts;
  }

  /**
   * Replace nameservers at the registrar. TransIP replaces the full set —
   * pass every hostname you want to keep (empty slots must be omitted).
   */
  async updateDomainNameservers(
    domainName: string,
    nameservers: TransipNameserver[],
  ): Promise<TransipNameserver[]> {
    const name = domainName.trim().toLowerCase();
    if (!name) {
      throw new TransipApiError(400, "transip_api_error", "Domain name required");
    }
    const normalized = nameservers
      .map((entry) => ({
        hostname: entry.hostname?.trim().toLowerCase() ?? "",
        ipv4: entry.ipv4?.trim() ?? "",
        ipv6: entry.ipv6?.trim() ?? "",
      }))
      .filter((entry) => entry.hostname.length > 0);
    if (normalized.length === 0) {
      throw new TransipApiError(
        400,
        "transip_api_error",
        "At least two nameserver hostnames are required",
      );
    }
    if (normalized.length < 2) {
      throw new TransipApiError(
        400,
        "transip_api_error",
        "TransIP requires at least two nameservers",
      );
    }
    if (normalized.length > 13) {
      throw new TransipApiError(
        400,
        "transip_api_error",
        "TransIP allows at most 13 nameservers",
      );
    }
    const encoded = encodeURIComponent(name);
    await this.requestJson("PUT", `/domains/${encoded}/nameservers`, {
      body: { nameservers: normalized },
    });
    const detail = await this.getDomainDetail(name);
    return detail.nameservers;
  }

  /**
   * Replace domain tags at the registrar. TransIP overrides the full tags list
   * on each update — pass the complete desired set.
   */
  async updateDomainTags(
    domainName: string,
    tags: string[],
  ): Promise<string[]> {
    const name = domainName.trim().toLowerCase();
    if (!name) {
      throw new TransipApiError(400, "transip_api_error", "Domain name required");
    }
    const normalized = [
      ...new Set(
        tags
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    ];
    const encoded = encodeURIComponent(name);
    const current = await this.requestJson<{ domain?: RawDomain }>(
      "GET",
      `/domains/${encoded}`,
    );
    if (!current.domain) {
      throw new TransipApiError(404, "transip_api_error", "Domain not found");
    }
    await this.requestJson("PUT", `/domains/${encoded}`, {
      body: {
        domain: {
          ...current.domain,
          name,
          tags: normalized,
        },
      },
    });
    return normalized;
  }
}
