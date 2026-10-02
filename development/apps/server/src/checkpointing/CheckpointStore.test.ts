// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { ThreadId, type VcsError } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Scope from "effect/Scope";
import { describe, expect } from "vite-plus/test";

import { checkpointRefForThreadTurn } from "./Utils.ts";
import { parseTurnDiffFilesFromNumstat } from "./Diffs.ts";
import * as CheckpointStore from "./CheckpointStore.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as ServerConfig from "../config.ts";

const ServerConfigLayer = ServerConfig.ServerConfig.layerTest(process.cwd(), {
  prefix: "t3-checkpoint-store-test-",
});
const VcsProcessTestLayer = VcsProcess.layer.pipe(Layer.provide(NodeServices.layer));
const VcsDriverTestLayer = VcsDriverRegistry.layer.pipe(Layer.provide(VcsProcessTestLayer));
const CheckpointStoreTestLayer = CheckpointStore.layer.pipe(
  Layer.provideMerge(VcsDriverTestLayer),
  Layer.provideMerge(NodeServices.layer),
);
const TestLayer = CheckpointStoreTestLayer.pipe(
  Layer.provideMerge(VcsProcessTestLayer),
  Layer.provideMerge(VcsDriverTestLayer),
  Layer.provideMerge(ServerConfigLayer),
  Layer.provideMerge(NodeServices.layer),
);

function makeTmpDir(
  prefix = "checkpoint-store-test-",
): Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem | Scope.Scope> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem.makeTempDirectoryScoped({ prefix });
  });
}

function writeTextFile(
  filePath: string,
  contents: string,
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.writeFileString(filePath, contents);
  });
}

function git(
  cwd: string,
  args: ReadonlyArray<string>,
): Effect.Effect<string, VcsError, VcsProcess.VcsProcess> {
  return Effect.gen(function* () {
    const process = yield* VcsProcess.VcsProcess;
    const result = yield* process.run({
      operation: "CheckpointStore.test.git",
      command: "git",
      cwd,
      args,
      timeoutMs: 10_000,
    });
    return result.stdout.trim();
  });
}

function gitLong(
  cwd: string,
  args: ReadonlyArray<string>,
): Effect.Effect<string, VcsError, VcsProcess.VcsProcess> {
  return Effect.gen(function* () {
    const process = yield* VcsProcess.VcsProcess;
    const result = yield* process.run({
      operation: "CheckpointStore.test.gitLong",
      command: "git",
      cwd,
      args,
      timeoutMs: 180_000,
      maxOutputBytes: 16 * 1024 * 1024,
    });
    return result.stdout.trim();
  });
}

function initRepoWithCommit(
  cwd: string,
): Effect.Effect<
  void,
  VcsError | PlatformError.PlatformError,
  VcsProcess.VcsProcess | FileSystem.FileSystem
> {
  return Effect.gen(function* () {
    yield* git(cwd, ["init"]);
    yield* git(cwd, ["config", "user.email", "test@test.com"]);
    yield* git(cwd, ["config", "user.name", "Test"]);
    yield* writeTextFile(NodePath.join(cwd, "README.md"), "# test\n");
    yield* git(cwd, ["add", "."]);
    yield* git(cwd, ["commit", "-m", "initial commit"]);
  });
}

function buildLargeText(lineCount = 5_000): string {
  return Array.from({ length: lineCount }, (_, index) => `line ${String(index).padStart(5, "0")}`)
    .join("\n")
    .concat("\n");
}

it.layer(TestLayer)("CheckpointStore.layer", (it) => {
  describe("isGitRepository", () => {
    it.effect("returns false when no Git repository is detected", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        const checkpointStore = yield* CheckpointStore.CheckpointStore;

        expect(yield* checkpointStore.isGitRepository(tmp)).toBe(false);
      }),
    );

    it.effect("returns true when a Git repository is detected", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;

        expect(yield* checkpointStore.isGitRepository(tmp)).toBe(true);
      }),
    );
  });

  describe("diffCheckpoints", () => {
    it.effect("returns full oversized checkpoint diffs without truncation", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("thread-checkpoint-store");
        const fromCheckpointRef = checkpointRefForThreadTurn(threadId, 0);
        const toCheckpointRef = checkpointRefForThreadTurn(threadId, 1);

        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: fromCheckpointRef,
        });
        yield* writeTextFile(NodePath.join(tmp, "README.md"), buildLargeText());
        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: toCheckpointRef,
        });

        const diff = yield* checkpointStore.diffCheckpoints({
          cwd: tmp,
          fromCheckpointRef,
          toCheckpointRef,
          ignoreWhitespace: true,
        });

        expect(diff).toContain("diff --git");
        expect(diff).not.toContain("[truncated]");
        expect(diff).toContain("+line 04999");
      }),
    );

    it.effect("keeps a/ and b/ patch prefixes when the repository disables them", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        yield* git(tmp, ["config", "diff.noprefix", "true"]);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("thread-checkpoint-store-noprefix");
        const fromCheckpointRef = checkpointRefForThreadTurn(threadId, 0);
        const toCheckpointRef = checkpointRefForThreadTurn(threadId, 1);

        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: fromCheckpointRef,
        });
        yield* writeTextFile(NodePath.join(tmp, "README.md"), "# changed\n");
        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: toCheckpointRef,
        });

        const diff = yield* checkpointStore.diffCheckpoints({
          cwd: tmp,
          fromCheckpointRef,
          toCheckpointRef,
          ignoreWhitespace: false,
        });

        expect(diff).toContain("diff --git a/README.md b/README.md");
      }),
    );

    it.effect("can hide indentation churn when changes wrap existing lines", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("thread-checkpoint-store-whitespace");
        const fromCheckpointRef = checkpointRefForThreadTurn(threadId, 0);
        const toCheckpointRef = checkpointRefForThreadTurn(threadId, 1);

        const componentPath = NodePath.join(tmp, "Component.tsx");
        yield* writeTextFile(
          componentPath,
          [
            "export function View() {",
            "  return (",
            "    <section>",
            "      <h1>Title</h1>",
            "      <p>Body</p>",
            "    </section>",
            "  );",
            "}",
            "",
          ].join("\n"),
        );
        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: fromCheckpointRef,
        });
        yield* writeTextFile(
          componentPath,
          [
            "export function View() {",
            "  return (",
            "    <section>",
            "      {isReady ? (",
            "        <div>",
            "          <h1>Title</h1>",
            "          <p>Body</p>",
            "        </div>",
            "      ) : null}",
            "    </section>",
            "  );",
            "}",
            "",
          ].join("\n"),
        );
        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: toCheckpointRef,
        });

        const normalDiff = yield* checkpointStore.diffCheckpoints({
          cwd: tmp,
          fromCheckpointRef,
          toCheckpointRef,
          ignoreWhitespace: false,
        });
        const whitespaceIgnoredDiff = yield* checkpointStore.diffCheckpoints({
          cwd: tmp,
          fromCheckpointRef,
          toCheckpointRef,
          ignoreWhitespace: true,
        });

        expect(normalDiff).toContain("diff --git");
        expect(normalDiff).toContain("-      <h1>Title</h1>");
        expect(normalDiff).toContain("+          <h1>Title</h1>");
        expect(whitespaceIgnoredDiff).toContain("diff --git");
        expect(whitespaceIgnoredDiff).toContain("+      {isReady ? (");
        expect(whitespaceIgnoredDiff).toContain("+        <div>");
        expect(whitespaceIgnoredDiff).not.toContain("-      <h1>Title</h1>");
        expect(whitespaceIgnoredDiff).not.toContain("+          <h1>Title</h1>");

        for (const ignoreWhitespace of [false, true]) {
          const numstat = yield* checkpointStore.diffCheckpoints({
            cwd: tmp,
            fromCheckpointRef,
            toCheckpointRef,
            ignoreWhitespace,
            format: "numstat",
          });
          expect(parseTurnDiffFilesFromNumstat(numstat)).toEqual([
            {
              path: "Component.tsx",
              additions: ignoreWhitespace ? 4 : 6,
              deletions: ignoreWhitespace ? 0 : 2,
            },
          ]);
        }
      }),
    );
  });

  describe("checkpoint file summaries", () => {
    it.effect("counts changes whose full patch exceeds the output limit", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("large-checkpoint-summary");
        const fromCheckpointRef = checkpointRefForThreadTurn(threadId, 0);
        const toCheckpointRef = checkpointRefForThreadTurn(threadId, 1);
        const filePath = NodePath.join(tmp, "README.md");
        const lineCount = 20_000;
        yield* writeTextFile(filePath, `${"before".repeat(50)}\n`.repeat(lineCount));
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: fromCheckpointRef });
        yield* writeTextFile(filePath, `${"after".repeat(60)}\n`.repeat(lineCount));
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: toCheckpointRef });

        const numstat = yield* checkpointStore.diffCheckpoints({
          cwd: tmp,
          fromCheckpointRef,
          toCheckpointRef,
          ignoreWhitespace: false,
          format: "numstat",
        });

        expect(parseTurnDiffFilesFromNumstat(numstat)).toEqual([
          { path: "README.md", additions: lineCount, deletions: lineCount },
        ]);
        expect(numstat.length).toBeLessThan(100);
      }),
    );

    it.effect("preserves file paths and turn ranges without changing the user index", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        yield* git(tmp, ["config", "diff.renames", "copies"]);
        const fileSystem = yield* FileSystem.FileSystem;
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("checkpoint-summary-paths");
        const baseline = checkpointRefForThreadTurn(threadId, 0);
        const firstTurn = checkpointRefForThreadTurn(threadId, 1);
        const secondTurn = checkpointRefForThreadTurn(threadId, 2);
        const copiedText = Array.from({ length: 20 }, (_, index) => `copy line ${index}\n`).join(
          "",
        );
        const platform = yield* HostProcessPlatform;
        const renamedPath = platform === "win32" ? "renamed café.txt" : "renamed\tcafé\nname.txt";
        const addedPath = platform === "win32" ? "new café.txt" : "new\tfile\n名.txt";
        for (const [path, contents] of Object.entries({
          "copy-source.txt": copiedText,
          "deleted.txt": "delete me\n",
          "rename-old.txt": "before\nkeep one\nkeep two\nkeep three\n",
          "binary.bin": "\0before",
        })) {
          yield* writeTextFile(NodePath.join(tmp, path), contents);
        }
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: baseline });

        yield* fileSystem.rename(
          NodePath.join(tmp, "rename-old.txt"),
          NodePath.join(tmp, renamedPath),
        );
        yield* fileSystem.remove(NodePath.join(tmp, "deleted.txt"));
        for (const [path, contents] of Object.entries({
          "copy-source.txt": `${copiedText}one more\n`,
          "copied.txt": copiedText,
          [renamedPath]: "after\nkeep one\nkeep two\nkeep three\n",
          "binary.bin": "\0after",
          "empty.txt": "",
          [addedPath]: "first\nsecond\n",
        })) {
          yield* writeTextFile(NodePath.join(tmp, path), contents);
        }
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: firstTurn });
        const userIndex = yield* fileSystem.readFile(NodePath.join(tmp, ".git/index"));
        const input = {
          cwd: tmp,
          fromCheckpointRef: baseline,
          toCheckpointRef: firstTurn,
          ignoreWhitespace: false,
          format: "numstat" as const,
        };
        const firstSummary = parseTurnDiffFilesFromNumstat(
          yield* checkpointStore.diffCheckpoints(input),
        );
        const expectedFiles = [
          { path: "binary.bin", additions: 0, deletions: 0 },
          { path: "copied.txt", additions: 0, deletions: 0 },
          { path: "copy-source.txt", additions: 1, deletions: 0 },
          { path: "deleted.txt", additions: 0, deletions: 1 },
          { path: "empty.txt", additions: 0, deletions: 0 },
          { path: addedPath, additions: 2, deletions: 0 },
          { path: renamedPath, additions: 1, deletions: 1 },
        ].toSorted((left, right) => left.path.localeCompare(right.path));
        expect(firstSummary).toEqual(expectedFiles);

        yield* fileSystem.remove(NodePath.join(tmp, "empty.txt"));
        yield* writeTextFile(NodePath.join(tmp, "copy-source.txt"), "replacement\n");
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: secondTurn });
        const secondSummary = parseTurnDiffFilesFromNumstat(
          yield* checkpointStore.diffCheckpoints({
            ...input,
            fromCheckpointRef: firstTurn,
            toCheckpointRef: secondTurn,
          }),
        );
        expect(secondSummary).toEqual([
          { path: "copy-source.txt", additions: 1, deletions: 21 },
          { path: "empty.txt", additions: 0, deletions: 0 },
        ]);

        const inclusiveSummary = parseTurnDiffFilesFromNumstat(
          yield* checkpointStore.diffCheckpoints({ ...input, toCheckpointRef: secondTurn }),
        );
        expect(inclusiveSummary).toEqual(
          expectedFiles
            .filter((file) => file.path !== "empty.txt")
            .map((file) =>
              file.path === "copy-source.txt" ? { ...file, additions: 1, deletions: 20 } : file,
            ),
        );
        expect(
          yield* checkpointStore.diffCheckpoints({ ...input, toCheckpointRef: baseline }),
        ).toBe("");
        expect(yield* fileSystem.readFile(NodePath.join(tmp, ".git/index"))).toEqual(userIndex);
      }),
    );

    it.effect("uses HEAD for a missing baseline only when requested", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("checkpoint-summary-fallback");
        const fromCheckpointRef = checkpointRefForThreadTurn(threadId, 0);
        const toCheckpointRef = checkpointRefForThreadTurn(threadId, 1);
        yield* writeTextFile(NodePath.join(tmp, "README.md"), "changed\n");
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: toCheckpointRef });
        const input = {
          cwd: tmp,
          fromCheckpointRef,
          toCheckpointRef,
          ignoreWhitespace: false,
          format: "numstat" as const,
        };

        const error = yield* Effect.flip(checkpointStore.diffCheckpoints(input));
        expect(error._tag).toBe("VcsProcessExitError");
        const numstat = yield* checkpointStore.diffCheckpoints({
          ...input,
          fallbackFromToHead: true,
        });
        expect(parseTurnDiffFilesFromNumstat(numstat)).toEqual([
          { path: "README.md", additions: 1, deletions: 1 },
        ]);
      }),
    );
  });

  describe("captureCheckpoint reuse with untracked files (OS-73)", () => {
    it.effect("reuses the previous checkpoint when untracked files are unchanged", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("checkpoint-reuse-untracked");
        const first = checkpointRefForThreadTurn(threadId, 1);
        const second = checkpointRefForThreadTurn(threadId, 2);

        yield* writeTextFile(NodePath.join(tmp, "scratch.local"), "same-bytes\n");
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: first });
        const firstOid = yield* git(tmp, ["rev-parse", first]);

        // Untracked file still present with identical content — must reuse.
        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: second,
          reuseIfUnchangedFromRef: first,
        });
        const secondOid = yield* git(tmp, ["rev-parse", second]);
        expect(secondOid).toBe(firstOid);
      }),
    );

    it.effect("captures a new checkpoint when an untracked file changes", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("checkpoint-reuse-untracked-dirty");
        const first = checkpointRefForThreadTurn(threadId, 1);
        const second = checkpointRefForThreadTurn(threadId, 2);

        yield* writeTextFile(NodePath.join(tmp, "scratch.local"), "v1\n");
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: first });
        const firstOid = yield* git(tmp, ["rev-parse", first]);

        yield* writeTextFile(NodePath.join(tmp, "scratch.local"), "v2\n");
        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: second,
          reuseIfUnchangedFromRef: first,
        });
        const secondOid = yield* git(tmp, ["rev-parse", second]);
        expect(secondOid).not.toBe(firstOid);

        const diff = yield* checkpointStore.diffCheckpoints({
          cwd: tmp,
          fromCheckpointRef: first,
          toCheckpointRef: second,
          ignoreWhitespace: false,
        });
        expect(diff).toContain("scratch.local");
      }),
    );

    it.effect("captures a new checkpoint when a new untracked file appears", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("checkpoint-reuse-untracked-new");
        const first = checkpointRefForThreadTurn(threadId, 1);
        const second = checkpointRefForThreadTurn(threadId, 2);

        yield* writeTextFile(NodePath.join(tmp, "a.local"), "a\n");
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: first });
        const firstOid = yield* git(tmp, ["rev-parse", first]);

        yield* writeTextFile(NodePath.join(tmp, "b.local"), "b\n");
        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: second,
          reuseIfUnchangedFromRef: first,
        });
        const secondOid = yield* git(tmp, ["rev-parse", second]);
        expect(secondOid).not.toBe(firstOid);
      }),
    );

    it.effect("captures a new checkpoint when an untracked file becomes executable", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        yield* git(tmp, ["config", "core.fileMode", "true"]);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const fileSystem = yield* FileSystem.FileSystem;
        const threadId = ThreadId.make("checkpoint-reuse-chmod");
        const first = checkpointRefForThreadTurn(threadId, 1);
        const second = checkpointRefForThreadTurn(threadId, 2);

        yield* writeTextFile(NodePath.join(tmp, "scratch.local"), "same-bytes\n");
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: first });
        const firstOid = yield* git(tmp, ["rev-parse", first]);
        const firstMode = yield* git(tmp, ["ls-tree", first, "scratch.local"]);
        expect(firstMode.startsWith("100644")).toBe(true);

        yield* fileSystem.chmod(NodePath.join(tmp, "scratch.local"), 0o755);
        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: second,
          reuseIfUnchangedFromRef: first,
        });
        const secondOid = yield* git(tmp, ["rev-parse", second]);
        expect(secondOid).not.toBe(firstOid);
        const secondMode = yield* git(tmp, ["ls-tree", second, "scratch.local"]);
        expect(secondMode.startsWith("100755")).toBe(true);
      }),
    );

    it.effect("falls back to a full capture when the reuse probe fails", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const fileSystem = yield* FileSystem.FileSystem;
        const threadId = ThreadId.make("checkpoint-reuse-probe-fail");
        const first = checkpointRefForThreadTurn(threadId, 1);
        const second = checkpointRefForThreadTurn(threadId, 2);

        yield* writeTextFile(NodePath.join(tmp, "a.local"), "a\n");
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: first });
        const firstOid = yield* git(tmp, ["rev-parse", first]);

        yield* writeTextFile(NodePath.join(tmp, "b.local"), "b\n");
        yield* fileSystem.writeFileString(NodePath.join(tmp, ".git/index"), "not-a-git-index\n");

        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: second,
          reuseIfUnchangedFromRef: first,
        });
        const secondOid = yield* git(tmp, ["rev-parse", second]);
        expect(secondOid).not.toBe(firstOid);
        const tree = yield* git(tmp, ["ls-tree", "-r", "--name-only", second]);
        expect(tree.split("\n")).toContain("b.local");
      }),
    );

    it.effect("large tracked path listing (>1.2MB) reuses or falls back without error", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("checkpoint-reuse-large-tree");
        const first = checkpointRefForThreadTurn(threadId, 1);
        const second = checkpointRefForThreadTurn(threadId, 2);

        // ~6000 paths × ~220 bytes ≈ 1.3MB of `git ls-files -z` output.
        yield* Effect.promise(() => seedLargeTrackedTree(tmp, 6_000, 200));
        yield* gitLong(tmp, ["add", "-A"]);
        yield* gitLong(tmp, ["commit", "-m", "large tree"]);

        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: first });
        const firstOid = yield* git(tmp, ["rev-parse", first]);

        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: second,
          reuseIfUnchangedFromRef: first,
        });
        const secondOid = yield* git(tmp, ["rev-parse", second]);
        // Unchanged tree → reuse; if listing truncates for some reason, full
        // capture still succeeds and may produce an equivalent tree commit.
        expect(secondOid.length).toBe(40);
        expect(firstOid.length).toBe(40);
      }),
    );

    it.effect("forced listing truncation falls back to a full capture", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("checkpoint-reuse-truncation");
        const first = checkpointRefForThreadTurn(threadId, 1);
        const second = checkpointRefForThreadTurn(threadId, 2);

        yield* writeTextFile(NodePath.join(tmp, "tracked.txt"), "v1\n");
        yield* git(tmp, ["add", "tracked.txt"]);
        yield* git(tmp, ["commit", "-m", "tracked"]);
        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: first });

        const previous = GitVcsDriver.checkpointReuseListingLimits.maxOutputBytes;
        // Force every reuse listing call to report truncation.
        GitVcsDriver.checkpointReuseListingLimits.maxOutputBytes = 8;
        try {
          yield* checkpointStore.captureCheckpoint({
            cwd: tmp,
            checkpointRef: second,
            reuseIfUnchangedFromRef: first,
          });
          const secondOid = yield* git(tmp, ["rev-parse", second]);
          expect(secondOid.length).toBe(40);
        } finally {
          GitVcsDriver.checkpointReuseListingLimits.maxOutputBytes = previous;
        }
      }),
    );

    it.effect("a changed file beyond the old pathspec cutoff produces a new checkpoint", () =>
      Effect.gen(function* () {
        const tmp = yield* makeTmpDir();
        yield* initRepoWithCommit(tmp);
        const checkpointStore = yield* CheckpointStore.CheckpointStore;
        const threadId = ThreadId.make("checkpoint-reuse-late-change");
        const first = checkpointRefForThreadTurn(threadId, 1);
        const second = checkpointRefForThreadTurn(threadId, 2);

        // Seed enough tracked paths that the old per-pathspec argv would truncate
        // well before the last file; change that late file and expect no reuse.
        yield* Effect.promise(() => seedLargeTrackedTree(tmp, 5_000, 200));
        const lateRelative = "z-late/zzzz-last.txt";
        yield* Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          yield* fileSystem.makeDirectory(NodePath.join(tmp, "z-late"), { recursive: true });
        });
        yield* writeTextFile(NodePath.join(tmp, lateRelative), "before\n");
        yield* gitLong(tmp, ["add", "-A"]);
        yield* gitLong(tmp, ["commit", "-m", "large + late"]);

        yield* checkpointStore.captureCheckpoint({ cwd: tmp, checkpointRef: first });
        const firstOid = yield* git(tmp, ["rev-parse", first]);

        yield* writeTextFile(NodePath.join(tmp, lateRelative), "after\n");
        yield* checkpointStore.captureCheckpoint({
          cwd: tmp,
          checkpointRef: second,
          reuseIfUnchangedFromRef: first,
        });
        const secondOid = yield* git(tmp, ["rev-parse", second]);
        expect(secondOid).not.toBe(firstOid);
      }),
    );
  });
});

/** Create many tracked empty files with long relative paths (for listing-size tests). */
async function seedLargeTrackedTree(
  cwd: string,
  fileCount: number,
  namePad: number,
): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(cwd, "bulk");
  await fs.mkdir(dir, { recursive: true });
  const pad = "p".repeat(namePad);
  const writes: Array<Promise<void>> = [];
  for (let i = 0; i < fileCount; i += 1) {
    const name = `${pad}-${String(i).padStart(5, "0")}.txt`;
    writes.push(fs.writeFile(path.join(dir, name), "", "utf8"));
    if (writes.length >= 500) {
      await Promise.all(writes);
      writes.length = 0;
    }
  }
  if (writes.length > 0) await Promise.all(writes);
}
