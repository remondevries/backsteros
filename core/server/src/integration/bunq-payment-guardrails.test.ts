/**
 * Round 4 — M1–M4 + L2 payment guard rails. Mocked bunq HTTP only; never calls
 * a real payment endpoint. Requires DATABASE_URL → backsteros_test.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test, type TestContext } from "node:test";

import { eq } from "drizzle-orm";

import { AGENT_KEY_SCOPES } from "@backsteros/contracts";

import { db, sqlClient } from "../db/index.js";
import {
  agents,
  apiKeys,
  bunqPaymentProposalEvents,
  bunqPaymentProposals,
  contacts,
  users,
  workspaceIntegrationSecrets,
  workspaces,
} from "../db/schema.js";
import {
  BunqClient,
  generateBunqSigningKeyPair,
} from "../lib/bunq-client.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import { computeBunqPaymentApproverCode } from "../lib/bunq-payment-approver-stepup.js";
import { hashBunqPaymentProposal } from "../lib/bunq-payment-proposal.js";
import type { AuthContext } from "../middleware/auth.js";
import {
  acknowledgeBunqPaymentUnknownOutcome,
  approveBunqPaymentProposal,
  autoReconcileBunqPaymentProposal,
  createBunqPaymentProposal,
  rejectBunqPaymentProposal,
  sweepStuckApprovedBunqPayments,
} from "../services/bunq-payment-proposals.js";
import { listBunqPaymentProposalEvents } from "../services/bunq-payment-proposal-events.js";
import {
  isBunqPaymentsPaused,
  toggleBunqPaymentsPaused,
} from "../services/bunq-settings.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.BUNQ_PAYMENT_PROPOSALS_ENABLED = "true";
delete process.env.BUNQ_ALLOW_LIVE_PAYMENT_WRITES;

const APPROVER_SECRET = "guardrails-approver-totp-secret";
const OWNER_KEY_REF = "guardrails-owner-key-ref";
process.env.BUNQ_PAYMENT_APPROVER_TOTP_SECRET = APPROVER_SECRET;
process.env.BUNQ_PAYMENT_APPROVER_API_KEY_IDS = OWNER_KEY_REF;
const code = (hash: string) => computeBunqPaymentApproverCode(APPROVER_SECRET, hash);

const id = (prefix: string) => `${prefix}-${randomUUID()}`;

after(async () => {
  await sqlClient.end();
});

/** Scoped env overrides, restored when the test ends. */
function withEnv(context: TestContext, overrides: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  context.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function mockClient(counter: { n: number }, mode: "success" | "ambiguous" = "success") {
  const { privateKeyPem } = generateBunqSigningKeyPair();
  return new BunqClient({
    environment: "sandbox",
    apiKey: "sandbox_integration_fake",
    signingPrivateKeyPem: privateKeyPem,
    permittedIps: ["127.0.0.1"],
    sessionToken: "sess",
    userId: "2",
    allowPaymentWrites: true,
    fetchImpl: async () => {
      counter.n += 1;
      if (mode === "ambiguous") return new Response("upstream timeout", { status: 503 });
      return new Response(JSON.stringify({ Response: [{ Id: { id: 7000 + counter.n } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
}

async function fixture(context: TestContext) {
  const userId = id("user");
  const workspaceId = id("workspace");
  const contactId = id("contact");
  const agentId = id("ralph-agent");
  const agentKeyId = id("agent-key");
  process.env.BUNQ_PAYMENT_PROPOSAL_AGENT_ID = agentId;

  context.after(async () => {
    await db.delete(bunqPaymentProposals).where(eq(bunqPaymentProposals.workspaceId, workspaceId));
    await db
      .delete(workspaceIntegrationSecrets)
      .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId));
    await db.delete(agents).where(eq(agents.workspaceId, workspaceId));
    await db.delete(apiKeys).where(eq(apiKeys.workspaceId, workspaceId));
    await db.delete(contacts).where(eq(contacts.workspaceId, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  await db.insert(users).values({
    id: userId,
    clerkId: id("clerk"),
    email: `remon-${randomUUID()}@example.test`,
    displayName: "Remon",
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "bunq guardrails",
    slug: id("bunq-guard"),
    ownerUserId: userId,
  });
  await db.insert(contacts).values({
    id: contactId,
    workspaceId,
    key: id("c"),
    name: "Ralph",
    firstName: "Ralph",
    lastName: "",
  });
  const agentSecret = `sk_agent_${randomUUID().replaceAll("-", "")}`;
  await db.insert(apiKeys).values({
    id: agentKeyId,
    workspaceId,
    userId: null,
    contactId,
    name: "Ralph",
    prefix: apiKeyLookupPrefix(agentSecret),
    keyHash: hashApiKey(agentSecret),
    scopes: [...AGENT_KEY_SCOPES],
  });
  await db.insert(agents).values({
    id: agentId,
    workspaceId,
    contactId,
    apiKeyId: agentKeyId,
    name: "Ralph",
    enabled: true,
  });

  const ralph: AuthContext = {
    kind: "api_key",
    userId: null,
    clerkUserId: null,
    apiKeyId: agentKeyId,
    contactId,
    workspaceId,
    membershipRole: null,
    scopes: [...AGENT_KEY_SCOPES],
  };
  const owner = (apiKeyId = OWNER_KEY_REF): AuthContext => ({
    kind: "api_key",
    userId,
    clerkUserId: null,
    apiKeyId,
    contactId: null,
    workspaceId,
    membershipRole: "owner",
    scopes: ["finance:write", "finance:read", "settings:write"],
  });

  let seq = 0;
  async function create(fields: { amountValue?: string; iban?: string } = {}) {
    seq += 1;
    const created = await createBunqPaymentProposal(workspaceId, ralph, {
      recipientName: "Ada Lovelace",
      recipientIban: fields.iban ?? "NL91ABNA0417164300",
      amountValue: fields.amountValue ?? "10.00",
      amountCurrency: "EUR",
      memo: `guardrail ${seq}`,
      sourceMonetaryAccountId: "1001",
      idempotencyKey: `create-${randomUUID()}`,
    });
    return created;
  }
  const approve = (
    proposalId: string,
    proposalHash: string,
    deps: Parameters<typeof approveBunqPaymentProposal>[4],
    extra: { confirmNewPayee?: boolean; acknowledgeUnknownOutcome?: boolean } = {},
  ) =>
    approveBunqPaymentProposal(
      workspaceId,
      proposalId,
      owner(),
      { proposalHash, approverCode: code(proposalHash), ...extra },
      deps,
    );

  return { userId, workspaceId, ralph, owner, create, approve };
}

const IBAN_A = "NL91ABNA0417164300";

test("M4: kill switch blocks create / approve; resume needs an approver credential", async (context) => {
  withEnv(context, { BUNQ_PAYMENT_NEW_PAYEE_POLICY: "off" });
  const f = await fixture(context);
  const counter = { n: 0 };
  const deps = { getPaymentClient: async () => mockClient(counter) };

  const pending = await f.create();
  assert.equal(await isBunqPaymentsPaused(f.workspaceId), false);

  // Any non-agent owner credential may pause.
  await toggleBunqPaymentsPaused(f.owner("some-other-key"), true);
  assert.equal(await isBunqPaymentsPaused(f.workspaceId), true);

  await assert.rejects(f.create(), /paused/);
  await assert.rejects(
    f.approve(pending.proposal.id, pending.proposal.proposalHash, deps),
    /paused/,
  );
  assert.equal(counter.n, 0);

  // Agents can never toggle; a non-approver key cannot resume.
  await assert.rejects(toggleBunqPaymentsPaused(f.ralph, false), /Agents cannot/);
  await assert.rejects(
    toggleBunqPaymentsPaused(f.owner("some-other-key"), false),
    /Resuming bunq payments requires/,
  );
  assert.equal(await isBunqPaymentsPaused(f.workspaceId), true);

  await toggleBunqPaymentsPaused(f.owner(), false);
  assert.equal(await isBunqPaymentsPaused(f.workspaceId), false);
  const done = await f.approve(pending.proposal.id, pending.proposal.proposalHash, deps);
  assert.equal(done.status, "executed");
  assert.equal(counter.n, 1);
});

test("L2: tampered stored fields fail the pre-bank hash recheck (no bank call)", async (context) => {
  withEnv(context, { BUNQ_PAYMENT_NEW_PAYEE_POLICY: "off" });
  const f = await fixture(context);
  const counter = { n: 0 };
  const deps = { getPaymentClient: async () => mockClient(counter) };

  const created = await f.create({ amountValue: "10.00" });
  // Someone with DB access swaps the payee after the hash was computed.
  await db
    .update(bunqPaymentProposals)
    .set({ recipientIban: "NL02ABNA0123456789" })
    .where(eq(bunqPaymentProposals.id, created.proposal.id));

  const result = await f.approve(created.proposal.id, created.proposal.proposalHash, deps);
  assert.equal(result.status, "failed");
  assert.match(result.executionError ?? "", /integrity check failed/);
  assert.equal(counter.n, 0);
});

test("M3: daily cap counts executed payments in the rolling window", async (context) => {
  withEnv(context, {
    BUNQ_PAYMENT_NEW_PAYEE_POLICY: "off",
    BUNQ_PAYMENT_DAILY_CAP_EUR: "50",
  });
  const f = await fixture(context);
  const counter = { n: 0 };
  const deps = { getPaymentClient: async () => mockClient(counter) };

  await assert.rejects(f.create({ amountValue: "50.01" }), /cap/i);

  const a = await f.create({ amountValue: "30.00" });
  assert.equal((await f.approve(a.proposal.id, a.proposal.proposalHash, deps)).status, "executed");

  const b = await f.create({ amountValue: "25.00" });
  await assert.rejects(f.approve(b.proposal.id, b.proposal.proposalHash, deps), /cap/i);
  assert.equal(counter.n, 1);

  const c = await f.create({ amountValue: "20.00" });
  assert.equal((await f.approve(c.proposal.id, c.proposal.proposalHash, deps)).status, "executed");
  assert.equal(counter.n, 2);
});

test("M3: open proposal limit per agent", async (context) => {
  withEnv(context, {
    BUNQ_PAYMENT_NEW_PAYEE_POLICY: "off",
    BUNQ_PAYMENT_MAX_OPEN_PROPOSALS: "2",
  });
  const f = await fixture(context);
  await f.create();
  const second = await f.create();
  await assert.rejects(f.create(), /open/i);

  // Rejecting one frees a slot.
  await rejectBunqPaymentProposal(f.workspaceId, second.proposal.id, f.owner(), {
    proposalHash: second.proposal.proposalHash,
    approverCode: code(second.proposal.proposalHash),
  });
  await f.create();
});

test("M3: new payee needs explicit confirmation once, then is known", async (context) => {
  withEnv(context, { BUNQ_PAYMENT_NEW_PAYEE_POLICY: "confirm", BUNQ_PAYMENT_ALLOWED_IBANS: "" });
  const f = await fixture(context);
  const counter = { n: 0 };
  const deps = { getPaymentClient: async () => mockClient(counter) };

  const first = await f.create({ iban: IBAN_A });
  assert.equal(first.approval.paymentProposal.newPayee, true);
  await assert.rejects(
    f.approve(first.proposal.id, first.proposal.proposalHash, deps),
    /new payee/i,
  );
  assert.equal(counter.n, 0);
  const paid = await f.approve(first.proposal.id, first.proposal.proposalHash, deps, {
    confirmNewPayee: true,
  });
  assert.equal(paid.status, "executed");

  const second = await f.create({ iban: IBAN_A });
  assert.equal(second.approval.paymentProposal.newPayee, undefined);
  assert.equal(
    (await f.approve(second.proposal.id, second.proposal.proposalHash, deps)).status,
    "executed",
  );
  assert.equal(counter.n, 2);
});

test("M3: refuse policy blocks first-seen payees even when confirmed; allowlist passes", async (context) => {
  withEnv(context, { BUNQ_PAYMENT_NEW_PAYEE_POLICY: "refuse", BUNQ_PAYMENT_ALLOWED_IBANS: "" });
  const f = await fixture(context);
  const counter = { n: 0 };
  const deps = { getPaymentClient: async () => mockClient(counter) };

  const blocked = await f.create({ iban: IBAN_A });
  await assert.rejects(
    f.approve(blocked.proposal.id, blocked.proposal.proposalHash, deps, {
      confirmNewPayee: true,
    }),
    /never been paid/,
  );
  assert.equal(counter.n, 0);

  process.env.BUNQ_PAYMENT_ALLOWED_IBANS = IBAN_A;
  const ok = await f.create({ iban: IBAN_A });
  assert.equal(
    (await f.approve(ok.proposal.id, ok.proposal.proposalHash, deps)).status,
    "executed",
  );
});

test("M1: retry refused after 23h; auto-reconcile marks executed only on a matching payment", async (context) => {
  withEnv(context, { BUNQ_PAYMENT_NEW_PAYEE_POLICY: "off" });
  const f = await fixture(context);
  const counter = { n: 0 };
  const ambiguous = { getPaymentClient: async () => mockClient(counter, "ambiguous") };

  const created = await f.create({ amountValue: "12.34" });
  const hash = created.proposal.proposalHash;
  const stuck = await f.approve(created.proposal.id, hash, ambiguous);
  assert.equal(stuck.status, "needs_reconciliation");
  assert.equal(counter.n, 1);

  // Auto-reconcile miss leaves the proposal alone.
  const miss = await autoReconcileBunqPaymentProposal(f.workspaceId, created.proposal.id, {
    listRecentPayments: async () => [],
  });
  assert.equal(miss.outcome, "not_found");

  await acknowledgeBunqPaymentUnknownOutcome(f.workspaceId, created.proposal.id, f.owner(), {
    proposalHash: hash,
    approverCode: code(hash),
  });

  // 24h later the idempotency key may be forgotten → refuse the retry.
  await db
    .update(bunqPaymentProposals)
    .set({ paymentAttemptedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
    .where(eq(bunqPaymentProposals.id, created.proposal.id));
  await assert.rejects(
    f.approve(created.proposal.id, hash, { getPaymentClient: async () => mockClient(counter) }, {
      acknowledgeUnknownOutcome: true,
    }),
    /idempotency window/,
  );
  assert.equal(counter.n, 1);

  const [row] = await db
    .select()
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.id, created.proposal.id));
  const hit = await autoReconcileBunqPaymentProposal(f.workspaceId, created.proposal.id, {
    listRecentPayments: async () => [
      {
        id: "999",
        created: new Date().toISOString(),
        amountValue: "-12.34",
        amountCurrency: "EUR",
        description: row!.memo,
        counterpartyIban: row!.recipientIban,
      },
    ],
  });
  assert.equal(hit.outcome, "matched");
  const after = await db
    .select()
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.id, created.proposal.id));
  assert.equal(after[0]?.status, "executed");
  assert.equal(after[0]?.bunqPaymentId, "999");
  assert.equal(counter.n, 1);
});

test("L2: sweeper moves stuck approved rows to needs_reconciliation", async (context) => {
  withEnv(context, { BUNQ_PAYMENT_NEW_PAYEE_POLICY: "off" });
  const f = await fixture(context);
  const stale = await f.create();
  const fresh = await f.create();
  const withId = await f.create();
  const longAgo = new Date(Date.now() - 10 * 60 * 1000);
  const justNow = new Date(Date.now() - 20 * 1000);
  for (const [created, attempt, bunqPaymentId] of [
    [stale, longAgo, null],
    [fresh, justNow, null],
    [withId, longAgo, "555"],
  ] as const) {
    await db
      .update(bunqPaymentProposals)
      .set({
        status: "approved",
        approvedAt: attempt,
        paymentAttemptedAt: attempt,
        bunqPaymentId,
      })
      .where(eq(bunqPaymentProposals.id, created.proposal.id));
  }

  const { swept } = await sweepStuckApprovedBunqPayments({ workspaceId: f.workspaceId });
  assert.deepEqual(swept, [stale.proposal.id]);

  const statusOf = async (proposalId: string) =>
    (await db.select().from(bunqPaymentProposals).where(eq(bunqPaymentProposals.id, proposalId)))[0]
      ?.status;
  assert.equal(await statusOf(stale.proposal.id), "needs_reconciliation");
  assert.equal(await statusOf(fresh.proposal.id), "approved");
  assert.equal(await statusOf(withId.proposal.id), "approved");

  const events = await listBunqPaymentProposalEvents(f.workspaceId, stale.proposal.id);
  assert.deepEqual(
    events.map((e) => [e.eventType, e.statusFrom, e.statusTo]),
    [
      ["created", null, "pending"],
      ["swept", "approved", "needs_reconciliation"],
    ],
  );
});

test("M2: append-only events record actor, hash, amount and transitions", async (context) => {
  withEnv(context, { BUNQ_PAYMENT_NEW_PAYEE_POLICY: "off" });
  const f = await fixture(context);
  const counter = { n: 0 };
  const deps = { getPaymentClient: async () => mockClient(counter) };

  const paid = await f.create({ amountValue: "7.50" });
  await f.approve(paid.proposal.id, paid.proposal.proposalHash, deps);
  const rejected = await f.create({ amountValue: "3.00" });
  await rejectBunqPaymentProposal(f.workspaceId, rejected.proposal.id, f.owner(), {
    proposalHash: rejected.proposal.proposalHash,
    approverCode: code(rejected.proposal.proposalHash),
    note: "nope",
  });

  const paidEvents = await listBunqPaymentProposalEvents(f.workspaceId, paid.proposal.id);
  assert.deepEqual(
    paidEvents.map((e) => [e.eventType, e.actorKind, e.statusFrom, e.statusTo]),
    [
      ["created", "agent", null, "pending"],
      ["approved", "owner_api_key", "pending", "approved"],
      ["executed", "system", "approved", "executed"],
    ],
  );
  for (const event of paidEvents) {
    assert.equal(event.proposalHash, paid.proposal.proposalHash);
    assert.equal(event.amountValue, "7.50");
    assert.equal(event.amountCurrency, "EUR");
  }
  assert.equal(paidEvents[1]?.actorApiKeyId, OWNER_KEY_REF);
  assert.equal(paidEvents[1]?.actorUserId, f.userId);

  const rejectedEvents = await listBunqPaymentProposalEvents(f.workspaceId, rejected.proposal.id);
  assert.deepEqual(
    rejectedEvents.map((e) => [e.eventType, e.statusTo]),
    [
      ["created", "pending"],
      ["rejected", "rejected"],
    ],
  );
  const [rejectedRow] = await db
    .select()
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.id, rejected.proposal.id));
  assert.equal(rejectedRow?.rejectedByUserId, f.userId);
  assert.equal(rejectedRow?.rejectedByApiKeyId, OWNER_KEY_REF);
  assert.equal(rejectedRow?.approvedByUserId, null);
  const [paidRow] = await db
    .select()
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.id, paid.proposal.id));
  assert.equal(paidRow?.approvedByApiKeyId, OWNER_KEY_REF);

  // Append-only: neither UPDATE nor a direct DELETE is possible.
  await assert.rejects(
    db
      .update(bunqPaymentProposalEvents)
      .set({ statusTo: "executed" })
      .where(eq(bunqPaymentProposalEvents.id, paidEvents[0]!.id)),
  );
  await assert.rejects(
    db.delete(bunqPaymentProposalEvents).where(eq(bunqPaymentProposalEvents.id, paidEvents[0]!.id)),
  );
});
