/**
 * One-shot: backfill time_entries from timer_* activities + residual scalars.
 *
 *   pnpm --filter @backsteros/core-server exec tsx src/scripts/migrate-time-entries-ledger.ts
 */
import { migrateAllWorkspacesLegacyTrackedTime } from "../services/time-entries/migrate-from-legacy.js";

async function main() {
  const results = await migrateAllWorkspacesLegacyTrackedTime();
  let sessions = 0;
  let open = 0;
  let adjustments = 0;
  for (const row of results) {
    sessions += row.taskSessions;
    open += row.openTimers;
    adjustments +=
      row.taskAdjustments + row.meetingAdjustments + row.documentAdjustments;
  }
  console.log(
    JSON.stringify(
      {
        workspaces: results.length,
        taskSessions: sessions,
        openTimers: open,
        adjustments,
        details: results.filter(
          (row) =>
            row.taskSessions > 0 ||
            row.openTimers > 0 ||
            row.taskAdjustments > 0 ||
            row.meetingAdjustments > 0 ||
            row.documentAdjustments > 0,
        ),
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
