import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { db } from "./index.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const migrationClient = postgres(connectionString, { max: 1, prepare: false });

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await migrationClient.end();
  console.log("Migrations applied.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
