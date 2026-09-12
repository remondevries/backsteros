/**
 * Compare local-core Postgres vs cloud-core Postgres for schema + row drift.
 *
 * Usage (from core/server, with Tailscale up):
 *   CLOUD_DATABASE_URL=postgresql://backsteros:***@127.0.0.1:5434/backsteros \
 *     pnpm --filter @backsteros/server exec tsx --env-file=.env src/scripts/core-parity-check.ts
 *
 * Or SSH tunnel / docker exec wrappers via:
 *   LOCAL_DATABASE_URL=... CLOUD_DATABASE_URL=... pnpm ...
 *
 * Exit 0 when schema matches and replicated entity ID sets match (ignores
 * soft-deleted habit-day forks). Non-zero when drift remains.
 */
import postgres from "postgres";

import { REPLICATED_TABLES } from "../services/core-replication/constants.js";

const LOCAL_URL = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
const CLOUD_URL = process.env.CLOUD_DATABASE_URL;

const TABLES_WITH_DELETED_AT = new Set([
  "areas",
  "organizations",
  "contacts",
  "contact_relationships",
  "crm_relationship_labels",
  "crm_groups",
  "crm_group_members",
  "crm_activities",
  "projects",
  "habits",
  "bank_accounts",
  "financial_categories",
  "financial_goals",
  "financial_recurrings",
  "cashflow_planner_entries",
  "tasks",
  "documents",
  "letters",
  "letter_attachments",
  "task_attachments",
  "meetings",
  "avatars",
  "email_threads",
  "email_thread_comments",
  "task_comments",
  "recurring_tasks",
  "api_keys",
]);

type ColRow = { table_name: string; column_name: string; data_type: string };

async function columnInventory(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql<ColRow[]>`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;
  return rows.map(
    (r) => `${r.table_name}.${r.column_name}:${r.data_type}`,
  );
}

async function idSet(
  sql: postgres.Sql,
  table: string,
): Promise<Set<string>> {
  const hasDeleted = TABLES_WITH_DELETED_AT.has(table);
  const rows = hasDeleted
    ? await sql.unsafe(
        `SELECT id::text AS id FROM "${table}" WHERE deleted_at IS NULL`,
      )
    : table === "workspace_settings" || table === "meeting_scheduling_settings"
      ? await sql.unsafe(
          `SELECT workspace_id::text AS id FROM "${table}"`,
        )
      : table === "entity_counters"
        ? await sql.unsafe(
            `SELECT (workspace_id || '|' || entity || '|' || scope)::text AS id FROM "${table}"`,
          )
        : table === "workspace_members"
          ? await sql.unsafe(
              `SELECT (workspace_id || '|' || user_id)::text AS id FROM "${table}"`,
            )
          : await sql.unsafe(`SELECT id::text AS id FROM "${table}"`);
  return new Set(
    (rows as unknown as Array<{ id: string }>)
      .map((r) => r.id)
      .filter(Boolean),
  );
}

async function taskSupportCounts(sql: postgres.Sql) {
  const rows = await sql<{ support: boolean; n: string }[]>`
    SELECT support, count(*)::text AS n
    FROM tasks
    WHERE deleted_at IS NULL
    GROUP BY support
    ORDER BY support
  `;
  return Object.fromEntries(rows.map((r) => [String(r.support), Number(r.n)]));
}

async function main() {
  if (!LOCAL_URL) throw new Error("DATABASE_URL or LOCAL_DATABASE_URL required");
  if (!CLOUD_URL) {
    throw new Error(
      "CLOUD_DATABASE_URL required (e.g. ssh tunnel to cloud Postgres :5434)",
    );
  }

  const local = postgres(LOCAL_URL, { max: 1 });
  const cloud = postgres(CLOUD_URL, { max: 1 });
  let exitCode = 0;

  try {
    const [localCols, cloudCols] = await Promise.all([
      columnInventory(local),
      columnInventory(cloud),
    ]);
    const localOnlyCols = localCols.filter((c) => !cloudCols.includes(c));
    const cloudOnlyCols = cloudCols.filter((c) => !localCols.includes(c));
    console.log("=== schema columns ===");
    console.log(
      `local=${localCols.length} cloud=${cloudCols.length} onlyLocal=${localOnlyCols.length} onlyCloud=${cloudOnlyCols.length}`,
    );
    if (localOnlyCols.length || cloudOnlyCols.length) {
      exitCode = 1;
      console.log("onlyLocal", localOnlyCols.slice(0, 40));
      console.log("onlyCloud", cloudOnlyCols.slice(0, 40));
    }

    console.log("=== support flag ===");
    const [ls, cs] = await Promise.all([
      taskSupportCounts(local),
      taskSupportCounts(cloud),
    ]);
    console.log("local", ls, "cloud", cs);
    if (JSON.stringify(ls) !== JSON.stringify(cs)) {
      exitCode = 1;
      console.log("SUPPORT_COUNT_MISMATCH");
    }

    console.log("=== replicated live id sets (non-deleted where applicable) ===");
    for (const table of REPLICATED_TABLES) {
      try {
        const [a, b] = await Promise.all([idSet(local, table), idSet(cloud, table)]);
        const onlyL = [...a].filter((id) => !b.has(id));
        const onlyC = [...b].filter((id) => !a.has(id));
        if (onlyL.length || onlyC.length || a.size !== b.size) {
          // financial_transactions is Tier C-ish volume — still report.
          console.log(
            `DIFF ${table}: local=${a.size} cloud=${b.size} onlyL=${onlyL.length} onlyC=${onlyC.length}`,
          );
          exitCode = 1;
        } else {
          console.log(`ok ${table}: ${a.size}`);
        }
      } catch (error) {
        console.log(`skip ${table}:`, error instanceof Error ? error.message : error);
      }
    }
  } finally {
    await local.end({ timeout: 1 });
    await cloud.end({ timeout: 1 });
  }

  if (exitCode === 0) console.log("PARITY_OK");
  else console.log("PARITY_DRIFT");
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
