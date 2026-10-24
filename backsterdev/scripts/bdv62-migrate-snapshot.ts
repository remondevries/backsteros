#!/usr/bin/env node
/**
 * BDV-62: run V1→V2 initialize + migrations against a copied MacBook snapshot
 * under backsterdev/.t3/userdata (never ~/.t3). Verifies task↔thread bindings
 * still resolve to imported projection rows.
 *
 * Usage (from backsterdev/):
 *   vp exec tsx scripts/bdv62-migrate-snapshot.ts
 */
import * as NodePath from "node:path";
import * as NodeFs from "node:fs";
import * as NodeUrl from "node:url";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { initializeV2Database } from "../apps/server/src/persistence/initializeV2Database.ts";
import { runMigrations } from "../apps/server/src/persistence/Migrations.ts";

const here = NodePath.dirname(NodeUrl.fileURLToPath(import.meta.url));
const root = NodePath.resolve(here, "..");
const userdata = NodePath.join(root, ".t3", "userdata");
const v1Path = NodePath.join(userdata, "state.sqlite");
const v2Path = NodePath.join(userdata, "statev2.sqlite");
const bindingsPath = NodePath.join(userdata, "backsteros-task-threads.json");

const program = Effect.gen(function* () {
  if (!NodeFs.existsSync(v1Path)) {
    return yield* Effect.fail(new Error(`Missing V1 snapshot at ${v1Path}`));
  }
  if (!NodeFs.existsSync(bindingsPath)) {
    return yield* Effect.fail(new Error(`Missing bindings at ${bindingsPath}`));
  }

  // Fresh V2 each run so re-running the script is idempotent for this sandbox.
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = `${v2Path}${suffix}`;
    if (NodeFs.existsSync(path)) NodeFs.unlinkSync(path);
  }

  yield* initializeV2Database(v2Path);
  if (!NodeFs.existsSync(v2Path)) {
    return yield* Effect.fail(new Error(`initializeV2Database did not create ${v2Path}`));
  }

  const sqlLayer = NodeSqliteClient.layer({ filename: v2Path });
  yield* runMigrations().pipe(Effect.provide(sqlLayer));

  const bindings = JSON.parse(NodeFs.readFileSync(bindingsPath, "utf8")) as {
    byTaskId?: Record<string, { threadId?: string; displayId?: string }>;
  };
  const byTaskId = bindings.byTaskId ?? {};
  const threadIds = Object.values(byTaskId)
    .map((b) => b.threadId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const sql = yield* SqlClient.SqlClient;
  const imported = yield* sql<{ c: number }>`
    SELECT COUNT(*) AS c FROM orchestration_v2_legacy_imports
  `;
  const projected = yield* sql<{ c: number }>`
    SELECT COUNT(*) AS c FROM orchestration_v2_projection_threads
    WHERE deleted_at IS NULL
  `;

  let found = 0;
  let missing = 0;
  const missingSamples: string[] = [];
  for (const threadId of threadIds) {
    const rows = yield* sql<{ thread_id: string }>`
      SELECT thread_id FROM orchestration_v2_projection_threads
      WHERE thread_id = ${threadId}
      LIMIT 1
    `;
    if (rows.length > 0) {
      found += 1;
    } else {
      missing += 1;
      if (missingSamples.length < 8) missingSamples.push(threadId);
    }
  }

  console.log(
    JSON.stringify(
      {
        v1Path,
        v2Path,
        bindingTasks: Object.keys(byTaskId).length,
        bindingThreadIds: threadIds.length,
        legacyImports: imported[0]?.c ?? 0,
        projectedThreads: projected[0]?.c ?? 0,
        bindingsFoundInV2: found,
        bindingsMissingInV2: missing,
        missingSamples,
      },
      null,
      2,
    ),
  );

  if (missing > 0 && found === 0) {
    return yield* Effect.fail(
      new Error("No task bindings resolved to V2 projection threads after migration"),
    );
  }
}).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer)));

NodeRuntime.runMain(program);
