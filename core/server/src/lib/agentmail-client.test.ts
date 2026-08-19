import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AgentMailClient,
  formatAgentMailAddress,
  formatAgentMailApiError,
  mapAgentMailAuthMe,
  mapAgentMailInbox,
  mapAgentMailMessageSummary,
} from "./agentmail-client.js";

describe("agentmail-client mappers", () => {
  it("maps auth me response", () => {
    const mapped = mapAgentMailAuthMe({
      scope_type: "organization",
      scope_id: "org_123",
      organization_id: "org_123",
      pod_id: "pod_456",
      inbox_id: null,
      api_key_id: "key_789",
    });
    assert.equal(mapped.scopeType, "organization");
    assert.equal(mapped.organizationId, "org_123");
    assert.equal(mapped.podId, "pod_456");
  });

  it("maps inbox rows", () => {
    const mapped = mapAgentMailInbox({
      inbox_id: "inbox_1",
      email: "support@agentmail.to",
      display_name: "Support",
      pod_id: "pod_456",
    });
    assert.equal(mapped.inboxId, "inbox_1");
    assert.equal(mapped.email, "support@agentmail.to");
    assert.equal(mapped.displayName, "Support");
  });

  it("maps message rows and addresses", () => {
    const mapped = mapAgentMailMessageSummary({
      inbox_id: "inbox_1",
      thread_id: "thread_1",
      message_id: "msg_1",
      subject: "Invoice",
      from: { name: "Ada", email: "ada@example.com" },
      preview: "Please find attached",
      timestamp: "2026-08-19T10:00:00Z",
    });
    assert.equal(mapped.messageId, "msg_1");
    assert.equal(mapped.from, "Ada <ada@example.com>");
    assert.equal(formatAgentMailAddress("ops@example.com"), "ops@example.com");
  });
});

describe("AgentMailClient", () => {
  it("lists inboxes with bearer auth", async () => {
    const calls: { url: string; auth?: string }[] = [];
    const client = new AgentMailClient({
      apiKey: "am_test_key",
      fetchImpl: async (input, init) => {
        const url = String(input);
        const headers = init?.headers;
        const auth =
          headers instanceof Headers
            ? headers.get("Authorization") ?? undefined
            : headers && typeof headers === "object" && !Array.isArray(headers)
              ? String(
                  (headers as Record<string, string>).Authorization ??
                    (headers as Record<string, string>).authorization ??
                    "",
                ) || undefined
              : undefined;
        calls.push({ url, auth });
        if (url.endsWith("/auth/me")) {
          return new Response(
            JSON.stringify({
              scope_type: "organization",
              scope_id: "org_123",
              organization_id: "org_123",
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            count: 1,
            inboxes: [
              {
                inbox_id: "inbox_1",
                email: "hello@agentmail.to",
                display_name: "Hello",
                pod_id: "pod_1",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
          { status: 200 },
        );
      },
    });

    const me = await client.authMe();
    const inboxes = await client.listInboxes({ limit: 25 });

    assert.equal(me.organizationId, "org_123");
    assert.equal(inboxes.length, 1);
    assert.equal(inboxes[0]?.email, "hello@agentmail.to");
    assert.equal(calls[0]?.auth, "Bearer am_test_key");
    assert.match(calls[1]?.url ?? "", /\/inboxes\?limit=25$/);
  });

  it("lists messages for an inbox", async () => {
    const client = new AgentMailClient({
      apiKey: "am_test_key",
      fetchImpl: async (input) => {
        const url = String(input);
        assert.match(url, /\/inboxes\/inbox_1\/messages\?limit=20$/);
        return new Response(
          JSON.stringify({
            count: 1,
            messages: [
              {
                inbox_id: "inbox_1",
                thread_id: "thread_1",
                message_id: "msg_1",
                subject: "Hello finance",
                from: "billing@example.com",
                preview: "Q3 numbers",
                timestamp: "2026-08-19T09:00:00Z",
              },
            ],
          }),
          { status: 200 },
        );
      },
    });

    const messages = await client.listMessages("inbox_1", { limit: 20 });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.subject, "Hello finance");
    assert.equal(messages[0]?.from, "billing@example.com");
  });

  it("formats API error bodies for operators", () => {
    assert.equal(
      formatAgentMailApiError(400, '{"message":"client_id already exists"}'),
      "AgentMail: client_id already exists",
    );
  });

  it("creates reply drafts with in_reply_to", async () => {
    let createBody: Record<string, unknown> = {};
    const client = new AgentMailClient({
      apiKey: "am_test_key",
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith("/drafts") && init?.method === "POST") {
          createBody = JSON.parse(String(init.body)) as Record<string, unknown>;
          return new Response(
            JSON.stringify({
              inbox_id: "inbox_1",
              draft_id: "draft_1",
              labels: [],
              updated_at: "2026-08-19T09:00:00Z",
              created_at: "2026-08-19T09:00:00Z",
              in_reply_to: "msg_1",
              text: createBody.text,
              client_id: createBody.client_id,
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/drafts")) {
          return new Response(JSON.stringify({ count: 0, drafts: [] }), {
            status: 200,
          });
        }
        return new Response("not found", { status: 404 });
      },
    });

    const draft = await client.createDraft("inbox_1", {
      in_reply_to: "msg_1",
      text: "Hello there",
      client_id: "bsh-concept-abc",
    });
    assert.equal(draft.draftId, "draft_1");
    assert.equal(createBody?.in_reply_to, "msg_1");
  });

  it("sends a draft via POST /send", async () => {
    const client = new AgentMailClient({
      apiKey: "am_test_key",
      fetchImpl: async (input, init) => {
        const url = String(input);
        assert.match(
          url,
          /\/inboxes\/inbox_1\/drafts\/draft_1\/send$/,
        );
        assert.equal(init?.method, "POST");
        return new Response(
          JSON.stringify({
            inbox_id: "inbox_1",
            thread_id: "thread_1",
            message_id: "msg_sent_1",
            subject: "Re: Hello",
            from: "me@agentmail.to",
            timestamp: "2026-08-19T10:00:00Z",
            text: "Reply body",
          }),
          { status: 200 },
        );
      },
    });

    const sent = await client.sendDraft("inbox_1", "draft_1");
    assert.equal(sent.messageId, "msg_sent_1");
    assert.equal(sent.subject, "Re: Hello");
  });

  it("deletes a draft via DELETE", async () => {
    let deleteMethod: string | undefined;
    const client = new AgentMailClient({
      apiKey: "am_test_key",
      fetchImpl: async (input, init) => {
        const url = String(input);
        assert.match(url, /\/inboxes\/inbox_1\/drafts\/draft_1$/);
        deleteMethod = init?.method;
        return new Response("", { status: 200 });
      },
    });

    await client.deleteDraft("inbox_1", "draft_1");
    assert.equal(deleteMethod, "DELETE");
  });
});
