/**
 * Verify PowerSync publication + grants match the Tier A/B table list.
 * Does not require POWERSYNC_DB_PASSWORD (read-only checks).
 *
 * Usage: pnpm --filter @backsteros/server db:powersync-verify
 */
import postgres from "postgres";

import { POWERSYNC_PUBLICATION_TABLES } from "./powersync-tables.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1, prepare: false });

async function main() {
  const published = await sql<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_publication_tables
    WHERE pubname = 'powersync'
    ORDER BY tablename
  `;
  const publishedNames = published.map((row) => row.tablename);
  const publishedSet = new Set(publishedNames);

  const grants = await sql<{ table_name: string }[]>`
    SELECT DISTINCT table_name
    FROM information_schema.role_table_grants
    WHERE grantee = 'powersync_role'
      AND privilege_type = 'SELECT'
      AND table_schema = 'public'
  `;
  const granted = new Set(grants.map((row) => row.table_name));

  const missingPublication = POWERSYNC_PUBLICATION_TABLES.filter(
    (name) => !publishedSet.has(name),
  );
  const extraPublication = publishedNames.filter(
    (name) =>
      !(POWERSYNC_PUBLICATION_TABLES as readonly string[]).includes(name),
  );
  const missingGrants = POWERSYNC_PUBLICATION_TABLES.filter(
    (name) => !granted.has(name),
  );

  console.log("Expected:", [...POWERSYNC_PUBLICATION_TABLES].join(", "));
  console.log("Published:", publishedNames.join(", ") || "(none)");
  if (missingPublication.length) {
    console.error("Missing from publication:", missingPublication.join(", "));
  }
  if (extraPublication.length) {
    console.warn("Extra in publication:", extraPublication.join(", "));
  }
  if (missingGrants.length) {
    console.error("Missing SELECT grants:", missingGrants.join(", "));
  }

  if (missingPublication.length || missingGrants.length) {
    process.exitCode = 1;
    console.error(
      "\nFix: run `pnpm db:powersync-setup` (or ALTER PUBLICATION + GRANT SELECT), then restart PowerSync.",
    );
  } else {
    console.log("\nOK — publication and grants match Tier A/B sync tables.");
  }

  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
