import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1, prepare: false });

async function main() {
  try {
    await sql`CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD 'powersync'`;
    console.log("Created role powersync_role.");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code !== "42710") {
      throw error;
    }
  }

  await sql`GRANT USAGE ON SCHEMA public TO powersync_role`;
  await sql`GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role`;

  const [row] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_publication WHERE pubname = 'powersync'
    ) AS exists
  `;

  if (!row?.exists) {
    await sql`CREATE PUBLICATION powersync FOR TABLE projects, tasks, documents`;
    console.log("Created publication powersync.");
  } else {
    console.log("Publication powersync already exists.");
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
