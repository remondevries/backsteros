import postgres from "postgres";

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

  await sql`GRANT USAGE ON SCHEMA public TO powersync_role`;
  await sql`GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role`;

  const [row] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = 'powersync'
    ) AS exists
  `;

  if (!row?.exists) {
    await sql`CREATE PUBLICATION powersync FOR TABLE projects, tasks, documents, organizations, contacts, areas, letters, avatars, mentions, workspace_settings`;
    console.log("Created publication powersync.");
  } else {
    await sql`ALTER PUBLICATION powersync SET TABLE projects, tasks, documents, organizations, contacts, areas, letters, avatars, mentions, workspace_settings`;
    console.log("Updated publication powersync.");
  }

  await sql.end();
  console.log("PowerSync database setup complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
