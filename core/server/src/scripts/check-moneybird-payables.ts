/**
 * OS-175 / OS-184: read-only Moneybird payables check.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/check-moneybird-payables.ts \
 *     --workspace <uuid>
 *   pnpm exec tsx --env-file=.env src/scripts/check-moneybird-payables.ts \
 *     --workspace <uuid> --expected-cents 35425
 *
 * Fetches open purchase invoices and prints live totals (same formula as the
 * finance payables display). Does not write to Moneybird or BacksterOS.
 * There is no hard-coded expected total — pass `--expected-cents` only when
 * comparing against a hand count. Do NOT pass --apply (rejected).
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

function parseArgs(argv: readonly string[]): {
  workspaceId: string;
  expectedCents: number | undefined;
} {
  let workspaceId: string | null = null;
  let expectedCents: number | undefined;
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
    if (arg === "--expected-cents") {
      const raw = argv[++i];
      const parsed = raw == null ? Number.NaN : Number(raw);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        throw new Error("--expected-cents requires an integer (EUR cents)");
      }
      expectedCents = parsed;
      continue;
    }
    if (arg === "--") continue;
    throw new Error(
      `unknown argument: ${arg} (supported: --workspace <uuid> [--expected-cents <int>])`,
    );
  }
  if (!workspaceId?.trim()) {
    throw new Error("--workspace <uuid> is required");
  }
  return { workspaceId: workspaceId.trim(), expectedCents };
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
  const { workspaceId, expectedCents } = parseArgs(process.argv.slice(2));
  const { apiToken, administrationId } =
    await getMoneybirdCredentials(workspaceId);
  if (!apiToken || !administrationId) {
    throw new Error("Moneybird API token / administration id not configured");
  }
  const client = new MoneybirdClient({ apiToken, administrationId });
  const result = await checkMoneybirdPayables(
    {
      listPurchaseInvoices: () => listAllPurchases(client),
    },
    expectedCents === undefined ? {} : { expectedCents },
  );
  console.log(formatPayablesCheckSummary(result));
  if (result.withinTolerance === false) {
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
