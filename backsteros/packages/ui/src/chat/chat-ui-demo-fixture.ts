/**
 * Sample thread for the `/dev/chat-ui` preview — a longer user ↔ agent
 * conversation that exercises text, tool-call states, task cards, diffs,
 * and a trailing streaming reply.
 */
import type { ChatUiMessage } from "@backsteros/contracts";

const DEMO_TASK_CARD = {
  taskId: "00000000-0000-4000-8000-000000000001",
  displayId: "BSH-demo",
  title: "Unified chat UI foundation",
  href: "/tasks",
  status: "in_progress",
  priority: 2,
  description:
    "Shared ChatUiMessage contract, assistant-ui thread shell, and reusable task / tool cards.",
  dueDate: "2026-11-07T17:00:00.000Z",
  projectName: "BacksterOS",
  projectIcon: "repo",
  assigneeName: "Remon",
  related: ["Ada", "BacksterOS"],
  labels: ["chat-ui", "foundation"],
} as const;

/** Demo messages used by the Chat UI foundation preview page. */
export function buildChatUiDemoMessages(): ChatUiMessage[] {
  return [
    {
      id: "sys-1",
      role: "system",
      status: "done",
      createdAt: "2026-10-30T08:00:00.000Z",
      parts: [
        {
          type: "status-line",
          text: "Session started · Cursor agent",
        },
      ],
    },
    {
      id: "user-1",
      role: "user",
      author: { name: "You" },
      status: "done",
      createdAt: "2026-10-30T08:01:00.000Z",
      parts: [
        {
          type: "text",
          text: "Can you look up the chat UI foundation task and tell me where we are?",
        },
      ],
    },
    {
      id: "agent-1",
      role: "assistant",
      author: { name: "Cursor agent" },
      status: "done",
      createdAt: "2026-10-30T08:01:12.000Z",
      parts: [
        {
          type: "text",
          text: "Searching the task catalog…",
        },
        {
          type: "tool-call",
          id: "tc-search",
          name: "search_tasks",
          input: { query: "chat ui foundation" },
          output: {
            matches: [{ displayId: "BSH-demo", title: "Unified chat UI foundation" }],
          },
          status: "done",
        },
        {
          type: "tool-call",
          id: "tc-get",
          name: "get_task",
          input: { displayId: "BSH-demo" },
          output: {
            title: "Unified chat UI foundation",
            status: "in_progress",
          },
          status: "done",
        },
        {
          type: "card",
          cardType: "task",
          id: "card-task-1",
          data: { ...DEMO_TASK_CARD },
        },
        {
          type: "text",
          markdown: true,
          text: "[@task:BSH-demo] is **in progress**. Scope so far:\n\n1. Shared `ChatUiMessage` contract\n2. `ChatThread` on assistant-ui\n3. Task card + tool-call chrome",
        },
      ],
    },
    {
      id: "user-2",
      role: "user",
      author: { name: "You" },
      status: "done",
      createdAt: "2026-10-30T08:02:05.000Z",
      parts: [
        {
          type: "text",
          text: "Nice. Can you also wire click-to-expand on the task card using the mention peek?",
        },
      ],
    },
    {
      id: "agent-2",
      role: "assistant",
      author: { name: "Cursor agent" },
      status: "done",
      createdAt: "2026-10-30T08:02:40.000Z",
      parts: [
        {
          type: "text",
          text: "On it — checking how document mentions open the hover card, then reusing that shell for chat.",
        },
        {
          type: "tool-call",
          id: "tc-read-shell",
          name: "read_file",
          input: {
            path: "backsteros/packages/ui/src/components/mentions/mention-chip-hover-shell.tsx",
          },
          output: { lines: 53 },
          status: "done",
        },
        {
          type: "tool-call",
          id: "tc-read-registry",
          name: "read_file",
          input: {
            path: "backsteros/packages/ui/src/components/chat/chat-card-registry.tsx",
          },
          status: "running",
        },
      ],
    },
    {
      id: "user-3",
      role: "user",
      author: { name: "You" },
      status: "done",
      createdAt: "2026-10-30T08:03:10.000Z",
      parts: [
        {
          type: "text",
          text: "While you're in there — also swap the tool error icon for the circle-X glyph.",
        },
      ],
    },
    {
      id: "agent-3",
      role: "assistant",
      author: { name: "Cursor agent" },
      status: "done",
      createdAt: "2026-10-30T08:03:55.000Z",
      parts: [
        {
          type: "text",
          text: "Done on both. Card click pins the mention peek; primary click no longer navigates (⌘-click still does). Error status now uses the filled circle-X.",
        },
        {
          type: "tool-call",
          id: "tc-write-icon",
          name: "apply_patch",
          input: {
            path: "backsteros/packages/ui/src/components/icons/alert-triangle-icon.tsx",
          },
          output: { ok: true },
          status: "done",
        },
        {
          type: "diff",
          filename: "alert-triangle-icon.tsx",
          content:
            "@@ -16,12 +16,18 @@\n-  viewBox=\"0 0 24 24\"\n+  viewBox=\"0 0 14 14\"\n-  <path d=\"M8.583 4.507…\" />\n+  <path fillRule=\"evenodd\" d=\"M7 14C10.866…\" fill=\"currentColor\" />",
        },
        {
          type: "tool-call",
          id: "tc-pdf-miss",
          name: "fetch_pdf",
          input: { path: "docs/missing.pdf" },
          output: { error: "ENOENT: file not found" },
          status: "error",
        },
        {
          type: "text",
          text: "(Ignored the missing PDF — that was only to show the error chrome.)",
        },
      ],
    },
    {
      id: "user-4",
      role: "user",
      author: { name: "You" },
      status: "done",
      createdAt: "2026-10-30T08:04:40.000Z",
      parts: [
        {
          type: "text",
          text: "Can you flesh out the demo thread so it reads like a real back-and-forth?",
        },
      ],
    },
    {
      id: "agent-4",
      role: "assistant",
      author: { name: "Cursor agent" },
      status: "done",
      createdAt: "2026-10-30T08:05:15.000Z",
      parts: [
        {
          type: "text",
          markdown: true,
          text: "Expanding `chat-ui-demo-fixture.ts` into several turns — user asks, agent tools + replies, then follow-ups.",
        },
        {
          type: "tool-call",
          id: "tc-queue",
          name: "queue_write",
          input: { file: "chat-ui-demo-fixture.ts" },
          status: "pending",
        },
        {
          type: "diff",
          filename: "chat-ui.ts",
          content:
            "@@ -154,6 +154,8 @@\n   title: z.string().optional(),\n   href: z.string().optional(),\n   status: z.string().optional(),\n+  /** Short body preview for the mention hover / click peek. */\n+  description: z.string().nullable().optional(),\n   priority: z.number().int().min(0).max(4).optional(),",
        },
        {
          type: "text",
          markdown: true,
          text: "Updated [@task:BSH-demo] with the expand/peek description.",
        },
        {
          type: "card",
          cardType: "task",
          id: "card-task-2",
          data: {
            ...DEMO_TASK_CARD,
            title: "Unified chat UI foundation",
            description:
              "Demo thread now covers multi-turn chat, tool states, task peeks, and diffs.",
          },
        },
      ],
    },
    {
      id: "user-5",
      role: "user",
      author: { name: "You" },
      status: "done",
      createdAt: "2026-10-30T08:05:50.000Z",
      parts: [
        {
          type: "text",
          text: "Can agents also embed contact and document cards the same way?",
        },
      ],
    },
    {
      id: "agent-5",
      role: "assistant",
      author: { name: "Cursor agent" },
      status: "done",
      createdAt: "2026-10-30T08:06:20.000Z",
      parts: [
        {
          type: "text",
          text: "Yes — same expandable chrome for every mention kind. A few examples:",
        },
        {
          type: "tool-call",
          id: "tc-lookup-entities",
          name: "search_entities",
          input: { kinds: ["contact", "document", "project"] },
          output: { count: 3 },
          status: "done",
        },
        {
          type: "card",
          cardType: "contact",
          id: "card-contact-1",
          data: {
            contactId: "00000000-0000-4000-8000-0000000000c1",
            displayId: "C-12",
            name: "Ada Lovelace",
            firstName: "Ada",
            lastName: "Lovelace",
            title: "Analytical Engine lead",
            organizationName: "BacksterOS",
            email: "ada@example.com",
            phone: "+31 6 1234 5678",
            city: "Amsterdam",
            country: "Netherlands",
            href: "/contacts",
          },
        },
        {
          type: "card",
          cardType: "document",
          id: "card-doc-1",
          data: {
            documentId: "00000000-0000-4000-8000-0000000000d1",
            title: "Chat UI brief",
            projectKey: "BSH",
            projectName: "BacksterOS",
            relativePath: "docs/chat-ui-brief.md",
            updatedAt: "2026-10-29T16:00:00.000Z",
            href: "/documents",
          },
        },
        {
          type: "card",
          cardType: "project",
          id: "card-project-1",
          data: {
            projectId: "00000000-0000-4000-8000-0000000000p1",
            key: "BSH",
            name: "BacksterOS",
            summary: "Personal / company ops system — local core, desktop, mobile.",
            status: "active",
            area: "business",
            href: "/projects",
          },
        },
        {
          type: "card",
          cardType: "email",
          id: "card-email-1",
          data: {
            emailId: "00000000-0000-4000-8000-0000000000e1",
            displayId: "E-42",
            title: "Re: Chat UI foundation review",
            status: "in_progress",
            priority: 1,
            receivedAt: "2026-10-28T14:22:00.000Z",
            from: "Ada Lovelace <ada@example.com>",
            contactName: "Ada Lovelace",
            projectName: "BacksterOS",
            snippet:
              "Looks sharp — can we also show contact and document embeds in the agent thread?",
            href: "/email",
          },
        },
        {
          type: "card",
          cardType: "meeting",
          id: "card-meeting-1",
          data: {
            meetingId: "00000000-0000-4000-8000-0000000000m1",
            displayId: "M-14",
            title: "Chat UI design sync",
            startAt: "2026-10-31T10:00:00.000Z",
            endAt: "2026-10-31T10:45:00.000Z",
            status: "scheduled",
            summary: "Walk through mention kinds and expandable cards.",
            projectName: "BacksterOS",
            href: "/calendar/meetings",
          },
        },
        {
          type: "card",
          cardType: "journal",
          id: "card-journal-1",
          data: {
            date: "2026-10-30",
            title: "Daily notes",
            snippet: "Shipped expandable entity cards for chat + documents.",
            href: "/journal/2026-10-30",
          },
        },
        {
          type: "card",
          cardType: "habit",
          id: "card-habit-1",
          data: {
            habitId: "00000000-0000-4000-8000-0000000000h1",
            title: "Write daily notes",
            cadence: "daily",
            date: "2026-10-30",
            completed: true,
            href: "/journal/habits",
          },
        },
        {
          type: "card",
          cardType: "message",
          id: "card-message-whatsapp",
          data: {
            conversationId: "00000000-0000-4000-8000-0000000000ch1",
            channelType: "whatsapp",
            title: "Ada · WhatsApp",
            contactName: "Ada Lovelace",
            preview: "Can you send the task card preview?",
            status: "open",
            href: "/communication",
          },
        },
        {
          type: "card",
          cardType: "message",
          id: "card-message-instagram",
          data: {
            conversationId: "00000000-0000-4000-8000-0000000000ch2",
            channelType: "Channel::Instagram",
            title: "Grace · Instagram",
            contactName: "Grace Hopper",
            preview: "Love the new story frames — when do they ship?",
            status: "open",
            href: "/communication",
          },
        },
        {
          type: "card",
          cardType: "message",
          id: "card-message-messenger",
          data: {
            conversationId: "00000000-0000-4000-8000-0000000000ch3",
            channelType: "Channel::FacebookPage",
            title: "Katherine · Messenger",
            contactName: "Katherine Johnson",
            preview: "Following up on yesterday’s design notes.",
            status: "open",
            href: "/communication",
          },
        },
        {
          type: "card",
          cardType: "message",
          id: "card-message-telegram",
          data: {
            conversationId: "00000000-0000-4000-8000-0000000000ch4",
            channelType: "Channel::Telegram",
            title: "Alan · Telegram",
            contactName: "Alan Turing",
            preview: "Encrypted channel test — all clear.",
            status: "open",
            href: "/communication",
          },
        },
        {
          type: "card",
          cardType: "message",
          id: "card-message-x",
          data: {
            conversationId: "00000000-0000-4000-8000-0000000000ch5",
            channelType: "Channel::TwitterProfile",
            title: "@backsteros · X",
            contactName: "Remon de Vries (@remondevries)",
            preview: "DM about the public chat UI preview.",
            status: "open",
            href: "/communication",
          },
        },
        {
          type: "card",
          cardType: "message",
          id: "card-message-support",
          data: {
            conversationId: "00000000-0000-4000-8000-0000000000ch6",
            channelType: "support",
            title: "Ticket #1842 · Support",
            contactName: "Acme Corp",
            preview: "Customer can’t expand the meeting mention chip.",
            status: "open",
            href: "/communication",
          },
        },
        {
          type: "card",
          cardType: "post",
          id: "card-post-1",
          data: {
            postId: "00000000-0000-4000-8000-0000000000sp1",
            platform: "linkedin",
            title: "Shipping the unified chat UI",
            body: "Expandable task, contact, and meeting cards in agent threads.",
            authorHandle: "@backsteros",
            status: "scheduled",
            href: "/social/post",
          },
        },
        {
          type: "card",
          cardType: "transaction",
          id: "card-tx-1",
          data: {
            transactionId: "00000000-0000-4000-8000-0000000000tx1",
            title: "Cursor Pro",
            amountCents: -2000,
            currency: "EUR",
            bookedOn: "2026-10-28",
            accountName: "Business checking",
            categoryName: "Software",
            notes: "Monthly seat",
            href: "/finance/transactions",
          },
        },
        {
          type: "card",
          cardType: "invoice",
          id: "card-invoice-1",
          data: {
            invoiceId: "00000000-0000-4000-8000-0000000000inv1",
            title: "Website redesign",
            invoiceNumber: "2026-042",
            state: "open",
            invoiceDate: "2026-10-15",
            amountLabel: "2.400,00 EUR",
            contactName: "Acme Corp",
            href: "/finance/invoices",
          },
        },
        {
          type: "card",
          cardType: "estimate",
          id: "card-estimate-1",
          data: {
            estimateId: "00000000-0000-4000-8000-0000000000es1",
            title: "Brand system proposal",
            displayId: "ES-12",
            status: "sent",
            documentDate: "oktober 2026",
            clientLabel: "Acme Corp",
            totalAmountCents: 480000,
            currency: "EUR",
            href: "/finance/estimates",
          },
        },
      ],
    },
    {
      id: "user-6",
      role: "user",
      author: { name: "You" },
      status: "done",
      createdAt: "2026-10-30T08:06:55.000Z",
      parts: [
        {
          type: "text",
          text: "Looks good — anything still streaming?",
        },
      ],
    },
    {
      id: "agent-form",
      role: "assistant",
      author: { name: "Cursor agent" },
      status: "done",
      createdAt: "2026-10-30T08:06:58.000Z",
      parts: [
        {
          type: "text",
          text: "Quick form preview — fill this in when you’re ready.",
        },
        {
          type: "card",
          cardType: "form",
          id: "card-form-1",
          data: {
            messageId: "agent-form",
            title: "Invoice details",
            description: "Amount, due date, and currency for the draft.",
            submitLabel: "Send",
            fields: [
              {
                name: "amount",
                label: "Amount",
                type: "number",
                required: true,
                min: 0,
                placeholder: "1200",
              },
              {
                name: "due_date",
                label: "Due date",
                type: "date",
                required: true,
              },
              {
                name: "currency",
                label: "Currency",
                type: "select",
                required: true,
                options: [
                  { label: "EUR", value: "EUR" },
                  { label: "USD", value: "USD" },
                ],
              },
              {
                name: "notes",
                label: "Notes",
                type: "textarea",
                placeholder: "Optional notes",
              },
              {
                name: "rush",
                label: "Rush",
                type: "checkbox",
              },
            ],
            answer: null,
          },
        },
      ],
    },
    {
      id: "agent-6",
      role: "assistant",
      author: { name: "Cursor agent" },
      status: "streaming",
      createdAt: "2026-10-30T08:07:05.000Z",
      parts: [
        {
          type: "text",
          text: "Wrapping up the fixture rewrite and double-checking the preview renders the full thread…",
        },
        {
          type: "tool-call",
          id: "tc-typecheck",
          name: "typecheck",
          input: { filter: "@backsteros/ui" },
          status: "running",
        },
      ],
    },
  ];
}
