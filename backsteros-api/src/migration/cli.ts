import fs from "node:fs";
import path from "node:path";

import { buildMigrationRecords } from "./records.js";
import {
  createTargetSql,
  resolveOwnerWorkspace,
  runMigration,
  verifyMigration,
  type MigrationMode,
} from "./runner.js";
import {
  CircleContentSource,
  openSourceSnapshot,
  readEnvFile,
} from "./source.js";

type Options = {
  mode: MigrationMode | "inventory";
  sourceRoot: string;
  database: string;
  sourceEnv: string;
  workspaceId?: string;
  reportDir: string;
};

function parseArgs(argv: string[]): Options {
  const mode = argv[0] as Options["mode"] | undefined;
  if (
    !mode ||
    !["inventory", "dry-run", "execute", "resume", "verify"].includes(mode)
  ) {
    throw new Error(
      "USAGE: migration:circle <inventory|dry-run|execute|resume|verify> [options]",
    );
  }
  const sourceRootDefault = "/Users/remondevries/code/circle.remondevries.com";
  const values = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--") || !argv[index + 1]) {
      throw new Error(`INVALID_ARGUMENT:${key}`);
    }
    values.set(key.slice(2), argv[index + 1]!);
    index += 1;
  }
  const sourceRoot = path.resolve(values.get("source-root") || sourceRootDefault);
  return {
    mode,
    sourceRoot,
    database: path.resolve(
      values.get("database") || path.join(sourceRoot, "data/circle.db"),
    ),
    sourceEnv: path.resolve(
      values.get("source-env") || path.join(sourceRoot, ".env"),
    ),
    workspaceId: values.get("workspace-id"),
    reportDir: path.resolve(
      values.get("report-dir") || path.join(process.cwd(), "../.migration-reports"),
    ),
  };
}

function safeMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(secret|password|token|key)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 1000);
}

function reportPath(options: Options): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    options.reportDir,
    `circle-migration-${options.mode}-${stamp}.json`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const snapshot = openSourceSnapshot(options.database);
  const report: Record<string, unknown> = {
    schemaVersion: 1,
    mode: options.mode,
    generatedAt: new Date().toISOString(),
    sourceFingerprint: snapshot.fingerprint,
    sourceInventory: snapshot.inventory,
    excludedSourceData: [
      "password hashes",
      "API keys",
      "session/login/sync operational tables",
      "Spaces credentials and secret settings",
    ],
  };

  if (options.mode !== "inventory") {
    const sql = createTargetSql();
    try {
      const target = await resolveOwnerWorkspace(sql, options.workspaceId);
      const sourceEnv = readEnvFile(options.sourceEnv);
      const content = new CircleContentSource(snapshot.vaultRoot, sourceEnv);
      const records = await buildMigrationRecords(
        snapshot,
        content,
        target.workspaceId,
        target.ownerUserId,
      );
      report.targetWorkspaceId = target.workspaceId;
      report.extractedRecords = records.length;
      report.sourceContentConflicts = records
        .filter((record) =>
          record.warnings.includes("SOURCE_LOCAL_SPACES_CHECKSUM_CONFLICT"),
        )
        .map((record) => ({
          sourceType: record.sourceType,
          sourceId: record.sourceId,
        }));

      if (options.mode === "verify") {
        report.verification = await verifyMigration({ sql, records });
      } else {
        const result = await runMigration({
          sql,
          mode: options.mode,
          workspaceId: target.workspaceId,
          sourceFingerprint: snapshot.fingerprint,
          sourceInventory: snapshot.inventory,
          records,
        });
        report.runId = result.runId;
        report.summary = result.summary;
        report.items = result.items;
        if (options.mode === "execute" || options.mode === "resume") {
          report.verification = await verifyMigration({ sql, records });
        }
      }
    } finally {
      await sql.end();
    }
  }

  fs.mkdirSync(options.reportDir, { recursive: true });
  const outputPath = reportPath(options);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  const summary = report.summary ?? snapshot.inventory;
  console.log(
    JSON.stringify({
      mode: options.mode,
      report: outputPath,
      summary,
      verification: report.verification ?? null,
    }),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ error: safeMessage(error) }));
  process.exitCode = 1;
});
