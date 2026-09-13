import type { CliClient, CliConfig } from "../config.js";
import { emitResult } from "../output.js";

export async function runTransipCommand(
  client: CliClient,
  config: CliConfig,
  action: string | undefined,
): Promise<void> {
  switch (action) {
    case "status": {
      const res = await client.contract.getTransipStatus({});
      if (res.status !== 200) {
        throw new Error(`status failed (${res.status})`);
      }
      const body = res.body;
      emitResult(
        config.json,
        body,
        body.configured
          ? "TransIP: configured"
          : "TransIP: not configured (Settings → TransIP, or TRANSIP_ACCESS_TOKEN)",
      );
      return;
    }
    case "sync-domains": {
      const res = await client.contract.syncTransipDomains({});
      if (res.status !== 200) {
        const err =
          res.body &&
          typeof res.body === "object" &&
          "error" in res.body &&
          typeof (res.body as { error: unknown }).error === "string"
            ? (res.body as { error: string }).error
            : `sync failed (${res.status})`;
        throw new Error(err);
      }
      const body = res.body;
      emitResult(
        config.json,
        body,
        `TransIP domains: fetched ${body.fetched}, created ${body.created}, skipped ${body.skipped}, healed ${body.healed}`,
      );
      return;
    }
    default:
      throw new Error(
        "Usage: backsteros transip status | backsteros transip sync-domains",
      );
  }
}
