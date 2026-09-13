import {
  CloudflareApiError,
  CloudflareClient,
  type CloudflareDnsRecord,
} from "../lib/cloudflare-client.js";
import { getWorkspaceOrEnvCloudflareToken } from "./cloudflare-settings.js";

async function createClient(workspaceId: string, accessToken?: string | null) {
  const apiToken =
    accessToken?.trim() ||
    (await getWorkspaceOrEnvCloudflareToken(workspaceId));
  if (!apiToken) {
    throw new CloudflareApiError(
      400,
      "cloudflare_token_missing",
      "Cloudflare API token is not configured. Paste a token in Settings → Cloudflare (or set CLOUDFLARE_API_TOKEN).",
    );
  }
  return new CloudflareClient({ apiToken });
}

export async function listCloudflareDnsRecords(
  workspaceId: string,
  zoneId: string,
  options?: { apiToken?: string | null },
): Promise<{ zoneId: string; records: CloudflareDnsRecord[] }> {
  const client = await createClient(workspaceId, options?.apiToken);
  const records = await client.listDnsRecords(zoneId);
  return { zoneId: zoneId.trim(), records };
}

export async function purgeCloudflareCache(
  workspaceId: string,
  zoneId: string,
  options?: { apiToken?: string | null },
): Promise<{ zoneId: string; id: string | null; purged: true }> {
  const client = await createClient(workspaceId, options?.apiToken);
  const result = await client.purgeEverything(zoneId);
  return { zoneId: zoneId.trim(), id: result.id, purged: true };
}

export { CloudflareApiError };
