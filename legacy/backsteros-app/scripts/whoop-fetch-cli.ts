import { parseArgs } from "node:util";

import { fetchWhoopDaySnapshotCore } from "@/lib/whoop/fetch-snapshot-core";
import type { WhoopSnapshotEntity } from "@/lib/whoop/types";

type CliResult =
  | { ok: true; snapshot: WhoopSnapshotEntity | null }
  | { ok: false; snapshot: null; error: string };

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      date: { type: "string" },
      timezone: { type: "string" },
      now: { type: "string" },
      "strain-deep-dive": { type: "boolean", default: false },
    },
  });

  try {
    const snapshot = await fetchWhoopDaySnapshotCore({
      date: values.date,
      timezone: values.timezone,
      now: values.now ? new Date(values.now) : undefined,
      includeStrainDeepDive: values["strain-deep-dive"] ?? false,
    });

    const result: CliResult = { ok: true, snapshot };
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Whoop data";
    const result: CliResult = { ok: false, snapshot: null, error: message };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 1;
  }
}

void main();
