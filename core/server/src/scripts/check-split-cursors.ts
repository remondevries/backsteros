import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const sql = postgres(url, { max: 1 });
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'core_replication_cursors'
    ORDER BY ordinal_position`;
  console.log(
    cols
      .map(
        (c) =>
          `${c.column_name}: ${c.data_type} null=${c.is_nullable}`,
      )
      .join("\n"),
  );
  const hasPull = cols.some((c) => c.column_name === "pull_updated_at");
  const hasPush = cols.some((c) => c.column_name === "push_updated_at");
  console.log(`split_cursors=${hasPull && hasPush}`);
  await sql.end({ timeout: 2 });
  if (!hasPull || !hasPush) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
