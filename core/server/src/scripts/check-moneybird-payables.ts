/**
 * OS-175: read-only Moneybird payables check (round-5 formula vs ~EUR 306.74).
 *
 *   pnpm exec tsx --env-file=.env src/scripts/check-moneybird-payables.ts \
 *     --workspace <uuid>
 *
 * Fetches open purchase invoices and prints totals only. Does not write to
 * Moneybird or BacksterOS. Do NOT pass --apply (rejected). Sander runs this
 * against live Moneybird when ready — agents must not.
 */
import { sqlClient } from "../db/index.js";
import { MoneybirdClient } from "../lib/moneybird-client.js";
import {
  PAYABLES_FILTER,
} from "../lib/moneybird-invoice-amounts.js";
import { getMoneybirdCredentials } from "../services/moneybird-settings.js";
import {
  checkMoneybirdPayables,
  formatPayablesCheckSummary,
} from "../services/moneybird-payables-check.js";

function parseArgs(argv: readonly string[]): { workspaceId: string } {
  let workspaceId: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--apply") {
      throw new Error(
        "check-moneybird-payables is read-only; --apply is not supported",
      );
    }
    if (arg === "--workspace" || arg === "--workspace-id") {
      workspaceId = argv[++i] ?? null;
      continue;
    }
    if (arg === "--") continue;
    throw new Error(
      `unknown argument: ${arg} (supported: --workspace <uuid>)`,
    );
  }
  if (!workspaceId?.trim()) {
    throw new Error("--workspace <uuid> is required");
  }
  return { workspaceId: workspaceId.trim() };
}

async function listAllPurchases(client: MoneybirdClient) {
  const perPage = 100;
  const maxPages = 50;
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await client.listPurchaseInvoices({
      page,
      perPage,
      filter: PAYABLES_FILTER,
    });
    all.push(...batch);
    if (batch.length < perPage) break;
  }
  return all;
}

async function main() {
  const { workspaceId } = parseArgs(process.argv.slice(2));
  const { apiToken, administrationId } =
    await getMoneybirdCredentials(workspaceId);
  if (!apiToken || !administrationId) {
    throw new Error("Moneybird API token / administration id not configured");
  }
  const client = new MoneybirdClient({ apiToken, administrationId });
  const result = await checkMoneybirdPayables({
    listPurchaseInvoices: () => listAllPurchases(client),
  });
  console.log(formatPayablesCheckSummary(result));
  if (!result.withinTolerance) {
    process.exitCode = 2;
  }
}

const isDirectRun =
  process.argv[1] != null &&
  (process.argv[1].endsWith("check-moneybird-payables.ts") ||
    process.argv[1].endsWith("check-moneybird-payables.js"));

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await sqlClient.end({ timeout: 2 });
    });
}
