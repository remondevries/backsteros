import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AgentMailClient,
  agentMailMessageNeedsFullHydration,
  formatAgentMailAddress,
  formatAgentMailApiError,
  hydrateAgentMailThreadMessages,
  mapAgentMailAuthMe,
  mapAgentMailInbox,
  mapAgentMailMessageDetail,
  mapAgentMailMessageSummary,
  mergeAgentMailMessageDetail,
  parseEmailSourceHeaders,
} from "./agentmail-client.js";

describe("parseEmailSourceHeaders", () => {
  it("parses and unfolds the header block, stopping at the body", () => {
    const raw = [
      "X-Readdle-Message-ID: 0f1eabb8-58aa-47be-91ac@Spark",
      "Authentication-Results: amazonses.com;",
      "\tspf=pass client-ip=209.85.218.47;",
      " dkim=pass header.i=@lemo-design.com;",
      "Subject: Factuur 8959599",
      "",
      "Body-Looks-Like-Header: should not be parsed",
      "Hello body",
    ].join("\r\n");
    const headers = parseEmailSourceHeaders(raw);
    assert.deepEqual(headers, [
      {
        name: "X-Readdle-Message-ID",
        value: "0f1eabb8-58aa-47be-91ac@Spark",
      },
      {
        name: "Authentication-Results",
        value:
          "amazonses.com; spf=pass client-ip=209.85.218.47; dkim=pass header.i=@lemo-design.com;",
      },
      { name: "Subject", value: "Factuur 8959599" },
    ]);
  });

  it("ignores malformed lines without a colon", () => {
    const headers = parseEmailSourceHeaders("Garbage line\nX-One: 1\n\nbody");
    assert.deepEqual(headers, [{ name: "X-One", value: "1" }]);
  });
});

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

  it("maps message attachments", () => {
    const mapped = mapAgentMailMessageDetail({
      inbox_id: "inbox_1",
      thread_id: "thread_1",
      message_id: "msg_1",
      subject: "Invoice",
      from: "ada@example.com",
      timestamp: "2026-08-19T10:00:00Z",
      html: '<img src="cid:avatar">',
      attachments: [
        {
          attachment_id: "att_1",
          size: 128,
          content_type: "image/png",
          content_id: "avatar",
        },
      ],
    });
    assert.equal(mapped.attachments.length, 1);
    assert.equal(mapped.attachments[0]?.attachmentId, "att_1");
    assert.equal(mapped.attachments[0]?.contentId, "avatar");
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
        // AgentMail send returns only message_id + thread_id.
        return new Response(
          JSON.stringify({
            thread_id: "thread_1",
            message_id: "msg_sent_1",
          }),
          { status: 200 },
        );
      },
    });

    const sent = await client.sendDraft("inbox_1", "draft_1");
    assert.equal(sent.messageId, "msg_sent_1");
    assert.equal(sent.threadId, "thread_1");
    assert.equal(sent.inboxId, "inbox_1");
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

  it("downloads message attachments via presigned url", async () => {
    const calls: string[] = [];
    const client = new AgentMailClient({
      apiKey: "am_test_key",
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/attachments/att_1")) {
          return new Response(
            JSON.stringify({
              attachment_id: "att_1",
              download_url: "https://cdn.example/att_1",
              content_type: "image/png",
              filename: "avatar.png",
            }),
            { status: 200 },
          );
        }
        if (url === "https://cdn.example/att_1") {
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        }
        return new Response("not found", { status: 404 });
      },
    });

    const attachment = await client.getMessageAttachment(
      "inbox_1",
      "msg_1",
      "att_1",
    );
    assert.equal(attachment.contentType, "image/png");
    assert.equal(attachment.filename, "avatar.png");
    assert.deepEqual([...attachment.bytes], [1, 2, 3]);
    assert.match(calls[0] ?? "", /\/attachments\/att_1$/);
    assert.equal(calls[1], "https://cdn.example/att_1");
  });
});

describe("agentmail thread hydration", () => {
  const summary = mapAgentMailMessageDetail({
    inbox_id: "inbox_1",
    thread_id: "thread_1",
    message_id: "msg_1",
    subject: "Invoice",
    from: "ada@example.com",
    timestamp: "2026-08-19T10:00:00Z",
    extracted_text: "Please pay",
  });

  const full = mapAgentMailMessageDetail({
    inbox_id: "inbox_1",
    thread_id: "thread_1",
    message_id: "msg_1",
    subject: "Invoice",
    from: "ada@example.com",
    timestamp: "2026-08-19T10:00:00Z",
    extracted_text: "Please pay",
    html: "<p>Please pay</p>",
    extracted_html: "<p>Please pay</p>",
  });

  it("mergeAgentMailMessageDetail keeps missing html from overlay", () => {
    const merged = mergeAgentMailMessageDetail(summary, full);
    assert.equal(merged.html, "<p>Please pay</p>");
    assert.equal(merged.extractedText, "Please pay");
  });

  it("agentMailMessageNeedsFullHydration when html is missing", () => {
    assert.equal(agentMailMessageNeedsFullHydration(summary), true);
    assert.equal(agentMailMessageNeedsFullHydration(full), false);
  });

  it("agentMailMessageNeedsFullHydration when cid images lack attachments", () => {
    const withCid = mapAgentMailMessageDetail({
      inbox_id: "inbox_1",
      thread_id: "thread_1",
      message_id: "msg_2",
      subject: "Invoice",
      from: "ada@example.com",
      timestamp: "2026-08-19T10:00:00Z",
      extracted_text: "Please pay",
      html: '<img src="cid:avatar">',
      extracted_html: '<img src="cid:avatar">',
    });
    assert.equal(agentMailMessageNeedsFullHydration(withCid), true);

    const withInline = mapAgentMailMessageDetail({
      inbox_id: "inbox_1",
      thread_id: "thread_1",
      message_id: "msg_2",
      subject: "Invoice",
      from: "ada@example.com",
      timestamp: "2026-08-19T10:00:00Z",
      extracted_text: "Please pay",
      html: '<img src="cid:avatar">',
      extracted_html: '<img src="cid:avatar">',
      attachments: [
        {
          attachment_id: "att_1",
          size: 1,
          content_id: "avatar",
        },
      ],
    });
    assert.equal(agentMailMessageNeedsFullHydration(withInline), false);
  });

  it("hydrateAgentMailThreadMessages fetches full rows when needed", async () => {
    const client = new AgentMailClient({
      apiKey: "am_test_key",
      fetchImpl: async (input) => {
        const url = String(input);
        assert.match(url, /\/messages\/msg_1$/);
        return new Response(
          JSON.stringify({
            inbox_id: "inbox_1",
            thread_id: "thread_1",
            message_id: "msg_1",
            subject: "Invoice",
            from: "ada@example.com",
            timestamp: "2026-08-19T10:00:00Z",
            extracted_text: "Please pay",
            html: "<p>Please pay</p>",
            extracted_html: "<p>Please pay</p>",
          }),
          { status: 200 },
        );
      },
    });

    const hydrated = await hydrateAgentMailThreadMessages(
      client,
      "inbox_1",
      full,
      [summary],
    );
    assert.equal(hydrated[0]?.html, "<p>Please pay</p>");
  });
});
