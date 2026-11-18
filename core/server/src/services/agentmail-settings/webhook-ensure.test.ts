import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, it, mock } from "node:test";
import { fileURLToPath } from "node:url";

import { AgentMailApiError, AgentMailClient } from "../../lib/agentmail-client.js";
import {
  agentMailWebhookEnsureDeps,
  classifyAgentMailWebhookEnsure,
  ensureAgentMailWebhook,
  isAgentMailDoorWebhookUrl,
  isAgentMailWebhookNotFoundError,
  pickAdoptableAgentMailWebhook,
  shouldAttemptAgentMailWebhookAdopt,
} from "./settings.js";

const DOOR =
  "https://agent.backsteros.com/api/v1/webhooks/agentmail";
const STAGING =
  "https://staging.backsteros.com/api/v1/webhooks/agentmail";

describe("AgentMail webhook ensure (OS-188)", () => {
  it("accepts only the agents-door webhook path", () => {
    assert.equal(isAgentMailDoorWebhookUrl(DOOR), true);
    assert.equal(
      isAgentMailDoorWebhookUrl(
        "https://agents.backsteros.com/api/v1/webhooks/agentmail",
      ),
      true,
    );
    assert.equal(isAgentMailDoorWebhookUrl(STAGING), false);
    assert.equal(
      isAgentMailDoorWebhookUrl("https://agent.backsteros.com/other"),
      false,
    );
  });

  it("recreates when the stored URL is staging / not the door", () => {
    const decision = classifyAgentMailWebhookEnsure({
      targetUrl: DOOR,
      storedUrl: STAGING,
      desiredInboxIds: ["inbox_a", "inbox_b"],
      remote: {
        enabled: true,
        url: STAGING,
        inboxIds: ["inbox_a"],
      },
    });
    assert.equal(decision.action, "recreate");
    if (decision.action === "recreate") {
      assert.match(decision.reason, /mismatch|not the agents door|staging/i);
    }
  });

  it("recreates when the remote webhook is disabled", () => {
    const decision = classifyAgentMailWebhookEnsure({
      targetUrl: DOOR,
      storedUrl: DOOR,
      desiredInboxIds: ["inbox_a", "inbox_b"],
      remote: {
        enabled: false,
        url: DOOR,
        inboxIds: ["inbox_a", "inbox_b"],
      },
    });
    assert.equal(decision.action, "recreate");
    if (decision.action === "recreate") {
      assert.match(decision.reason, /enabled:false/);
    }
  });

  it("updates inboxes when the door hook is healthy but incomplete", () => {
    const decision = classifyAgentMailWebhookEnsure({
      targetUrl: DOOR,
      storedUrl: DOOR,
      desiredInboxIds: ["inbox_a", "inbox_b", "inbox_c"],
      remote: {
        enabled: true,
        url: DOOR,
        inboxIds: ["inbox_a"],
      },
    });
    assert.equal(decision.action, "update-inboxes");
    if (decision.action === "update-inboxes") {
      assert.deepEqual(decision.toAdd, ["inbox_b", "inbox_c"]);
      assert.deepEqual(decision.toRemove, []);
    }
  });

  it("no-ops when the door hook already covers every inbox", () => {
    const decision = classifyAgentMailWebhookEnsure({
      targetUrl: DOOR,
      storedUrl: DOOR,
      desiredInboxIds: ["inbox_a", "inbox_b"],
      remote: {
        enabled: true,
        url: DOOR,
        inboxIds: ["inbox_a", "inbox_b"],
      },
    });
    assert.equal(decision.action, "noop");
  });

  it("treats only 404/not-found as missing; 5xx stays transient", () => {
    assert.equal(
      isAgentMailWebhookNotFoundError(new AgentMailApiError(404, "gone")),
      true,
    );
    assert.equal(
      isAgentMailWebhookNotFoundError(
        new AgentMailApiError(400, '{"message":"webhook not found"}'),
      ),
      true,
    );
    assert.equal(
      isAgentMailWebhookNotFoundError(new AgentMailApiError(500, "boom")),
      false,
    );
    assert.equal(
      isAgentMailWebhookNotFoundError(new AgentMailApiError(429, "slow")),
      false,
    );
    assert.equal(
      isAgentMailWebhookNotFoundError(new Error("fetch failed")),
      false,
    );
  });

  it("adopts an existing healthy door webhook instead of duplicating", () => {
    const picked = pickAdoptableAgentMailWebhook(
      [
        {
          webhookId: "ep_stale",
          url: STAGING,
          enabled: true,
        },
        {
          webhookId: "ep_3MH1oiuNtrFCY",
          url: DOOR,
          enabled: true,
        },
        {
          webhookId: "ep_disabled",
          url: DOOR,
          enabled: false,
        },
      ],
      DOOR,
    );
    assert.equal(picked?.webhookId, "ep_3MH1oiuNtrFCY");
    assert.equal(pickAdoptableAgentMailWebhook([], DOOR), null);
    assert.equal(
      pickAdoptableAgentMailWebhook(
        [{ webhookId: "ep_x", url: DOOR, enabled: false }],
        DOOR,
      ),
      null,
    );
  });

  it("attempts adopt on every recreate, including stored url mismatch", () => {
    const mismatch = classifyAgentMailWebhookEnsure({
      targetUrl: DOOR,
      storedUrl: STAGING,
      desiredInboxIds: ["inbox_a"],
      remote: { enabled: true, url: STAGING, inboxIds: ["inbox_a"] },
    });
    assert.equal(mismatch.action, "recreate");
    assert.equal(shouldAttemptAgentMailWebhookAdopt(mismatch), true);
    assert.equal(
      shouldAttemptAgentMailWebhookAdopt({
        action: "noop",
        reason: "ok",
      }),
      false,
    );
  });

  it("adopts door webhook on stored url mismatch (mocked client flow)", async () => {
    const upserts: Array<{
      webhookId: string | null;
      webhookUrl: string | null;
    }> = [];
    let createCalls = 0;

    mock.method(agentMailWebhookEnsureDeps, "agentsPublicWebhookUrl", () => DOOR);
    mock.method(agentMailWebhookEnsureDeps, "getSecretRow", async () => ({
      agentmailApiKey: "am_test",
      agentmailInboxId: "inbox_a",
      agentmailInboxIds: ["inbox_a", "inbox_b"],
      agentmailInboxContacts: {},
      agentmailReplyGreetingTemplate: null,
      agentmailReplyGreetingTemplateEn: null,
      agentmailReplyGreetingTemplateNl: null,
      agentmailReplySignOffTemplate: null,
      agentmailReplySignOffTemplateEn: null,
      agentmailReplySignOffTemplateNl: null,
      agentmailReplySignOffName: null,
      agentmailWebhookId: "ep_stale_staging",
      agentmailWebhookSecret: "whsec_stale",
      agentmailWebhookUrl: STAGING,
      emailGrokWebhookUrl: null,
      emailGrokWebhookKey: null,
    }));
    mock.method(
      agentMailWebhookEnsureDeps,
      "upsertSecrets",
      async (
        _workspaceId: string,
        _apiKey: string | null,
        _inboxIds: string[],
        options?: {
          webhook?: {
            webhookId: string | null;
            webhookSecret: string | null;
            webhookUrl: string | null;
          };
        },
      ) => {
        upserts.push({
          webhookId: options?.webhook?.webhookId ?? null,
          webhookUrl: options?.webhook?.webhookUrl ?? null,
        });
      },
    );

    const fakeClient = {
      async getWebhook(webhookId: string) {
        if (webhookId === "ep_stale_staging") {
          return {
            webhookId,
            enabled: true,
            url: STAGING,
            inboxIds: ["inbox_a"],
            secret: "whsec_stale",
            eventTypes: ["message.received"],
          };
        }
        return {
          webhookId: "ep_3MH1oiuNtrFCY",
          enabled: true,
          url: DOOR,
          inboxIds: ["inbox_a", "inbox_b"],
          secret: "whsec_door",
          eventTypes: ["message.received"],
        };
      },
      async listWebhooks() {
        return [
          {
            webhookId: "ep_3MH1oiuNtrFCY",
            enabled: true,
            url: DOOR,
            inboxIds: ["inbox_a", "inbox_b"],
            secret: "whsec_door",
            eventTypes: ["message.received"],
          },
        ];
      },
      async createWebhook() {
        createCalls += 1;
        throw new Error("must not create when adopting");
      },
      async updateWebhook() {
        return {
          webhookId: "ep_3MH1oiuNtrFCY",
          enabled: true,
          url: DOOR,
          inboxIds: ["inbox_a", "inbox_b"],
          secret: "whsec_door",
          eventTypes: ["message.received"],
        };
      },
      async deleteWebhook() {
        throw new Error("must not delete when adopting");
      },
    };
    mock.method(
      agentMailWebhookEnsureDeps,
      "createClient",
      () => fakeClient as unknown as AgentMailClient,
    );

    await ensureAgentMailWebhook("ws_test", "am_test", ["inbox_a", "inbox_b"]);

    assert.equal(createCalls, 0);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.webhookId, "ep_3MH1oiuNtrFCY");
    assert.equal(upserts[0]?.webhookUrl, DOOR);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("creates the replacement webhook before deleting the old one", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "settings.ts"),
      "utf8",
    );
    const recreateIdx = src.indexOf("ensureWebhook recreating:");
    assert.ok(recreateIdx > 0);
    const slice = src.slice(recreateIdx, recreateIdx + 1200);
    const createIdx = slice.indexOf("createWebhook");
    const deleteIdx = slice.indexOf("deleteWebhook");
    assert.ok(createIdx >= 0, "recreate path must call createWebhook");
    assert.ok(deleteIdx >= 0, "recreate path must call deleteWebhook");
    assert.ok(
      createIdx < deleteIdx,
      "must create the new webhook before deleting the old one",
    );
  });

  it("keeps the existing webhook on getWebhook 5xx (source guard)", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "settings.ts"),
      "utf8",
    );
    assert.ok(src.includes("isAgentMailWebhookNotFoundError"));
    assert.ok(
      src.includes("ensureWebhook keeping existing webhook after getWebhook error"),
    );
  });

  it("keeps the existing webhook on listWebhooks error (no duplicate create)", async () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "settings.ts"),
      "utf8",
    );
    assert.ok(
      src.includes(
        "ensureWebhook keeping existing webhook after listWebhooks error",
      ),
    );
    assert.equal(
      src.includes("adopt lookup failed; will recreate"),
      false,
      "listWebhooks errors must not fall through to recreate",
    );

    let createCalls = 0;
    mock.method(agentMailWebhookEnsureDeps, "agentsPublicWebhookUrl", () => DOOR);
    mock.method(agentMailWebhookEnsureDeps, "getSecretRow", async () => ({
      agentmailApiKey: "am_test",
      agentmailInboxId: "inbox_a",
      agentmailInboxIds: ["inbox_a"],
      agentmailInboxContacts: {},
      agentmailReplyGreetingTemplate: null,
      agentmailReplyGreetingTemplateEn: null,
      agentmailReplyGreetingTemplateNl: null,
      agentmailReplySignOffTemplate: null,
      agentmailReplySignOffTemplateEn: null,
      agentmailReplySignOffTemplateNl: null,
      agentmailReplySignOffName: null,
      agentmailWebhookId: "ep_stale_staging",
      agentmailWebhookSecret: "whsec_stale",
      agentmailWebhookUrl: STAGING,
      emailGrokWebhookUrl: null,
      emailGrokWebhookKey: null,
    }));
    mock.method(agentMailWebhookEnsureDeps, "upsertSecrets", async () => {
      throw new Error("must not upsert on listWebhooks failure");
    });

    const fakeClient = {
      async getWebhook(webhookId: string) {
        return {
          webhookId,
          enabled: true,
          url: STAGING,
          inboxIds: ["inbox_a"],
          secret: "whsec_stale",
          eventTypes: ["message.received"],
        };
      },
      async listWebhooks() {
        throw new AgentMailApiError(503, "temporary");
      },
      async createWebhook() {
        createCalls += 1;
        throw new Error("must not create on listWebhooks failure");
      },
      async updateWebhook() {
        throw new Error("must not update on listWebhooks failure");
      },
      async deleteWebhook() {
        throw new Error("must not delete on listWebhooks failure");
      },
    };
    mock.method(
      agentMailWebhookEnsureDeps,
      "createClient",
      () => fakeClient as unknown as AgentMailClient,
    );

    await ensureAgentMailWebhook("ws_test", "am_test", ["inbox_a"]);
    assert.equal(createCalls, 0);
  });
});
