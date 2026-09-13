/**
 * Thin Cloudflare client (official `cloudflare` SDK).
 * @see https://developers.cloudflare.com/api/resources/zones/
 * @see https://developers.cloudflare.com/api/resources/dns/subresources/records/
 * @see https://developers.cloudflare.com/api/resources/cache/
 */

import Cloudflare from "cloudflare";

export type CloudflareZone = {
  id: string;
  name: string;
  status: string | null;
};

export type CloudflareDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number | null;
  proxied: boolean | null;
  priority: number | null;
};

function mapCloudflareError(error: unknown): CloudflareApiError {
  const status =
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
      ? (error as { status: number }).status
      : 502;
  const message =
    error instanceof Error ? error.message : "Cloudflare API request failed";
  return new CloudflareApiError(
    status === 401 || status === 403 ? status : 502,
    status === 401 || status === 403
      ? "cloudflare_auth_failed"
      : "cloudflare_api_error",
    message,
  );
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function mapDnsRecord(raw: unknown): CloudflareDnsRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = asOptionalString(record.id);
  const type = asOptionalString(record.type);
  const name = asOptionalString(record.name);
  if (!id || !type || !name) return null;
  const content =
    asOptionalString(record.content) ??
    (record.data && typeof record.data === "object"
      ? JSON.stringify(record.data)
      : "");
  return {
    id,
    type,
    name,
    content: content || "",
    ttl: asOptionalNumber(record.ttl),
    proxied: asOptionalBoolean(record.proxied),
    priority: asOptionalNumber(record.priority),
  };
}

export class CloudflareApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = status;
    this.code = code;
  }
}

export class CloudflareClient {
  private readonly client: Cloudflare;

  constructor(options: { apiToken: string }) {
    const token = options.apiToken.trim();
    if (!token) {
      throw new CloudflareApiError(
        400,
        "cloudflare_token_missing",
        "Cloudflare API token is empty.",
      );
    }
    this.client = new Cloudflare({ apiToken: token });
  }

  async listZones(): Promise<CloudflareZone[]> {
    try {
      const zones: CloudflareZone[] = [];
      for await (const zone of this.client.zones.list()) {
        const id = typeof zone.id === "string" ? zone.id.trim() : "";
        const name = typeof zone.name === "string" ? zone.name.trim() : "";
        if (!id || !name) continue;
        zones.push({
          id,
          name,
          status: typeof zone.status === "string" ? zone.status : null,
        });
      }
      return zones;
    } catch (error) {
      throw mapCloudflareError(error);
    }
  }

  async listDnsRecords(zoneId: string): Promise<CloudflareDnsRecord[]> {
    const id = zoneId.trim();
    if (!id) {
      throw new CloudflareApiError(
        400,
        "cloudflare_api_error",
        "Cloudflare zone id required",
      );
    }
    try {
      const records: CloudflareDnsRecord[] = [];
      for await (const raw of this.client.dns.records.list({ zone_id: id })) {
        const mapped = mapDnsRecord(raw);
        if (mapped) records.push(mapped);
      }
      records.sort((left, right) => {
        const byName = left.name.localeCompare(right.name);
        if (byName !== 0) return byName;
        return left.type.localeCompare(right.type);
      });
      return records;
    } catch (error) {
      throw mapCloudflareError(error);
    }
  }

  /** Purge all cached files for the zone (`purge_everything`). */
  async purgeEverything(zoneId: string): Promise<{ id: string | null }> {
    const id = zoneId.trim();
    if (!id) {
      throw new CloudflareApiError(
        400,
        "cloudflare_api_error",
        "Cloudflare zone id required",
      );
    }
    try {
      const response = await this.client.cache.purge({
        zone_id: id,
        purge_everything: true,
      });
      return {
        id:
          response && typeof response.id === "string"
            ? response.id.trim() || null
            : null,
      };
    } catch (error) {
      throw mapCloudflareError(error);
    }
  }
}
