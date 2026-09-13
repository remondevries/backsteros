import type { CliClient, CliConfig } from "../config.js";
import { emitResult } from "../output.js";

export async function runCloudflareCommand(
  client: CliClient,
  config: CliConfig,
  action: string | undefined,
): Promise<void> {
  switch (action) {
    case "status": {
      const res = await client.contract.getCloudflareStatus({});
      if (res.status !== 200) {
        throw new Error(`status failed (${res.status})`);
      }
      const body = res.body;
      emitResult(
        config.json,
        body,
        body.configured
          ? "Cloudflare: configured"
          : "Cloudflare: not configured (Settings → Integrations → Cloudflare, or CLOUDFLARE_API_TOKEN)",
      );
      return;
    }
    case "match-zones": {
      const res = await client.contract.matchCloudflareZones({});
      if (res.status !== 200) {
        const err =
          res.body &&
          typeof res.body === "object" &&
          "error" in res.body &&
          typeof (res.body as { error: unknown }).error === "string"
            ? (res.body as { error: string }).error
            : `match failed (${res.status})`;
        throw new Error(err);
      }
      const body = res.body;
      emitResult(
        config.json,
        body,
        `Cloudflare zones: fetched ${body.fetched}, matched ${body.matched}, updated ${body.updated}, unchanged ${body.unchanged}, unmatched projects ${body.unmatchedProjects}, unmatched zones ${body.unmatchedZones}`,
      );
      return;
    }
    default:
      throw new Error(
        "Usage: backsteros cloudflare status | backsteros cloudflare match-zones",
      );
  }
}
