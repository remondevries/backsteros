/**
 * OS-167 integration — mocked bunq HTTP only (never live payment endpoints).
 * Requires DATABASE_URL → backsteros_test (via test:integration).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { AGENT_KEY_SCOPES } from "@backsteros/contracts";

import { db, sqlClient } from "../db/index.js";
import {
  agents,
  apiKeys,
  bunqPaymentProposals,
  chatThreadMessages,
  chatThreads,
  contacts,
  users,
  workspaces,
} from "../db/schema.js";
import {
  BunqClient,
  BunqPaymentAmbiguousOutcomeError,
  generateBunqSigningKeyPair,
} from "../lib/bunq-client.js";
import { apiKeyLookupPrefix, hashApiKey } from "../lib/crypto.js";
import { computeBunqPaymentApproverCode } from "../lib/bunq-payment-approver-stepup.js";
import { hashBunqPaymentProposal } from "../lib/bunq-payment-proposal.js";
import type { AuthContext } from "../middleware/auth.js";
import {
  answerChatThreadMessageApproval,
  postChatThreadMessage,
} from "../services/agent-chat.js";
import {
  acknowledgeBunqPaymentUnknownOutcome,
  approveBunqPaymentProposal,
  createBunqPaymentProposal,
  handleChatPaymentProposalAnswer,
} from "../services/bunq-payment-proposals.js";

process.env.BACKSTEROS_INTEGRATION_TEST = "1";
process.env.BUNQ_PAYMENT_PROPOSALS_ENABLED = "true";
// Never allow live production payment writes in this suite.
delete process.env.BUNQ_ALLOW_LIVE_PAYMENT_WRITES;

// Hash-bound Remon step-up (test-only secret; never a real credential).
const APPROVER_SECRET = "integration-approver-totp-secret";
const OWNER_KEY_REF = "integration-owner-key-ref";
process.env.BUNQ_PAYMENT_APPROVER_TOTP_SECRET = APPROVER_SECRET;
process.env.BUNQ_PAYMENT_APPROVER_API_KEY_IDS = OWNER_KEY_REF;
const approverCode = (proposalHash: string) =>
  computeBunqPaymentApproverCode(APPROVER_SECRET, proposalHash);

const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const agentSecret = () => `sk_agent_${randomUUID().replaceAll("-", "")}`;
const ownerSecret = () => `sk_live_${randomUUID().replaceAll("-", "")}`;

after(async () => {
  await sqlClient.end();
});

function ownerAuth(userId: string, workspaceId: string): AuthContext {
  return {
    kind: "api_key",
    userId,
    clerkUserId: null,
    apiKeyId: OWNER_KEY_REF,
    contactId: null,
    workspaceId,
    membershipRole: "owner",
    scopes: ["finance:write", "finance:read"],
  };
}

function agentAuth(
  workspaceId: string,
  apiKeyId: string,
  contactId: string,
): AuthContext {
  return {
    kind: "api_key",
    userId: null,
    clerkUserId: null,
    apiKeyId,
    contactId,
    workspaceId,
    membershipRole: null,
    scopes: [...AGENT_KEY_SCOPES],
  };
}

function mockPaymentClient(opts: {
  mode: "success" | "ambiguous" | "count";
  counter?: { n: number };
}): BunqClient {
  const { privateKeyPem } = generateBunqSigningKeyPair();
  return new BunqClient({
    environment: "sandbox",
    apiKey: "sandbox_integration_fake",
    signingPrivateKeyPem: privateKeyPem,
    permittedIps: ["127.0.0.1"],
    sessionToken: "sess",
    userId: "2",
    allowPaymentWrites: true,
    fetchImpl: async (_input, init) => {
      if (opts.counter) opts.counter.n += 1;
      const headers = new Headers(init?.headers);
      assert.ok(headers.get("X-Bunq-Client-Idempotency-Key"));
      assert.ok(headers.get("X-Bunq-Client-Request-Id"));
      assert.notEqual(
        headers.get("X-Bunq-Client-Idempotency-Key"),
        headers.get("X-Bunq-Client-Request-Id"),
      );
      if (opts.mode === "ambiguous") {
        return new Response("upstream timeout", { status: 503 });
      }
      return new Response(
        JSON.stringify({ Response: [{ Id: { id: 4242 } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
}

test("OS-167: concurrent Approve & Pay → exactly one bunq payment execution", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const contactId = id("contact");
  const agentId = id("ralph-agent");
  process.env.BUNQ_PAYMENT_PROPOSAL_AGENT_ID = agentId;
  const agentKeyId = id("agent-key");
  const agentKeySecret = agentSecret();
  const ownerKeySecret = ownerSecret();
  const ownerKeyId = id("owner-key");

  context.after(async () => {
    await db
      .delete(bunqPaymentProposals)
      .where(eq(bunqPaymentProposals.workspaceId, workspaceId));
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
    name: "bunq payments",
    slug: id("bunq-pay"),
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
  await db.insert(apiKeys).values([
    {
      id: ownerKeyId,
      workspaceId,
      userId,
      name: "owner",
      prefix: apiKeyLookupPrefix(ownerKeySecret),
      keyHash: hashApiKey(ownerKeySecret),
      scopes: ["finance:write", "finance:read"],
    },
    {
      id: agentKeyId,
      workspaceId,
      userId: null,
      contactId,
      name: "Ralph",
      prefix: apiKeyLookupPrefix(agentKeySecret),
      keyHash: hashApiKey(agentKeySecret),
      scopes: [...AGENT_KEY_SCOPES],
    },
  ]);
  await db.insert(agents).values({
    id: agentId,
    workspaceId,
    contactId,
    apiKeyId: agentKeyId,
    name: "RenamedLater",
    enabled: true,
  });

  const paymentFields = {
    recipientName: "Ada Lovelace",
    recipientIban: "NL91ABNA0417164300",
    amountValue: "12.34",
    amountCurrency: "EUR",
    memo: "Integration test",
    sourceMonetaryAccountId: "1001",
  };
  const { proposalHash } = hashBunqPaymentProposal(paymentFields);

  const created = await createBunqPaymentProposal(
    workspaceId,
    agentAuth(workspaceId, agentKeyId, contactId),
    {
      ...paymentFields,
      idempotencyKey: `create-${randomUUID()}`,
    },
  );
  assert.equal(created.proposal.status, "pending");
  assert.equal(created.proposal.proposalHash, proposalHash);
  assert.equal(created.approval.approveLabel, "Approve");
  assert.equal(
    created.approval.fields?.find((f) => f.label === "IBAN")?.value,
    "NL91ABNA0417164300",
  );

  const counter = { n: 0 };
  const deps = {
    getPaymentClient: async () => mockPaymentClient({ mode: "count", counter }),
  };

  const remon = ownerAuth(userId, workspaceId);
  const [a, b] = await Promise.allSettled([
    approveBunqPaymentProposal(
      workspaceId,
      created.proposal.id,
      remon,
      { proposalHash, approverCode: approverCode(proposalHash) },
      deps,
    ),
    approveBunqPaymentProposal(
      workspaceId,
      created.proposal.id,
      remon,
      { proposalHash, approverCode: approverCode(proposalHash) },
      deps,
    ),
  ]);

  // Exactly one bank POST. The loser is either rejected (approve race) or an
  // idempotent executed read after the winner finished — never a second send.
  assert.equal(counter.n, 1);
  const fulfilled = [a, b].filter(
    (r): r is PromiseFulfilledResult<{
      status: string;
      bunqPaymentId: string | null;
      proposalHash: string;
      recipientIban: string;
      amountValue: string;
    }> => r.status === "fulfilled",
  );
  assert.ok(fulfilled.length >= 1);
  for (const result of fulfilled) {
    assert.equal(result.value.status, "executed");
    assert.equal(result.value.bunqPaymentId, "4242");
    assert.equal(result.value.proposalHash, proposalHash);
    assert.equal(result.value.recipientIban, "NL91ABNA0417164300");
    assert.equal(result.value.amountValue, "12.34");
  }

  const [row] = await db
    .select()
    .from(bunqPaymentProposals)
    .where(
      and(
        eq(bunqPaymentProposals.workspaceId, workspaceId),
        eq(bunqPaymentProposals.id, created.proposal.id),
      ),
    )
    .limit(1);
  assert.equal(row?.status, "executed");
  assert.ok(row?.bunqIdempotencyKey);

  // Replay after executed is idempotent read — must not send a second payment.
  const replay = await approveBunqPaymentProposal(
    workspaceId,
    created.proposal.id,
    remon,
    { proposalHash, approverCode: approverCode(proposalHash) },
    deps,
  );
  assert.equal(replay.status, "executed");
  assert.equal(replay.bunqPaymentId, "4242");
  assert.equal(counter.n, 1);
});

test("OS-167: ambiguous bunq outcome → needs_reconciliation; no second send without reauth", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const contactId = id("contact");
  const agentId = id("ralph-agent");
  process.env.BUNQ_PAYMENT_PROPOSAL_AGENT_ID = agentId;
  const agentKeyId = id("agent-key");
  const agentKeySecret = agentSecret();

  context.after(async () => {
    await db
      .delete(bunqPaymentProposals)
      .where(eq(bunqPaymentProposals.workspaceId, workspaceId));
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
    name: "bunq ambiguous",
    slug: id("bunq-amb"),
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
  await db.insert(apiKeys).values({
    id: agentKeyId,
    workspaceId,
    userId: null,
    contactId,
    name: "Ralph",
    prefix: apiKeyLookupPrefix(agentKeySecret),
    keyHash: hashApiKey(agentKeySecret),
    scopes: [...AGENT_KEY_SCOPES],
  });
  await db.insert(agents).values({
    id: agentId,
    workspaceId,
    contactId,
    apiKeyId: agentKeyId,
    name: "WhateverName",
    enabled: true,
  });

  const paymentFields = {
    recipientName: "Ada",
    recipientIban: "NL91ABNA0417164300",
    amountValue: "3.00",
    amountCurrency: "EUR",
    memo: "Ambiguous path",
    sourceMonetaryAccountId: "55",
  };
  const { proposalHash } = hashBunqPaymentProposal(paymentFields);
  const created = await createBunqPaymentProposal(
    workspaceId,
    agentAuth(workspaceId, agentKeyId, contactId),
    { ...paymentFields, idempotencyKey: `amb-${randomUUID()}` },
  );

  const counter = { n: 0 };
  const ambiguousDeps = {
    getPaymentClient: async () => {
      counter.n += 1;
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
          throw new BunqPaymentAmbiguousOutcomeError("simulated timeout", null);
        },
      });
    },
  };

  const remon = ownerAuth(userId, workspaceId);
  const first = await approveBunqPaymentProposal(
    workspaceId,
    created.proposal.id,
    remon,
    { proposalHash, approverCode: approverCode(proposalHash) },
    ambiguousDeps,
  );
  assert.equal(first.status, "needs_reconciliation");
  assert.equal(counter.n, 1);
  assert.match(first.executionError ?? "", /Unknown payment outcome/i);

  // Without dedicated ack — blocked (flag alone is not enough).
  await assert.rejects(
    () =>
      approveBunqPaymentProposal(
        workspaceId,
        created.proposal.id,
        remon,
        { proposalHash, approverCode: approverCode(proposalHash), acknowledgeUnknownOutcome: true },
        ambiguousDeps,
      ),
    (error: unknown) =>
      error instanceof Error &&
      (error as { status?: number }).status === 409 &&
      /acknowledge-unknown-outcome|UNKNOWN|needs_reconciliation/i.test(
        error.message,
      ),
  );
  assert.equal(counter.n, 1);

  // Chat Approve alone must not invent the ack (OS-169).
  await assert.rejects(
    () =>
      handleChatPaymentProposalAnswer({
        workspaceId,
        auth: remon,
        proposalId: created.proposal.id,
        proposalHash,
        decision: "approved",
        approverCode: approverCode(proposalHash),
      }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { status?: number }).status === 409 &&
      /acknowledge-unknown-outcome|UNKNOWN|needs_reconciliation/i.test(
        error.message,
      ),
  );
  assert.equal(counter.n, 1);

  // Persona cannot ack.
  await assert.rejects(
    () =>
      acknowledgeBunqPaymentUnknownOutcome(
        workspaceId,
        created.proposal.id,
        agentAuth(workspaceId, agentKeyId, contactId),
        { proposalHash, approverCode: approverCode(proposalHash) },
      ),
    (error: unknown) =>
      error instanceof Error &&
      (error as { status?: number }).status === 403,
  );

  const acked = await acknowledgeBunqPaymentUnknownOutcome(
    workspaceId,
    created.proposal.id,
    remon,
    { proposalHash, approverCode: approverCode(proposalHash) },
  );
  assert.equal(acked.status, "needs_reconciliation");
  assert.ok(acked.unknownOutcomeAcknowledgedAt);

  // Flag still required on finance REST after dedicated ack.
  await assert.rejects(
    () =>
      approveBunqPaymentProposal(
        workspaceId,
        created.proposal.id,
        remon,
        { proposalHash, approverCode: approverCode(proposalHash) },
        ambiguousDeps,
      ),
    (error: unknown) =>
      error instanceof Error &&
      (error as { status?: number }).status === 409 &&
      /acknowledgeUnknownOutcome/i.test(error.message),
  );

  // Fresh Approve & Pay after dedicated ack + flag — same bunq idempotency key.
  const successDeps = {
    getPaymentClient: async () => mockPaymentClient({ mode: "success", counter }),
  };
  const [before] = await db
    .select({ key: bunqPaymentProposals.bunqIdempotencyKey })
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.id, created.proposal.id))
    .limit(1);

  const second = await approveBunqPaymentProposal(
    workspaceId,
    created.proposal.id,
    remon,
    { proposalHash, approverCode: approverCode(proposalHash), acknowledgeUnknownOutcome: true },
    successDeps,
  );
  assert.equal(second.status, "executed");
  assert.equal(second.bunqPaymentId, "4242");
  assert.equal(counter.n, 2);

  const [after] = await db
    .select({ key: bunqPaymentProposals.bunqIdempotencyKey })
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.id, created.proposal.id))
    .limit(1);
  assert.equal(after?.key, before?.key);

  // Replay after executed — one execution (idempotent).
  const replay = await approveBunqPaymentProposal(
    workspaceId,
    created.proposal.id,
    remon,
    { proposalHash, approverCode: approverCode(proposalHash), acknowledgeUnknownOutcome: true },
    successDeps,
  );
  assert.equal(replay.status, "executed");
  assert.equal(replay.bunqPaymentId, "4242");
  assert.equal(counter.n, 2);
});

test("OS-169: chat Approve after dedicated ack retries with same idempotency key", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const contactId = id("contact");
  const agentId = id("ralph-agent");
  process.env.BUNQ_PAYMENT_PROPOSAL_AGENT_ID = agentId;
  const agentKeyId = id("agent-key");
  const agentKeySecret = agentSecret();

  context.after(async () => {
    await db
      .delete(bunqPaymentProposals)
      .where(eq(bunqPaymentProposals.workspaceId, workspaceId));
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
    name: "bunq os169 chat",
    slug: id("bunq-169"),
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
  await db.insert(apiKeys).values({
    id: agentKeyId,
    workspaceId,
    userId: null,
    contactId,
    name: "Ralph",
    prefix: apiKeyLookupPrefix(agentKeySecret),
    keyHash: hashApiKey(agentKeySecret),
    scopes: [...AGENT_KEY_SCOPES],
  });
  await db.insert(agents).values({
    id: agentId,
    workspaceId,
    contactId,
    apiKeyId: agentKeyId,
    name: "WhateverName",
    enabled: true,
  });

  const paymentFields = {
    recipientName: "Ada",
    recipientIban: "NL91ABNA0417164300",
    amountValue: "4.00",
    amountCurrency: "EUR",
    memo: "OS-169 chat ack",
    sourceMonetaryAccountId: "55",
  };
  const { proposalHash } = hashBunqPaymentProposal(paymentFields);
  const created = await createBunqPaymentProposal(
    workspaceId,
    agentAuth(workspaceId, agentKeyId, contactId),
    { ...paymentFields, idempotencyKey: `os169-${randomUUID()}` },
  );

  const counter = { n: 0 };
  const remon = ownerAuth(userId, workspaceId);
  const ambiguousDeps = {
    getPaymentClient: async () => {
      counter.n += 1;
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
          throw new BunqPaymentAmbiguousOutcomeError("sim timeout", null);
        },
      });
    },
  };

  const first = await approveBunqPaymentProposal(
    workspaceId,
    created.proposal.id,
    remon,
    { proposalHash, approverCode: approverCode(proposalHash) },
    ambiguousDeps,
  );
  assert.equal(first.status, "needs_reconciliation");
  assert.equal(counter.n, 1);

  await acknowledgeBunqPaymentUnknownOutcome(
    workspaceId,
    created.proposal.id,
    remon,
    { proposalHash, approverCode: approverCode(proposalHash) },
  );

  const [before] = await db
    .select({
      key: bunqPaymentProposals.bunqIdempotencyKey,
      hash: bunqPaymentProposals.proposalHash,
    })
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.id, created.proposal.id))
    .limit(1);

  const successDeps = {
    getPaymentClient: async () => mockPaymentClient({ mode: "success", counter }),
  };
  const second = await handleChatPaymentProposalAnswer(
    {
      workspaceId,
      auth: remon,
      proposalId: created.proposal.id,
      proposalHash,
      decision: "approved",
      approverCode: approverCode(proposalHash),
    },
    successDeps,
  );
  assert.ok(second);
  assert.equal(second.status, "executed");
  assert.equal(second.bunqPaymentId, "4242");
  assert.equal(counter.n, 2);

  const [after] = await db
    .select({
      key: bunqPaymentProposals.bunqIdempotencyKey,
      hash: bunqPaymentProposals.proposalHash,
    })
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.id, created.proposal.id))
    .limit(1);
  assert.equal(after?.key, before?.key);
  assert.equal(after?.hash, proposalHash);
  assert.equal(after?.hash, before?.hash);
});

test("OS-167: expired pending proposal cannot Approve & Pay", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const contactId = id("contact");
  const agentId = id("ralph-agent");
  process.env.BUNQ_PAYMENT_PROPOSAL_AGENT_ID = agentId;
  const agentKeyId = id("agent-key");
  const agentKeySecret = agentSecret();

  context.after(async () => {
    await db
      .delete(bunqPaymentProposals)
      .where(eq(bunqPaymentProposals.workspaceId, workspaceId));
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
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "bunq expiry",
    slug: id("bunq-exp"),
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
  await db.insert(apiKeys).values({
    id: agentKeyId,
    workspaceId,
    contactId,
    name: "Ralph",
    prefix: apiKeyLookupPrefix(agentKeySecret),
    keyHash: hashApiKey(agentKeySecret),
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

  const paymentFields = {
    recipientName: "Ada",
    recipientIban: "NL91ABNA0417164300",
    amountValue: "1.00",
    amountCurrency: "EUR",
    memo: "Expired",
    sourceMonetaryAccountId: "1",
  };
  const { proposalHash } = hashBunqPaymentProposal(paymentFields);
  const created = await createBunqPaymentProposal(
    workspaceId,
    agentAuth(workspaceId, agentKeyId, contactId),
    { ...paymentFields, idempotencyKey: `exp-${randomUUID()}`, ttlSeconds: 60 },
  );

  await db
    .update(bunqPaymentProposals)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(bunqPaymentProposals.id, created.proposal.id));

  await assert.rejects(
    () =>
      approveBunqPaymentProposal(
        workspaceId,
        created.proposal.id,
        ownerAuth(userId, workspaceId),
        { proposalHash, approverCode: approverCode(proposalHash) },
        {
          getPaymentClient: async () => mockPaymentClient({ mode: "success" }),
        },
      ),
    (error: unknown) =>
      error instanceof Error && /expired/i.test(error.message),
  );
});

test("C1: agent card is rebuilt from DB; answer needs approverCode and the linked message", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const contactId = id("contact");
  const agentId = id("ralph-agent");
  const threadId = id("thread");
  process.env.BUNQ_PAYMENT_PROPOSAL_AGENT_ID = agentId;
  const agentKeyId = id("agent-key");
  const agentKeySecret = agentSecret();

  context.after(async () => {
    await db
      .delete(bunqPaymentProposals)
      .where(eq(bunqPaymentProposals.workspaceId, workspaceId));
    await db
      .delete(chatThreadMessages)
      .where(eq(chatThreadMessages.workspaceId, workspaceId));
    await db.delete(chatThreads).where(eq(chatThreads.workspaceId, workspaceId));
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
    name: "bunq chat card",
    slug: id("bunq-card"),
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
  await db.insert(apiKeys).values({
    id: agentKeyId,
    workspaceId,
    userId: null,
    contactId,
    name: "Ralph",
    prefix: apiKeyLookupPrefix(agentKeySecret),
    keyHash: hashApiKey(agentKeySecret),
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
  await db.insert(chatThreads).values({ id: threadId, workspaceId, agentId });

  const paymentFields = {
    recipientName: "Ada Lovelace",
    recipientIban: "NL91ABNA0417164300",
    amountValue: "9.99",
    amountCurrency: "EUR",
    memo: "Chat card",
    sourceMonetaryAccountId: "77",
  };
  const { proposalHash } = hashBunqPaymentProposal(paymentFields);
  const created = await createBunqPaymentProposal(
    workspaceId,
    agentAuth(workspaceId, agentKeyId, contactId),
    { ...paymentFields, idempotencyKey: `card-${randomUUID()}` },
  );

  const agentPost = {
    apiKeyId: agentKeyId,
    authorContactId: contactId,
    authorName: null,
  };

  // Agent lies about everything displayed — all of it must be discarded.
  const posted = await postChatThreadMessage(
    workspaceId,
    threadId,
    "Please approve",
    agentPost,
    {},
    {
      approval: {
        title: "Pay EUR 0.01 to Charity",
        kind: "payment",
        summary: "Pay 0.01 EUR to Charity",
        fields: [{ label: "IBAN", value: "NL00EVIL0000000000" }],
        destructive: false,
        paymentProposal: {
          proposalId: created.proposal.id,
          proposalHash,
        },
      },
    },
  );
  const message = posted.message;
  assert.equal(message.approval?.summary, "Pay 9.99 EUR to Ada Lovelace");
  assert.equal(
    message.approval?.fields?.find((f) => f.label === "IBAN")?.value,
    "NL91ABNA0417164300",
  );
  assert.equal(message.approval?.paymentProposal?.proposalHash, proposalHash);

  const [linked] = await db
    .select()
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.id, created.proposal.id))
    .limit(1);
  assert.equal(linked?.chatMessageId, message.id);
  assert.equal(linked?.chatThreadId, threadId);

  // A claimed hash that does not match the stored proposal is refused.
  await assert.rejects(
    () =>
      postChatThreadMessage(workspaceId, threadId, "again", agentPost, {}, {
        approval: {
          title: "x",
          kind: "payment",
          summary: "x",
          destructive: false,
          paymentProposal: {
            proposalId: created.proposal.id,
            proposalHash: "f".repeat(64),
          },
        },
      }),
    (error: unknown) => (error as { status?: number }).status === 400,
  );

  // A second card for the same proposal is refused (already linked).
  await assert.rejects(
    () =>
      postChatThreadMessage(workspaceId, threadId, "again", agentPost, {}, {
        approval: {
          title: "x",
          kind: "payment",
          summary: "x",
          destructive: false,
          paymentProposal: {
            proposalId: created.proposal.id,
            proposalHash,
          },
        },
      }),
    (error: unknown) => (error as { status?: number }).status === 409,
  );

  const remon = ownerAuth(userId, workspaceId);
  const remonPost = {
    apiKeyId: null,
    authorContactId: null,
    authorName: "Remon",
  };

  // No approverCode → refused before anything happens.
  await assert.rejects(
    () =>
      answerChatThreadMessageApproval(
        workspaceId,
        threadId,
        message.id,
        "rejected",
        undefined,
        remonPost,
        {},
        remon,
      ),
    (error: unknown) => (error as { status?: number }).status === 400,
  );

  // Wrong code → 403.
  await assert.rejects(
    () =>
      answerChatThreadMessageApproval(
        workspaceId,
        threadId,
        message.id,
        "rejected",
        undefined,
        remonPost,
        {},
        remon,
        approverCode(proposalHash) === "000000" ? "000001" : "000000",
      ),
    (error: unknown) => (error as { status?: number }).status === 403,
  );

  // Proposal linked to a different message → card is not the bound one.
  const other = await postChatThreadMessage(
    workspaceId,
    threadId,
    "unrelated agent message",
    agentPost,
  );
  await db
    .update(bunqPaymentProposals)
    .set({ chatMessageId: other.message.id })
    .where(eq(bunqPaymentProposals.id, created.proposal.id));
  await assert.rejects(
    () =>
      answerChatThreadMessageApproval(
        workspaceId,
        threadId,
        message.id,
        "rejected",
        undefined,
        remonPost,
        {},
        remon,
        approverCode(proposalHash),
      ),
    (error: unknown) => (error as { status?: number }).status === 403,
  );
  await db
    .update(bunqPaymentProposals)
    .set({ chatMessageId: message.id })
    .where(eq(bunqPaymentProposals.id, created.proposal.id));

  // Correct code + bound message → reject (no money moves).
  const answered = await answerChatThreadMessageApproval(
    workspaceId,
    threadId,
    message.id,
    "rejected",
    undefined,
    remonPost,
    {},
    remon,
    approverCode(proposalHash),
  );
  assert.equal(answered.message.approvalAnswer?.decision, "rejected");
  const [after] = await db
    .select({ status: bunqPaymentProposals.status })
    .from(bunqPaymentProposals)
    .where(eq(bunqPaymentProposals.id, created.proposal.id))
    .limit(1);
  assert.equal(after?.status, "rejected");
});

test("C1: approve without a valid approverCode is refused", async (context) => {
  const userId = id("user");
  const workspaceId = id("workspace");
  const contactId = id("contact");
  const agentId = id("ralph-agent");
  process.env.BUNQ_PAYMENT_PROPOSAL_AGENT_ID = agentId;
  const agentKeyId = id("agent-key");
  const agentKeySecret = agentSecret();

  context.after(async () => {
    await db
      .delete(bunqPaymentProposals)
      .where(eq(bunqPaymentProposals.workspaceId, workspaceId));
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
    name: "bunq stepup",
    slug: id("bunq-step"),
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
  await db.insert(apiKeys).values({
    id: agentKeyId,
    workspaceId,
    userId: null,
    contactId,
    name: "Ralph",
    prefix: apiKeyLookupPrefix(agentKeySecret),
    keyHash: hashApiKey(agentKeySecret),
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

  const paymentFields = {
    recipientName: "Ada",
    recipientIban: "NL91ABNA0417164300",
    amountValue: "2.00",
    amountCurrency: "EUR",
    memo: "step-up",
    sourceMonetaryAccountId: "5",
  };
  const { proposalHash } = hashBunqPaymentProposal(paymentFields);
  const created = await createBunqPaymentProposal(
    workspaceId,
    agentAuth(workspaceId, agentKeyId, contactId),
    { ...paymentFields, idempotencyKey: `step-${randomUUID()}` },
  );
  const counter = { n: 0 };
  const deps = {
    getPaymentClient: async () => mockPaymentClient({ mode: "count", counter }),
  };

  // Valid Access key id but wrong code → no payment.
  await assert.rejects(
    () =>
      approveBunqPaymentProposal(
        workspaceId,
        created.proposal.id,
        ownerAuth(userId, workspaceId),
        {
          proposalHash,
          approverCode:
            approverCode(proposalHash) === "000000" ? "000001" : "000000",
        },
        deps,
      ),
    (error: unknown) => (error as { status?: number }).status === 403,
  );
  // Access key that is not allowlisted → no payment, even with a valid code.
  await assert.rejects(
    () =>
      approveBunqPaymentProposal(
        workspaceId,
        created.proposal.id,
        { ...ownerAuth(userId, workspaceId), apiKeyId: "not-allowlisted" },
        { proposalHash, approverCode: approverCode(proposalHash) },
        deps,
      ),
    (error: unknown) => (error as { status?: number }).status === 403,
  );
  assert.equal(counter.n, 0);
});
