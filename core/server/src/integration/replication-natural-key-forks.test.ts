/**
 * OS-89: natural-key healing for remaining identity unique indexes, and an
 * explicit dead-letter (or not-unique) decision for every other replicated
 * unique index that can fork across cores.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq, inArray } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import {
  avatars,
  bankAccounts,
  contacts,
  documentPropertyTypes,
  documents,
  emailThreads,
  financialTransactions,
  organizations,
  projects,
  replicationDeadLetters,
  spaceSiteKeys,
  devicePushTokens,
  users,
  workspaces,
} from "../db/schema.js";
import { applyRemoteChanges } from "../services/core-replication/apply.js";
import type { KnownTable } from "../services/core-replication/tables.js";
import type { ReplicationRow } from "../services/core-replication/types.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.CORE_REPLICATION_RECONCILE = "0";

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

async function seedWorkspace() {
  const userId = id("user");
  const workspaceId = id("workspace");
  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `${userId}@example.test`,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "OS-89 WS",
    slug: id("nk"),
    ownerUserId: userId,
  });
  return { userId, workspaceId };
}

async function dropLetters(rowIds: string[]) {
  if (rowIds.length === 0) return;
  await db
    .delete(replicationDeadLetters)
    .where(inArray(replicationDeadLetters.rowId, rowIds));
}

test("OS-89 natural-key heal space_site_keys on (workspace, space, prefix)", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const spaceDocId = id("doc");
  const localId = id("ssk");
  const incomingId = id("ssk");
  const older = "2026-09-13T17:41:20.092Z";
  const newer = "2026-09-13T18:21:18.316Z";
  const prefix = `pfx${randomUUID().slice(0, 8)}`;

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(spaceSiteKeys).where(eq(spaceSiteKeys.workspaceId, workspaceId));
    await db.delete(documents).where(eq(documents.id, spaceDocId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(documents).values({
    id: spaceDocId,
    workspaceId,
    type: "folder",
    kind: "space",
    path: `/spaces/${spaceDocId}`,
    title: "Space",
    storageKey: `vault/spaces/${spaceDocId}`,
  });
  await db.insert(spaceSiteKeys).values({
    id: localId,
    workspaceId,
    spaceDocumentId: spaceDocId,
    label: "local",
    siteKeyPrefix: prefix,
    siteKeyHash: "local-hash",
    updatedAt: new Date(older),
  });

  const incoming: ReplicationRow = {
    id: incomingId,
    workspace_id: workspaceId,
    space_document_id: spaceDocId,
    label: "incoming",
    site_key_prefix: prefix,
    site_key_hash: "incoming-hash",
    created_at: newer,
    updated_at: newer,
  };
  const applied = await applyRemoteChanges("space_site_keys", [
    { table: "space_site_keys", row: incoming },
  ]);
  assert.equal(applied.failed.length, 0);
  assert.equal(applied.applied, 1);
  const rows = await db
    .select()
    .from(spaceSiteKeys)
    .where(eq(spaceSiteKeys.workspaceId, workspaceId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, incomingId);

  await db.delete(spaceSiteKeys).where(eq(spaceSiteKeys.workspaceId, workspaceId));
  await db.insert(spaceSiteKeys).values({
    id: localId,
    workspaceId,
    spaceDocumentId: spaceDocId,
    label: "local-newer",
    siteKeyPrefix: prefix,
    siteKeyHash: "local-hash",
    updatedAt: new Date(newer),
  });
  const skipped = await applyRemoteChanges("space_site_keys", [
    {
      table: "space_site_keys",
      row: { ...incoming, label: "older", updated_at: older, created_at: older },
    },
  ]);
  assert.equal(skipped.failed.length, 0);
  assert.equal(skipped.skipped, 1);
  const kept = await db
    .select()
    .from(spaceSiteKeys)
    .where(eq(spaceSiteKeys.workspaceId, workspaceId));
  assert.equal(kept[0]?.id, localId);
});

test("OS-89 natural-key heal avatars on (workspace, entity_type, entity_id)", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("av");
  const incomingId = id("av");
  const entityId = id("ent");
  const older = "2026-01-01T00:00:00.000Z";
  const newer = "2026-02-01T00:00:00.000Z";

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(avatars).where(eq(avatars.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(avatars).values({
    id: localId,
    workspaceId,
    entityType: "contact",
    entityId,
    storageKey: "avatars/local.png",
    contentType: "image/png",
    byteSize: 10,
    checksum: "local",
    updatedAt: new Date(older),
  });
  const result = await applyRemoteChanges("avatars", [
    {
      table: "avatars",
      row: {
        id: incomingId,
        workspace_id: workspaceId,
        entity_type: "contact",
        entity_id: entityId,
        storage_key: "avatars/incoming.png",
        content_type: "image/png",
        byte_size: 20,
        checksum: "incoming",
        created_at: newer,
        updated_at: newer,
      },
    },
  ]);
  assert.equal(result.failed.length, 0);
  assert.equal(result.applied, 1);
  const rows = await db.select().from(avatars).where(eq(avatars.workspaceId, workspaceId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, incomingId);
  assert.equal(rows[0]?.storageKey, "avatars/incoming.png");
});

test("OS-89 natural-key heal device_push_tokens on (workspace, token)", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("dpt");
  const incomingId = id("dpt");
  const token = `tok-${randomUUID()}`;
  const older = "2026-01-01T00:00:00.000Z";
  const newer = "2026-02-01T00:00:00.000Z";

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db
      .delete(devicePushTokens)
      .where(eq(devicePushTokens.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(devicePushTokens).values({
    id: localId,
    workspaceId,
    userId,
    platform: "ios",
    token,
    updatedAt: new Date(older),
  });
  const result = await applyRemoteChanges("device_push_tokens", [
    {
      table: "device_push_tokens",
      row: {
        id: incomingId,
        workspace_id: workspaceId,
        user_id: userId,
        platform: "ios",
        token,
        device_name: "incoming",
        updated_at: newer,
      },
    },
  ]);
  assert.equal(result.failed.length, 0);
  assert.equal(result.applied, 1);
  const rows = await db
    .select()
    .from(devicePushTokens)
    .where(eq(devicePushTokens.workspaceId, workspaceId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, incomingId);
});

test("OS-89 natural-key heal financial_transactions on (account, fingerprint)", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const accountId = id("ba");
  const localId = id("txn");
  const incomingId = id("txn");
  const fingerprint = `fp-${randomUUID()}`;
  const older = "2026-01-01T00:00:00.000Z";
  const newer = "2026-02-01T00:00:00.000Z";

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db
      .delete(financialTransactions)
      .where(eq(financialTransactions.workspaceId, workspaceId));
    await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(bankAccounts).values({
    id: accountId,
    workspaceId,
    key: `ba-${randomUUID().slice(0, 8)}`,
    name: "Ledger",
  });
  await db.insert(financialTransactions).values({
    id: localId,
    workspaceId,
    bankAccountId: accountId,
    bookedOn: "2026-01-02",
    amountCents: 100,
    fingerprint,
    payee: "local",
    updatedAt: new Date(older),
  });
  const result = await applyRemoteChanges("financial_transactions", [
    {
      table: "financial_transactions",
      row: {
        id: incomingId,
        workspace_id: workspaceId,
        bank_account_id: accountId,
        booked_on: "2026-01-02",
        amount_cents: 100,
        currency: "EUR",
        payee: "incoming",
        fingerprint,
        raw: {},
        created_at: newer,
        updated_at: newer,
      },
    },
  ]);
  assert.equal(result.failed.length, 0);
  assert.equal(result.applied, 1);
  const rows = await db
    .select()
    .from(financialTransactions)
    .where(eq(financialTransactions.workspaceId, workspaceId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, incomingId);
  assert.equal(rows[0]?.payee, "incoming");
});

async function expectUniqueDeadLetter(args: {
  table: KnownTable;
  incoming: ReplicationRow;
  incomingId: string;
}) {
  const result = await applyRemoteChanges(args.table, [
    { table: args.table, row: args.incoming },
  ]);
  assert.equal(result.applied, 0, `${args.table} must not apply`);
  assert.equal(result.failed.length, 1, `${args.table} must fail`);
  assert.equal(result.failed[0]?.id, args.incomingId);
  assert.equal(result.failed[0]?.code, "23505");
}

test("OS-89 dead-letter: users.clerk_id (ids are referenced)", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const incomingId = id("user");
  const clerkId = `clerk_${randomUUID()}`;
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([incomingId, userId]);
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(inArray(users.id, [userId, incomingId]));
  });

  await db
    .update(users)
    .set({ clerkId })
    .where(eq(users.id, userId));
  await expectUniqueDeadLetter({
    table: "users",
    incomingId,
    incoming: {
      id: incomingId,
      clerk_id: clerkId,
      email: "fork@example.test",
      role: "owner",
      created_at: now,
    },
  });
});

test("OS-89 dead-letter: workspaces.slug", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const incomingId = id("workspace");
  const now = new Date().toISOString();
  const [local] = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));

  context.after(async () => {
    await dropLetters([incomingId]);
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceId, incomingId]));
    await db.delete(users).where(eq(users.id, userId));
  });

  await expectUniqueDeadLetter({
    table: "workspaces",
    incomingId,
    incoming: {
      id: incomingId,
      name: "fork",
      slug: local!.slug,
      owner_user_id: userId,
      created_at: now,
      updated_at: now,
    },
  });
});

test("OS-89 dead-letter: projects.workspace+key", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("proj");
  const incomingId = id("proj");
  const key = `K${randomUUID().slice(0, 6).toUpperCase()}`;
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(projects).where(eq(projects.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(projects).values({
    id: localId,
    workspaceId,
    key,
    name: "local",
  });
  await expectUniqueDeadLetter({
    table: "projects",
    incomingId,
    incoming: {
      id: incomingId,
      workspace_id: workspaceId,
      key,
      name: "incoming",
      type: "general",
      status: "backlog",
      priority: 0,
      sort_order: 0,
      budgets: [],
      created_at: now,
      updated_at: now,
    },
  });
});

test("OS-89 dead-letter: contacts portal username (not email)", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("ct");
  const incomingId = id("ct");
  const username = `portal_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(contacts).values({
    id: localId,
    workspaceId,
    key: `C-${randomUUID().slice(0, 6)}`,
    name: "Local",
    firstName: "Local",
    lastName: "Person",
    portalUsername: username,
  });
  await expectUniqueDeadLetter({
    table: "contacts",
    incomingId,
    incoming: {
      id: incomingId,
      workspace_id: workspaceId,
      key: `C-${randomUUID().slice(0, 6)}`,
      name: "Incoming",
      first_name: "Incoming",
      last_name: "Person",
      emails: [],
      phones: [],
      languages: [],
      social_accounts: [],
      portal_settings: {},
      portal_username: username,
      created_at: now,
      updated_at: now,
    },
  });
});

test("OS-89 contacts.email is not unique — duplicate emails do not 23505", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("ct");
  const incomingId = id("ct");
  const email = `dup-${randomUUID().slice(0, 8)}@example.test`;
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(contacts).values({
    id: localId,
    workspaceId,
    key: `C-${randomUUID().slice(0, 6)}`,
    name: "Local",
    firstName: "Local",
    lastName: "Person",
    email,
  });
  const result = await applyRemoteChanges("contacts", [
    {
      table: "contacts",
      row: {
        id: incomingId,
        workspace_id: workspaceId,
        key: `C-${randomUUID().slice(0, 6)}`,
        name: "Incoming",
        first_name: "Incoming",
        last_name: "Person",
        email,
        emails: [],
        phones: [],
        languages: [],
        social_accounts: [],
        portal_settings: {},
        created_at: now,
        updated_at: now,
      },
    },
  ]);
  assert.equal(result.failed.length, 0);
  assert.equal(result.applied, 1);
  const rows = await db.select().from(contacts).where(eq(contacts.workspaceId, workspaceId));
  assert.equal(rows.length, 2);
});

test("OS-89 dead-letter: organizations Moneybird contact id", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("org");
  const incomingId = id("org");
  const moneybirdId = `mb-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(organizations).where(eq(organizations.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(organizations).values({
    id: localId,
    workspaceId,
    key: `O-${randomUUID().slice(0, 6)}`,
    name: "Local",
    moneybirdContactId: moneybirdId,
  });
  await expectUniqueDeadLetter({
    table: "organizations",
    incomingId,
    incoming: {
      id: incomingId,
      workspace_id: workspaceId,
      key: `O-${randomUUID().slice(0, 6)}`,
      name: "Incoming",
      emails: [],
      phones: [],
      social_accounts: [],
      moneybird_contact_id: moneybirdId,
      created_at: now,
      updated_at: now,
    },
  });
});

test("OS-89 dead-letter: bank_accounts workspace key", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("ba");
  const incomingId = id("ba");
  const key = `acct-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(bankAccounts).where(eq(bankAccounts.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(bankAccounts).values({
    id: localId,
    workspaceId,
    key,
    name: "Local",
  });
  await expectUniqueDeadLetter({
    table: "bank_accounts",
    incomingId,
    incoming: {
      id: incomingId,
      workspace_id: workspaceId,
      key,
      name: "Incoming",
      currency: "EUR",
      type: "bank_account",
      sort_order: 0,
      created_at: now,
      updated_at: now,
    },
  });
});

test("OS-89 dead-letter: bank_accounts Moneybird financial account", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("ba");
  const incomingId = id("ba");
  const mb = `mbacc-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(bankAccounts).where(eq(bankAccounts.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(bankAccounts).values({
    id: localId,
    workspaceId,
    key: `acct-${randomUUID().slice(0, 8)}`,
    name: "Local",
    moneybirdFinancialAccountId: mb,
  });
  await expectUniqueDeadLetter({
    table: "bank_accounts",
    incomingId,
    incoming: {
      id: incomingId,
      workspace_id: workspaceId,
      key: `acct-${randomUUID().slice(0, 8)}`,
      name: "Incoming",
      currency: "EUR",
      type: "bank_account",
      sort_order: 0,
      moneybird_financial_account_id: mb,
      created_at: now,
      updated_at: now,
    },
  });
});

test("OS-89 dead-letter: financial_transactions external_id when fingerprint differs", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const accountId = id("ba");
  const localId = id("txn");
  const incomingId = id("txn");
  const externalId = `ext-${randomUUID()}`;
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db
      .delete(financialTransactions)
      .where(eq(financialTransactions.workspaceId, workspaceId));
    await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(bankAccounts).values({
    id: accountId,
    workspaceId,
    key: `ba-${randomUUID().slice(0, 8)}`,
    name: "Ledger",
  });
  await db.insert(financialTransactions).values({
    id: localId,
    workspaceId,
    bankAccountId: accountId,
    bookedOn: "2026-01-02",
    amountCents: 50,
    fingerprint: `fp-local-${randomUUID()}`,
    externalId,
    payee: "local",
  });
  await expectUniqueDeadLetter({
    table: "financial_transactions",
    incomingId,
    incoming: {
      id: incomingId,
      workspace_id: workspaceId,
      bank_account_id: accountId,
      booked_on: "2026-01-02",
      amount_cents: 50,
      currency: "EUR",
      payee: "incoming",
      fingerprint: `fp-incoming-${randomUUID()}`,
      external_id: externalId,
      raw: {},
      created_at: now,
      updated_at: now,
    },
  });
});

test("OS-89 dead-letter: email_threads inbox+thread_key", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("em");
  const incomingId = id("em");
  const threadKey = `th-${randomUUID()}`;
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(emailThreads).where(eq(emailThreads.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(emailThreads).values({
    id: localId,
    workspaceId,
    inboxId: "inbox-1",
    threadKey,
    number: 1,
  });
  await expectUniqueDeadLetter({
    table: "email_threads",
    incomingId,
    incoming: {
      id: incomingId,
      workspace_id: workspaceId,
      inbox_id: "inbox-1",
      thread_key: threadKey,
      number: 2,
      status: "backlog",
      priority: 0,
      created_at: now,
      updated_at: now,
    },
  });
});

test("OS-89 dead-letter: email_threads workspace number", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("em");
  const incomingId = id("em");
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(emailThreads).where(eq(emailThreads.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(emailThreads).values({
    id: localId,
    workspaceId,
    inboxId: "inbox-a",
    threadKey: `th-a-${randomUUID()}`,
    number: 41,
  });
  await expectUniqueDeadLetter({
    table: "email_threads",
    incomingId,
    incoming: {
      id: incomingId,
      workspace_id: workspaceId,
      inbox_id: "inbox-b",
      thread_key: `th-b-${randomUUID()}`,
      number: 41,
      status: "backlog",
      priority: 0,
      created_at: now,
      updated_at: now,
    },
  });
});

test("OS-89 dead-letter: documents workspace doc_key", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("doc");
  const incomingId = id("doc");
  const docKey = `DOC-${randomUUID().slice(0, 6)}`;
  const older = "2026-01-01T00:00:00.000Z";
  const newer = "2026-02-01T00:00:00.000Z";

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db.delete(documents).where(eq(documents.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(documents).values({
    id: localId,
    workspaceId,
    type: "file",
    kind: "document",
    path: `/docs/${localId}`,
    title: "Local",
    storageKey: `vault/${localId}`,
    docKey,
    updatedAt: new Date(older),
  });
  await expectUniqueDeadLetter({
    table: "documents",
    incomingId,
    incoming: {
      id: incomingId,
      workspace_id: workspaceId,
      type: "file",
      kind: "document",
      path: `/docs/${incomingId}`,
      title: "Incoming",
      storage_key: `vault/${incomingId}`,
      content_type: "text/markdown",
      byte_size: 10,
      content_version: 2,
      publish_status: "concept",
      audience: "group",
      doc_key: docKey,
      properties: {},
      front_matter_valid: true,
      created_at: newer,
      updated_at: newer,
    },
  });
});

test("OS-89 dead-letter: document_property_types live workspace+key", async (context) => {
  const { userId, workspaceId } = await seedWorkspace();
  const localId = id("dpt");
  const incomingId = id("dpt");
  const key = `prop_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  context.after(async () => {
    await dropLetters([localId, incomingId]);
    await db
      .delete(documentPropertyTypes)
      .where(eq(documentPropertyTypes.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(documentPropertyTypes).values({
    id: localId,
    workspaceId,
    key,
    label: "Local",
    kind: "text",
    status: "active",
  });
  await expectUniqueDeadLetter({
    table: "document_property_types",
    incomingId,
    incoming: {
      id: incomingId,
      workspace_id: workspaceId,
      key,
      label: "Incoming",
      kind: "text",
      options: [],
      multiple: false,
      status: "active",
      seeded: false,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    },
  });
});
