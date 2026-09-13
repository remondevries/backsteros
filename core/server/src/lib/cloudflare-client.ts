/**
 * Thin Cloudflare Zones client (official `cloudflare` SDK).
 * @see https://developers.cloudflare.com/api/resources/zones/
 */

import Cloudflare from "cloudflare";

export type CloudflareZone = {
  id: string;
  name: string;
  status: string | null;
};

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
      const status =
        error &&
        typeof error === "object" &&
        "status" in error &&
        typeof (error as { status: unknown }).status === "number"
          ? (error as { status: number }).status
          : 502;
      const message =
        error instanceof Error ? error.message : "Cloudflare API request failed";
      throw new CloudflareApiError(
        status === 401 || status === 403 ? status : 502,
        status === 401 || status === 403
          ? "cloudflare_auth_failed"
          : "cloudflare_api_error",
        message,
      );
    }
  }
}
