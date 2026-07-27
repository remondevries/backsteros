import postgres from "postgres";

import { POWERSYNC_PUBLICATION_TABLES } from "./powersync-tables.js";

const connectionString = process.env.DATABASE_URL;
const rolePassword = process.env.POWERSYNC_DB_PASSWORD?.trim();

if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

if (!rolePassword || rolePassword.length < 16) {
  console.error(
    "POWERSYNC_DB_PASSWORD is required (min 16 characters) to create powersync_role",
  );
  process.exit(1);
}

if (rolePassword === "powersync") {
  console.error("POWERSYNC_DB_PASSWORD must not be the weak default 'powersync'");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1, prepare: false });

/** Postgres string literal for utility statements that cannot take bind params. */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const publicationTableList = POWERSYNC_PUBLICATION_TABLES.join(", ");

async function ensureGrants() {
  await sql`GRANT USAGE ON SCHEMA public TO powersync_role`;
  await sql`GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role`;
  await sql.unsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role`,
  );
}

async function ensurePublication() {
  const [row] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = 'powersync'
    ) AS exists
  `;

  if (!row?.exists) {
    await sql.unsafe(
      `CREATE PUBLICATION powersync FOR TABLE ${publicationTableList}`,
    );
    console.log("Created publication powersync.");
  } else {
    await sql.unsafe(
      `ALTER PUBLICATION powersync SET TABLE ${publicationTableList}`,
    );
    console.log("Updated publication powersync.");
  }
}

async function verify() {
  const published = await sql<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_publication_tables
    WHERE pubname = 'powersync'
    ORDER BY tablename
  `;
  const publishedNames = new Set(published.map((row) => row.tablename));
  const missing = POWERSYNC_PUBLICATION_TABLES.filter(
    (name) => !publishedNames.has(name),
  );
  if (missing.length > 0) {
    throw new Error(
      `Publication powersync missing tables: ${missing.join(", ")}`,
    );
  }

  const grants = await sql<{ table_name: string }[]>`
    SELECT DISTINCT table_name
    FROM information_schema.role_table_grants
    WHERE grantee = 'powersync_role'
      AND privilege_type = 'SELECT'
      AND table_schema = 'public'
  `;
  const granted = new Set(grants.map((row) => row.table_name));
  const missingGrants = POWERSYNC_PUBLICATION_TABLES.filter(
    (name) => !granted.has(name),
  );
  if (missingGrants.length > 0) {
    throw new Error(
      `powersync_role missing SELECT on: ${missingGrants.join(", ")}`,
    );
  }

  console.log(
    `Verified publication (${POWERSYNC_PUBLICATION_TABLES.length} tables): ${[...POWERSYNC_PUBLICATION_TABLES].join(", ")}`,
  );
}

async function main() {
  const passwordSql = quoteLiteral(rolePassword!);
  try {
    await sql.unsafe(
      `CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD ${passwordSql}`,
    );
    console.log("Created role powersync_role.");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code !== "42710") {
      throw error;
    }
    await sql.unsafe(
      `ALTER ROLE powersync_role WITH PASSWORD ${passwordSql}`,
    );
    console.log("Updated password for existing powersync_role.");
  }

  await ensureGrants();
  await ensurePublication();
  // Re-grant after publication in case new tables were created after role setup.
  await ensureGrants();
  await verify();

  await sql.end();
  console.log("PowerSync database setup complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
