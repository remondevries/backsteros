import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
  assertNoDraftBodyLoss,
  assembleReplyEmail,
  draftHasStoredShell,
  plainTextEmailToHtml,
  planDraftSendBodies,
  resolveEmailReplyTemplates,
  sanitizeAgentReplyBody,
} from "./email-reply-assembler.js";
import { AgentMailClient } from "./agentmail-client.js";
import type { AgentMailDraftDetail } from "./agentmail-client.js";
import {
  resolveDraftListThreadKey,
  shouldAssignDraftConceptStatus,
} from "./agentmail-email-list.js";
import {
  agentMailDraftLifecycleDeps,
  deleteAgentMailDraft,
  ensureDraftEmailThreadRegistered,
  sendAgentMailDraft,
  syncAgentMailEmailStatusLabel,
} from "../services/agentmail-settings.js";

/** OS-48 incident body: greeting, two paragraphs, amount, P.S., Dutch sign-off. */
const OS48_STORED_DRAFT = [
  "Aan Fandy,",
  "",
  "Hierbij de boekingsregel met bedrag €17.183,09 voor de kruisposten.",
  "",
  "P.S. Ik heb zojuist van Moneybird begrepen dat dit klopt.",
  "",
  "Met vriendelijke groet,",
  "Remon",
].join("\n");

const OS48_STORED_HTML = plainTextEmailToHtml(OS48_STORED_DRAFT);

const TEMPLATES = resolveEmailReplyTemplates({
  greetingTemplateNl: "Aan {firstName},",
  signOffTemplateNl: "Met vriendelijke groet,\n{name}",
  signOffName: "Remon",
});

function baseDraft(
  overrides: Partial<AgentMailDraftDetail> = {},
): AgentMailDraftDetail {
  return {
    inboxId: "inbox_1",
    draftId: "draft_os48",
    subject: "Boekingsregel Kruisposten in Moneybird",
    preview: null,
    text: OS48_STORED_DRAFT,
    html: OS48_STORED_HTML,
    inReplyTo: null,
    clientId: "bsh-compose-test",
    to: ["fandy@fandy.nl"],
    attachments: [],
    updatedAt: "2026-10-01T08:00:00.000Z",
    createdAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  mock.restoreAll();
});

describe("email draft send path helpers", () => {
  it("plans use_stored for a shelled OS-48 draft", () => {
    const plan = planDraftSendBodies({
      text: OS48_STORED_DRAFT,
      html: OS48_STORED_HTML,
      signOffName: "Remon",
    });
    assert.equal(plan.kind, "use_stored");
    if (plan.kind !== "use_stored") return;
    assert.equal(plan.text, OS48_STORED_DRAFT);
    assert.equal(plan.html, OS48_STORED_HTML);
    assert.match(plan.text, /^Aan Fandy,/);
    assert.match(plan.text, /€17\.183,09/);
    assert.match(plan.text, /P\.S\. Ik heb zojuist/);
  });

  it("treats HTML-only drafts as use_stored", () => {
    const html = "<p>Aan Fandy,</p><p>€17.183,09</p>";
    assert.equal(draftHasStoredShell("", html, "Remon"), true);
    assert.equal(draftHasStoredShell(null, html, ""), true);
    const plan = planDraftSendBodies({
      text: "",
      html,
      signOffName: "Remon",
    });
    assert.equal(plan.kind, "use_stored");
    if (plan.kind !== "use_stored") return;
    assert.equal(plan.html, html);
  });

  it("does not treat empty signOffName or bare name mentions as shelled", () => {
    assert.equal(
      draftHasStoredShell("Remon calls you about the invoice.", null, ""),
      false,
    );
    assert.equal(
      draftHasStoredShell("Remon calls you about the invoice.", null, "Remon"),
      false,
    );
    assert.equal(
      draftHasStoredShell("Body line\n\nRemon", null, "Remon"),
      true,
    );
  });

  it("plans use_stored for text-only drafts with trailing P.S. or title after the name", () => {
    const withPs = [
      "Aan Fandy,",
      "",
      "Hierbij de boekingsregel.",
      "",
      "Met vriendelijke groet,",
      "Remon",
      "",
      "P.S. Check Moneybird nog even.",
    ].join("\n");
    const withTitle = [
      "Aan Fandy,",
      "",
      "Hierbij de boekingsregel.",
      "",
      "Met vriendelijke groet,",
      "Remon de Vries",
    ].join("\n");

    assert.equal(
      draftHasStoredShell(withPs, null, "Remon", {
        signOffTemplateNl: TEMPLATES.signOffTemplateNl,
      }),
      true,
    );
    assert.equal(
      draftHasStoredShell(withTitle, null, "Remon", {
        signOffTemplateNl: TEMPLATES.signOffTemplateNl,
      }),
      true,
    );

    const planPs = planDraftSendBodies({
      text: withPs,
      html: null,
      signOffName: "Remon",
      signOffTemplateNl: TEMPLATES.signOffTemplateNl,
    });
    assert.equal(planPs.kind, "use_stored");
    if (planPs.kind === "use_stored") {
      assert.equal(planPs.text, withPs);
      assert.equal(planPs.html, null);
    }

    const planTitle = planDraftSendBodies({
      text: withTitle,
      html: null,
      signOffName: "Remon",
      signOffTemplateNl: TEMPLATES.signOffTemplateNl,
    });
    assert.equal(planTitle.kind, "use_stored");
    if (planTitle.kind === "use_stored") {
      assert.equal(planTitle.text, withTitle);
      assert.equal(planTitle.html, null);
    }
  });

  it("assertNoDraftBodyLoss boundary: 85% passes, just below refuses, short texts pass", () => {
    const stored = "a".repeat(100);
    assert.doesNotThrow(() => assertNoDraftBodyLoss(stored, "a".repeat(85)));
    assert.throws(
      () => assertNoDraftBodyLoss(stored, "a".repeat(84)),
      /lose text/i,
    );

    const short = "short body under forty chars";
    assert.ok(short.replace(/\s+/g, "").length < 40);
    assert.doesNotThrow(() => assertNoDraftBodyLoss(short, "x"));
  });

  it("assertNoDraftBodyLoss refuses when a multi-paragraph body drops a block", () => {
    const stored = [
      "Hierbij de boekingsregel met bedrag €17.183,09 voor de kruisposten.",
      "",
      "P.S. Ik heb zojuist van Moneybird begrepen dat dit klopt.",
    ].join("\n");
    const next = [
      "Aan Fandy,",
      "",
      "P.S. Ik heb zojuist van Moneybird begrepen dat dit klopt.",
      "",
      "Met vriendelijke groet,",
      "Remon",
    ].join("\n");
    // Length can stay high with greeting/sign-off padding — still refuse.
    assert.throws(() => assertNoDraftBodyLoss(stored, next), /lose text/i);
  });

  it("preserveBody keeps OS-48 paragraphs that sanitize alone used to drop", () => {
    const middle = [
      "Hierbij de boekingsregel met bedrag €17.183,09 voor de kruisposten.",
      "",
      "P.S. Ik heb zojuist van Moneybird begrepen dat dit klopt.",
    ].join("\n");
    const cleaned = sanitizeAgentReplyBody(middle);
    assert.match(cleaned, /€17\.183,09/);
    assert.match(cleaned, /P\.S\./);

    const assembled = assembleReplyEmail({
      from: "fandy@fandy.nl",
      subject: "Boekingsregel",
      body: middle,
      templates: TEMPLATES,
      languageHint: "nl",
      preserveBody: true,
    });
    assert.match(assembled.greeting, /^Aan Fandy,/);
    assert.equal(assembled.body, middle);
  });
});

describe("draft thread metadata isolation", () => {
  it("registers concept on draft:<id> without touching the parent thread key", async () => {
    const parentKey = "thread_parent_508ca433";
    const draft = baseDraft({ draftId: "draft_reply_1" });
    const draftKey = resolveDraftListThreadKey({
      draftId: draft.draftId,
      threadId: parentKey,
    });
    assert.equal(draftKey, "draft:draft_reply_1");

    const patchedKeys: string[] = [];
    const createdKeys: string[] = [];
    mock.method(agentMailDraftLifecycleDeps, "getOrCreateThread", async (
      _ws: string,
      _inbox: string,
      threadKey: string,
    ) => {
      createdKeys.push(threadKey);
      return {
        id: "meta_draft",
        inboxId: "inbox_1",
        threadKey,
        number: 42,
        displayId: "E-42",
        status: "triage",
        priority: 0,
        dueDate: null,
        organizationId: null,
        contactId: null,
        assigneeId: null,
        projectId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    mock.method(agentMailDraftLifecycleDeps, "patchThread", async (
      _ws: string,
      _inbox: string,
      threadKey: string,
      patch: { status: string },
    ) => {
      patchedKeys.push(threadKey);
      assert.equal(patch.status, "concept");
      assert.notEqual(threadKey, parentKey);
      return null;
    });

    await ensureDraftEmailThreadRegistered(
      "ws_1",
      "inbox_1",
      draft,
      parentKey,
    );
    assert.deepEqual(createdKeys, [draftKey]);
    assert.deepEqual(patchedKeys, [draftKey]);
  });

  it("does not re-force concept when the draft row already has another status", async () => {
    let patchCalls = 0;
    mock.method(agentMailDraftLifecycleDeps, "getOrCreateThread", async () => ({
      id: "meta_draft",
      inboxId: "inbox_1",
      threadKey: "draft:draft_reply_1",
      number: 42,
      displayId: "E-42",
      status: "in_progress",
      priority: 0,
      dueDate: null,
      organizationId: null,
      contactId: null,
      assigneeId: null,
      projectId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(agentMailDraftLifecycleDeps, "patchThread", async () => {
      patchCalls += 1;
      return null;
    });

    assert.equal(shouldAssignDraftConceptStatus("in_progress"), false);
    await ensureDraftEmailThreadRegistered(
      "ws_1",
      "inbox_1",
      baseDraft({ draftId: "draft_reply_1" }),
      "thread_parent",
    );
    assert.equal(patchCalls, 0);
  });

  it("draft and parent keys produce distinct E-number slots", () => {
    const draftKey = resolveDraftListThreadKey({
      draftId: "d1",
      threadId: "t1",
    });
    assert.equal(draftKey, "draft:d1");
    assert.notEqual(draftKey, "t1");
  });

  it("deleteAgentMailDraft removes draft:<id> metadata", async () => {
    mock.method(agentMailDraftLifecycleDeps, "getCredentials", async () => ({
      apiKey: "am_test_fake_key",
      inboxId: "inbox_1",
      inboxIds: ["inbox_1"],
    }));
    const draft = baseDraft({ draftId: "draft_to_delete", inReplyTo: null });
    mock.method(AgentMailClient.prototype, "getDraft", async () => draft);
    mock.method(AgentMailClient.prototype, "deleteDraft", async () => undefined);
    const deleted: string[] = [];
    mock.method(
      agentMailDraftLifecycleDeps,
      "deleteThread",
      async (_ws: string, _inbox: string, threadKey: string) => {
        deleted.push(threadKey);
        return true;
      },
    );

    await deleteAgentMailDraft("ws_1", "inbox_1", "draft_to_delete");
    assert.deepEqual(deleted, ["draft:draft_to_delete"]);
  });

  it("syncAgentMailEmailStatusLabel skips draft: keys (no AgentMail label writes)", async () => {
    let labelCalls = 0;
    mock.method(
      AgentMailClient.prototype,
      "updateThreadLabels",
      async () => {
        labelCalls += 1;
      },
    );
    await syncAgentMailEmailStatusLabel(
      "ws_1",
      "inbox_1",
      "draft:draft_1",
      "concept",
    );
    assert.equal(labelCalls, 0);
  });
});

describe("sendAgentMailDraft (mocked AgentMail client)", () => {
  function stubLifecycle() {
    mock.method(agentMailDraftLifecycleDeps, "getCredentials", async () => ({
      apiKey: "am_test_fake_key",
      inboxId: "inbox_1",
      inboxIds: ["inbox_1"],
    }));
    mock.method(agentMailDraftLifecycleDeps, "getTemplates", async () => TEMPLATES);
    mock.method(agentMailDraftLifecycleDeps, "patchThread", async () => null);
    mock.method(agentMailDraftLifecycleDeps, "deleteThread", async () => true);
    mock.method(agentMailDraftLifecycleDeps, "getOrCreateThread", async () => ({
      id: "meta",
      inboxId: "inbox_1",
      threadKey: "draft:x",
      number: 1,
      displayId: "E-1",
      status: "concept",
      priority: 0,
      dueDate: null,
      organizationId: null,
      contactId: null,
      assigneeId: null,
      projectId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  it("sends a stored OS-48 draft unchanged (no text/html updateDraft)", async () => {
    stubLifecycle();
    const draft = baseDraft();
    let sendCalls = 0;
    let updateCalls: Record<string, unknown>[] = [];

    mock.method(
      AgentMailClient.prototype,
      "getDraft",
      async () => draft,
    );
    mock.method(
      AgentMailClient.prototype,
      "updateDraft",
      async (
        _inboxId: string,
        _draftId: string,
        body: Record<string, unknown>,
      ) => {
        updateCalls.push(body);
        return { ...draft, ...body };
      },
    );
    mock.method(
      AgentMailClient.prototype,
      "sendDraft",
      async (inboxId: string, draftId: string) => {
        sendCalls += 1;
        assert.equal(inboxId, "inbox_1");
        assert.equal(draftId, "draft_os48");
        return {
          inboxId: "inbox_1",
          messageId: "msg_sent",
          threadId: "thread_sent",
        };
      },
    );

    const deleted: string[] = [];
    mock.method(
      agentMailDraftLifecycleDeps,
      "deleteThread",
      async (_ws: string, _inbox: string, threadKey: string) => {
        deleted.push(threadKey);
        return true;
      },
    );

    await sendAgentMailDraft("ws_1", "inbox_1", "draft_os48");
    assert.equal(sendCalls, 1);
    assert.equal(
      updateCalls.filter((body) => "text" in body || "html" in body).length,
      0,
    );
    assert.deepEqual(deleted, ["draft:draft_os48"]);
  });

  it("rejects a lossy rebuild and never calls sendDraft", async () => {
    stubLifecycle();
    // Full shelled body, but name/sign-off don't match templates → reassemble.
    // Editable extract collapses agent-iteration noise to the short last block.
    const noisyStored = [
      "Beste,",
      "",
      "Bedankt voor het toesturen van factuur 8959599. We hebben de factuur ontvangen en begrepen.",
      "",
      "Met vriendelijke groet,",
      "SomeoneElse",
      "Bedankt voor het toesturen van factuur 8959599. We hebben de factuur ontvangen en begrepen.",
      "Wij zijn het niet eens met factuur 8959599. Graag ontvangen wij een toelichting.",
      "Bedankt voor de notificatie en het toesturen van factuur 8959599. We hebben de factuur ontvangen, zullen deze verwerken en onze prijzen dienovereenkomstig bijwerken.",
      "",
      "Best,",
      "SomeoneElse",
    ].join("\n");

    const draft = baseDraft({
      draftId: "draft_lossy",
      text: noisyStored,
      html: null,
      to: ["ada@example.com"],
      inReplyTo: "msg_parent",
    });

    let sendCalls = 0;
    mock.method(AgentMailClient.prototype, "getDraft", async () => draft);
    mock.method(AgentMailClient.prototype, "getMessage", async () => ({
      inboxId: "inbox_1",
      threadId: "thread_1",
      messageId: "msg_parent",
      subject: "Invoice",
      from: "Ada <ada@example.com>",
      to: ["remon@lemo-design.com"],
      preview: null,
      timestamp: "2026-10-01T08:00:00.000Z",
      labels: [],
      text: "Factuur graag verwerken.",
      html: null,
      extractedText: "Factuur graag verwerken.",
      extractedHtml: null,
      inReplyTo: null,
      attachments: [],
    }));
    mock.method(AgentMailClient.prototype, "getThread", async () => ({
      inboxId: "inbox_1",
      threadId: "thread_1",
      subject: "Invoice",
      messages: [],
    }));
    mock.method(AgentMailClient.prototype, "updateDraft", async () => draft);
    mock.method(AgentMailClient.prototype, "sendDraft", async () => {
      sendCalls += 1;
      return {
        inboxId: "inbox_1",
        messageId: "msg_sent",
        threadId: "thread_sent",
      };
    });

    await assert.rejects(
      () => sendAgentMailDraft("ws_1", "inbox_1", "draft_lossy"),
      /lose text/i,
    );
    assert.equal(sendCalls, 0);
  });

  it("sends text-only shelled drafts with P.S. or title unchanged", async () => {
    stubLifecycle();
    const withPs = [
      "Aan Fandy,",
      "",
      "Hierbij de boekingsregel.",
      "",
      "Met vriendelijke groet,",
      "Remon",
      "",
      "P.S. Check Moneybird nog even.",
    ].join("\n");
    const withTitle = [
      "Aan Fandy,",
      "",
      "Hierbij de boekingsregel.",
      "",
      "Met vriendelijke groet,",
      "Remon de Vries",
    ].join("\n");

    for (const [draftId, text] of [
      ["draft_ps", withPs],
      ["draft_title", withTitle],
    ] as const) {
      const draft = baseDraft({ draftId, text, html: null });
      let sendCalls = 0;
      const updateBodies: Record<string, unknown>[] = [];

      mock.method(AgentMailClient.prototype, "getDraft", async () => draft);
      mock.method(
        AgentMailClient.prototype,
        "updateDraft",
        async (
          _inboxId: string,
          _draftId: string,
          body: Record<string, unknown>,
        ) => {
          updateBodies.push(body);
          return draft;
        },
      );
      mock.method(AgentMailClient.prototype, "sendDraft", async () => {
        sendCalls += 1;
        return {
          inboxId: "inbox_1",
          messageId: "msg_sent",
          threadId: "thread_sent",
        };
      });

      await sendAgentMailDraft("ws_1", "inbox_1", draftId);
      assert.equal(sendCalls, 1, draftId);
      assert.equal(
        updateBodies.filter((body) => "text" in body || "html" in body).length,
        0,
        draftId,
      );
    }
  });

  it("sends an HTML-only draft unchanged", async () => {
    stubLifecycle();
    const html = "<p>Aan Fandy,</p><p>€17.183,09</p><p>P.S. Check Moneybird.</p>";
    const draft = baseDraft({
      draftId: "draft_html_only",
      text: "",
      html,
    });
    let sendCalls = 0;
    const updateBodies: Record<string, unknown>[] = [];

    mock.method(AgentMailClient.prototype, "getDraft", async () => draft);
    mock.method(
      AgentMailClient.prototype,
      "updateDraft",
      async (
        _inboxId: string,
        _draftId: string,
        body: Record<string, unknown>,
      ) => {
        updateBodies.push(body);
        return draft;
      },
    );
    mock.method(
      AgentMailClient.prototype,
      "sendDraft",
      async () => {
        sendCalls += 1;
        return {
          inboxId: "inbox_1",
          messageId: "msg_sent",
          threadId: "thread_sent",
        };
      },
    );

    await sendAgentMailDraft("ws_1", "inbox_1", "draft_html_only");
    assert.equal(sendCalls, 1);
    assert.equal(
      updateBodies.filter((body) => "text" in body || "html" in body).length,
      0,
    );
  });
});
