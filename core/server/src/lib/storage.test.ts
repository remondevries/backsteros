import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { PROJECT_VAULT_WORKFLOW_SKILL_ID } from "./project-vault-skill.js";
import {
  assertPrivateStorageKey,
  buildLetterPdfStorageKey,
  buildPrivateStorageKey,
  buildProjectVaultAbsolutePath,
  buildStorageKey,
  buildTaskImageStorageKey,
  buildTaskAttachmentStorageKey,
  buildTaskPdfAttachmentStorageKey,
  checksumForContent,
  ensureProjectVaultFolders,
  isCloudCoreVaultHost,
  isSpacesConfigured,
  isStorageConfigured,
  letterPdfSubjectFromFilename,
  renameProjectVaultFolder,
  resolveVaultPath,
  rewriteProjectStorageKeyPrefix,
  rewriteProjectVaultWorkingDirectory,
  setVaultPathCache,
} from "./storage.js";

test("isStorageConfigured uses vault path cache or env", () => {
  const previousEnv = process.env.BACKSTEROS_VAULT_PATH;
  const previousRole = process.env.CORE_REPLICATION_ROLE;
  setVaultPathCache(null);
  delete process.env.BACKSTEROS_VAULT_PATH;
  delete process.env.CORE_REPLICATION_ROLE;
  assert.equal(isStorageConfigured(), false);
  assert.equal(isSpacesConfigured(), false);

  setVaultPathCache("/tmp/backsteros-vault");
  assert.equal(isStorageConfigured(), true);

  setVaultPathCache(null);
  process.env.BACKSTEROS_VAULT_PATH = "/tmp/from-env";
  assert.equal(isStorageConfigured(), true);

  setVaultPathCache(null);
  if (previousEnv === undefined) delete process.env.BACKSTEROS_VAULT_PATH;
  else process.env.BACKSTEROS_VAULT_PATH = previousEnv;
  if (previousRole === undefined) delete process.env.CORE_REPLICATION_ROLE;
  else process.env.CORE_REPLICATION_ROLE = previousRole;
});

test("cloud-core resolveVaultPath ignores settings Mac path and uses env only", async () => {
  const previousEnv = process.env.BACKSTEROS_VAULT_PATH;
  const previousRole = process.env.CORE_REPLICATION_ROLE;
  setVaultPathCache(null);
  process.env.CORE_REPLICATION_ROLE = "cloud";
  process.env.BACKSTEROS_VAULT_PATH = "/data/vault";

  assert.equal(isCloudCoreVaultHost(), true);
  const resolved = await resolveVaultPath("/Users/remondevries/BacksterOS");
  assert.equal(resolved, path.resolve("/data/vault"));

  setVaultPathCache(null);
  delete process.env.BACKSTEROS_VAULT_PATH;
  await assert.rejects(
    () => resolveVaultPath("/Users/remondevries/BacksterOS"),
    /STORAGE_NOT_CONFIGURED/,
  );

  setVaultPathCache(null);
  if (previousEnv === undefined) delete process.env.BACKSTEROS_VAULT_PATH;
  else process.env.BACKSTEROS_VAULT_PATH = previousEnv;
  if (previousRole === undefined) delete process.env.CORE_REPLICATION_ROLE;
  else process.env.CORE_REPLICATION_ROLE = previousRole;
});

test("storage keys follow Obsidian vault layout", () => {
  assert.equal(
    buildStorageKey("journal", "2026-07-16.md", undefined, "ws_123"),
    "Journal/2026-07-16.md",
  );
  assert.equal(
    buildStorageKey("knowledge", "../evil/secrets.md", undefined, "ws_123"),
    "Knowledge Base/evil/secrets.md",
  );
  assert.equal(
    buildStorageKey("project", "notes/../readme.md", "proj/../key", "ws_123"),
    "Projects/proj_.._key/Documents/notes/readme.md",
  );
  assert.equal(
    buildPrivateStorageKey("ws_123", "pdfs", "letter_1", "../../letter.pdf"),
    ".backsteros/pdfs/letter_1/_.._letter.pdf",
  );
  assert.equal(
    buildPrivateStorageKey("ws_123", "avatars", "contact_1", "avatar"),
    ".backsteros/avatars/contact_1/avatar",
  );
  assert.equal(
    buildPrivateStorageKey(
      "ws_123",
      "attachments",
      "task_1",
      "img_abc.png",
    ),
    ".backsteros/attachments/tasks/task_1/img_abc.png",
  );
  assert.equal(
    buildTaskImageStorageKey("task_1", "img_abc", "png"),
    ".backsteros/attachments/tasks/task_1/img_abc.png",
  );
  assert.equal(
    buildTaskAttachmentStorageKey("task_1", "att_abcdefgh", "brief.pdf"),
    ".backsteros/attachments/tasks/task_1/brief-att_abcd.pdf",
  );
  assert.equal(
    buildTaskAttachmentStorageKey("task_1", "att_abcdefgh", "photo.PNG"),
    ".backsteros/attachments/tasks/task_1/photo-att_abcd.png",
  );
  assert.equal(
    buildTaskAttachmentStorageKey("task_1", "att_abcdefgh", "invoice.eml"),
    ".backsteros/attachments/tasks/task_1/invoice-att_abcd.eml",
  );
  assert.equal(
    buildTaskPdfAttachmentStorageKey("task_1", "att_abcdefgh", "brief.pdf"),
    ".backsteros/attachments/tasks/task_1/brief-att_abcd.pdf",
  );
  assert.equal(
    buildLetterPdfStorageKey({
      title: "Tax return",
      // Local calendar day (matches Received Date picker), not UTC stamp.
      receivedDate: new Date(2026, 6, 26),
      attachmentId: "att_abcdefgh",
    }),
    "Letters/2026/07/2026-07-26 - Tax return (att_abcd).pdf",
  );
  assert.equal(
    buildLetterPdfStorageKey({
      title: "New letter",
      subject: "gemeentelijke belastingen",
      receivedDate: new Date(2026, 8, 3),
      attachmentId: "PO6ZRt4HHJ8fc5NonVqmU",
    }),
    "Letters/2026/09/2026-09-03 - gemeentelijke belastingen (PO6ZRt4H).pdf",
  );
  // Local midnight stored as previous-day UTC must still file on the UI day.
  assert.equal(
    buildLetterPdfStorageKey({
      title: "IB 2022",
      receivedDate: new Date(2024, 3, 19),
      attachmentId: "att_abcdefgh",
    }),
    "Letters/2024/04/2024-04-19 - IB 2022 (att_abcd).pdf",
  );
  assert.equal(
    letterPdfSubjectFromFilename("2026-08-22 - gemeentelijke belastingen.pdf"),
    "gemeentelijke belastingen",
  );
  assert.equal(
    letterPdfSubjectFromFilename("Gemeente Belastingen 2025.pdf"),
    "Gemeente Belastingen 2025",
  );
  assert.doesNotThrow(() =>
    assertPrivateStorageKey(
      "ws_123",
      ".backsteros/avatars/contact_1/avatar",
    ),
  );
  assert.throws(
    () => assertPrivateStorageKey("ws_123", "../outside/avatar"),
    /STORAGE_KEY_OUTSIDE_WORKSPACE/,
  );
});

test("checksums support text and binary content", () => {
  const text = "BacksterOS";
  assert.equal(checksumForContent(text), checksumForContent(Buffer.from(text)));
});

test("ensureProjectVaultFolders creates areas, .cursor skill, and is idempotent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "backsteros-vault-"));
  const previous = null;
  setVaultPathCache(root);
  try {
    const first = await ensureProjectVaultFolders("BOD", undefined, {
      projectType: "codebase",
    });
    assert.equal(
      first.projectVaultPath,
      buildProjectVaultAbsolutePath(root, "BOD"),
    );
    assert.equal(first.createdSkill, true);

    for (const name of ["Codebase", "Documents", "Updates"] as const) {
      await access(path.join(first.projectVaultPath, name));
    }

    const skillPath = path.join(
      first.projectVaultPath,
      ".cursor",
      "skills",
      PROJECT_VAULT_WORKFLOW_SKILL_ID,
      "SKILL.md",
    );
    const skillBody = await readFile(skillPath, "utf8");
    assert.match(skillBody, /backsteros-workflow-in_review-or-on_hold/);
    assert.match(skillBody, /in_review/);

    // User edit must be preserved on second ensure.
    await writeFile(skillPath, "# custom\n", "utf8");
    const second = await ensureProjectVaultFolders("BOD", undefined, {
      projectType: "codebase",
    });
    assert.equal(second.createdSkill, false);
    assert.equal(await readFile(skillPath, "utf8"), "# custom\n");
  } finally {
    setVaultPathCache(previous);
    await rm(root, { recursive: true, force: true });
  }
});

test("ensureProjectVaultFolders omits Codebase for non-codebase projects", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "backsteros-vault-"));
  setVaultPathCache(root);
  try {
    const ensured = await ensureProjectVaultFolders("GEN", undefined, {
      projectType: "general",
    });
    await access(path.join(ensured.projectVaultPath, "Documents"));
    await access(path.join(ensured.projectVaultPath, "Updates"));
    await assert.rejects(
      () => access(path.join(ensured.projectVaultPath, "Codebase")),
      (error: NodeJS.ErrnoException) => error.code === "ENOENT",
    );

    // Empty leftover Codebase from older bootstraps is removed.
    await mkdir(path.join(ensured.projectVaultPath, "Codebase"), {
      recursive: true,
    });
    await ensureProjectVaultFolders("GEN", undefined, {
      projectType: "general",
    });
    await assert.rejects(
      () => access(path.join(ensured.projectVaultPath, "Codebase")),
      (error: NodeJS.ErrnoException) => error.code === "ENOENT",
    );
  } finally {
    setVaultPathCache(null);
    await rm(root, { recursive: true, force: true });
  }
});

test("renameProjectVaultFolder moves the project folder and rewrites helpers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "backsteros-vault-"));
  setVaultPathCache(root);
  try {
    const created = await ensureProjectVaultFolders("OLD", undefined, {
      projectType: "general",
    });
    const notePath = path.join(created.projectVaultPath, "Documents", "note.md");
    await writeFile(notePath, "# hello\n", "utf8");

    const renamed = await renameProjectVaultFolder("OLD", "NEW");
    assert.equal(renamed.renamed, true);
    assert.equal(
      renamed.projectVaultPath,
      buildProjectVaultAbsolutePath(root, "NEW"),
    );
    await access(path.join(renamed.projectVaultPath, "Documents", "note.md"));
    await assert.rejects(
      () => access(created.projectVaultPath),
      (error: NodeJS.ErrnoException) => error.code === "ENOENT",
    );

    assert.equal(
      rewriteProjectStorageKeyPrefix(
        "Projects/OLD/Documents/note.md",
        "OLD",
        "NEW",
      ),
      "Projects/NEW/Documents/note.md",
    );
    assert.equal(
      rewriteProjectVaultWorkingDirectory(
        created.projectVaultPath,
        created.projectVaultPath,
        renamed.projectVaultPath,
      ),
      renamed.projectVaultPath,
    );
    assert.equal(
      rewriteProjectVaultWorkingDirectory(
        "/somewhere/else",
        created.projectVaultPath,
        renamed.projectVaultPath,
      ),
      null,
    );
  } finally {
    setVaultPathCache(null);
    await rm(root, { recursive: true, force: true });
  }
});
