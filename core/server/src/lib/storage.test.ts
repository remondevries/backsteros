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
  ensureVaultStructure,
  getObject,
  isCloudCoreVaultHost,
  isSpacesConfigured,
  isStorageConfigured,
  letterPdfSubjectFromFilename,
  normalizeVaultRelativeKey,
  renameProjectVaultFolder,
  resolveVaultPath,
  rewriteProjectStorageKeyPrefix,
  rewriteProjectVaultWorkingDirectory,
  rewriteLegacyKnowledgeBaseStorageKey,
  setVaultPathCache,
  VAULT_SPACES_FOLDER,
  VAULT_SPACES_FOLDER_LEGACY,
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

test("normalizeVaultRelativeKey maps legacy Knowledge Base to Second brain", () => {
  assert.equal(
    normalizeVaultRelativeKey(`${VAULT_SPACES_FOLDER_LEGACY}/note.md`),
    `${VAULT_SPACES_FOLDER}/knowledge-base/second-brain/note.md`,
  );
  assert.equal(
    normalizeVaultRelativeKey(VAULT_SPACES_FOLDER_LEGACY),
    `${VAULT_SPACES_FOLDER}/knowledge-base/second-brain`,
  );
  assert.equal(
    normalizeVaultRelativeKey(`${VAULT_SPACES_FOLDER}/note.md`),
    `${VAULT_SPACES_FOLDER}/note.md`,
  );
});

test("rewriteLegacyKnowledgeBaseStorageKey prefixes Second brain under Spaces", () => {
  assert.equal(
    rewriteLegacyKnowledgeBaseStorageKey("Knowledge Base/agentmail/overview.md"),
    "Spaces/knowledge-base/second-brain/agentmail/overview.md",
  );
});

test("getObject resolves Portal bytes left under Second brain after Support move", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault-portal-drift-"));
  const previousEnv = process.env.BACKSTEROS_VAULT_PATH;
  try {
    setVaultPathCache(root);
    process.env.BACKSTEROS_VAULT_PATH = root;
    const legacyDir = path.join(
      root,
      VAULT_SPACES_FOLDER,
      "knowledge-base",
      "second-brain",
      "portal",
      "email",
    );
    await mkdir(legacyDir, { recursive: true });
    await writeFile(path.join(legacyDir, "overview.md"), "# Portal email\n", "utf8");

    const preferredKey = `${VAULT_SPACES_FOLDER}/support/portal/email/overview.md`;
    const result = await getObject(preferredKey);
    assert.equal(result.body, "# Portal email\n");

    // Read heals bytes onto the Support path.
    await access(
      path.join(
        root,
        VAULT_SPACES_FOLDER,
        "support",
        "portal",
        "email",
        "overview.md",
      ),
    );
  } finally {
    setVaultPathCache(null);
    if (previousEnv === undefined) delete process.env.BACKSTEROS_VAULT_PATH;
    else process.env.BACKSTEROS_VAULT_PATH = previousEnv;
    await rm(root, { recursive: true, force: true });
  }
});

test("ensureVaultStructure renames legacy Knowledge Base folder to Spaces", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault-spaces-migrate-"));
  await mkdir(path.join(root, VAULT_SPACES_FOLDER_LEGACY), { recursive: true });
  await writeFile(
    path.join(root, VAULT_SPACES_FOLDER_LEGACY, "legacy.md"),
    "# legacy\n",
  );

  await ensureVaultStructure(root);

  await access(
    path.join(
      root,
      VAULT_SPACES_FOLDER,
      "knowledge-base",
      "second-brain",
      "legacy.md",
    ),
  );
  await assert.rejects(
    () => access(path.join(root, VAULT_SPACES_FOLDER_LEGACY)),
  );
  await rm(root, { recursive: true, force: true });
});

test("ensureVaultStructure merges leftover Knowledge Base into Second brain", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault-kb-beside-spaces-"));
  const spaces = path.join(root, VAULT_SPACES_FOLDER);
  const legacy = path.join(root, VAULT_SPACES_FOLDER_LEGACY);
  await mkdir(path.join(spaces, "knowledge-base", "second-brain"), {
    recursive: true,
  });
  await mkdir(path.join(legacy, "agentmail"), { recursive: true });
  await writeFile(path.join(legacy, "scratchpad.md"), "# scratch\n");
  await writeFile(path.join(legacy, "agentmail", "overview.md"), "# am\n");

  await ensureVaultStructure(root);

  await access(
    path.join(
      spaces,
      "knowledge-base",
      "second-brain",
      "scratchpad.md",
    ),
  );
  await access(
    path.join(
      spaces,
      "knowledge-base",
      "second-brain",
      "agentmail",
      "overview.md",
    ),
  );
  await assert.rejects(() => access(legacy));
  await rm(root, { recursive: true, force: true });
});

test("ensureVaultStructure drops duplicate Knowledge Base files already in Second brain", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault-kb-dupes-"));
  const spaces = path.join(root, VAULT_SPACES_FOLDER);
  const legacy = path.join(root, VAULT_SPACES_FOLDER_LEGACY);
  const secondBrain = path.join(spaces, "knowledge-base", "second-brain");
  await mkdir(path.join(secondBrain, "agentmail"), { recursive: true });
  await mkdir(path.join(legacy, "agentmail"), { recursive: true });
  await writeFile(path.join(secondBrain, "scratchpad.md"), "# keep\n");
  await writeFile(path.join(legacy, "scratchpad.md"), "# older dupe\n");
  await writeFile(path.join(secondBrain, "agentmail", "overview.md"), "# keep\n");
  await writeFile(path.join(legacy, "agentmail", "overview.md"), "# older dupe\n");
  await writeFile(path.join(legacy, "only-in-legacy.md"), "# unique\n");

  await ensureVaultStructure(root);

  const kept = await readFile(path.join(secondBrain, "scratchpad.md"), "utf8");
  assert.equal(kept, "# keep\n");
  await access(path.join(secondBrain, "only-in-legacy.md"));
  await assert.rejects(() => access(legacy));
  await rm(root, { recursive: true, force: true });
});

test("ensureVaultStructure creates Spaces hierarchy and migrates loose files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault-spaces-hierarchy-"));
  const spaces = path.join(root, VAULT_SPACES_FOLDER);
  await mkdir(spaces, { recursive: true });
  await writeFile(path.join(spaces, "orphan.md"), "# orphan\n");

  await ensureVaultStructure(root);

  await access(
    path.join(spaces, "knowledge-base", "second-brain", "orphan.md"),
  );
  await access(path.join(spaces, "support"));
  await access(path.join(spaces, "websites"));
  await assert.rejects(() => access(path.join(spaces, "orphan.md")));
  await rm(root, { recursive: true, force: true });
});

test("storage keys follow Obsidian vault layout", () => {
  assert.equal(
    buildStorageKey("journal", "2026-07-16.md", undefined, "ws_123"),
    "Journal/2026-07-16.md",
  );
  assert.equal(
    buildStorageKey("knowledge", "../evil/secrets.md", undefined, "ws_123"),
    "Spaces/evil/secrets.md",
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
