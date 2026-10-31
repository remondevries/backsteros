import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  answerChatThreadMessageFormInputSchema,
  answerChatThreadMessageInputSchema,
  chatThreadMessageFormSchema,
  chatThreadMessageSchema,
  createChatThreadMessageInputSchema,
  formatChatThreadFormAnswerBody,
  validateChatThreadFormAnswer,
} from "./agents-chat.js";

const sampleForm = {
  title: "Invoice details",
  description: "Fill these in so I can draft the invoice.",
  submitLabel: "Send",
  fields: [
    {
      name: "amount",
      label: "Amount",
      type: "number" as const,
      required: true,
      min: 0,
    },
    {
      name: "due_date",
      label: "Due date",
      type: "date" as const,
      required: true,
    },
    {
      name: "currency",
      label: "Currency",
      type: "select" as const,
      required: true,
      options: [
        { label: "EUR", value: "EUR" },
        { label: "USD", value: "USD" },
      ],
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea" as const,
    },
    {
      name: "rush",
      label: "Rush",
      type: "checkbox" as const,
    },
  ],
};

describe("chatThreadMessageFormSchema", () => {
  it("accepts a full form and defaults required to false", () => {
    const parsed = chatThreadMessageFormSchema.parse(sampleForm);
    assert.equal(parsed.title, "Invoice details");
    assert.equal(parsed.fields.length, 5);
    assert.equal(parsed.fields[3]?.required, false);
  });

  it("rejects duplicate field names and invalid name keys", () => {
    assert.throws(() =>
      chatThreadMessageFormSchema.parse({
        title: "Dup",
        fields: [
          { name: "a", label: "A", type: "text" },
          { name: "a", label: "B", type: "text" },
        ],
      }),
    );
    assert.throws(() =>
      chatThreadMessageFormSchema.parse({
        title: "Bad",
        fields: [{ name: "Bad-Name", label: "X", type: "text" }],
      }),
    );
  });

  it("requires options on select and rejects options on other types", () => {
    assert.throws(() =>
      chatThreadMessageFormSchema.parse({
        title: "Select",
        fields: [{ name: "c", label: "C", type: "select" }],
      }),
    );
    assert.throws(() =>
      chatThreadMessageFormSchema.parse({
        title: "Text",
        fields: [
          {
            name: "t",
            label: "T",
            type: "text",
            options: [
              { label: "A", value: "a" },
              { label: "B", value: "b" },
            ],
          },
        ],
      }),
    );
  });

  it("rejects oversized title / description / too many fields", () => {
    assert.throws(() =>
      chatThreadMessageFormSchema.parse({
        title: "x".repeat(121),
        fields: [{ name: "a", label: "A", type: "text" }],
      }),
    );
    assert.throws(() =>
      chatThreadMessageFormSchema.parse({
        title: "ok",
        description: "x".repeat(501),
        fields: [{ name: "a", label: "A", type: "text" }],
      }),
    );
    assert.throws(() =>
      chatThreadMessageFormSchema.parse({
        title: "ok",
        fields: Array.from({ length: 9 }, (_, i) => ({
          name: `f${i}`,
          label: `L${i}`,
          type: "text" as const,
        })),
      }),
    );
  });
});

describe("validateChatThreadFormAnswer", () => {
  const form = chatThreadMessageFormSchema.parse(sampleForm);

  it("accepts valid values and coerces numbers", () => {
    const result = validateChatThreadFormAnswer(form, {
      amount: "1200",
      due_date: "2026-11-15",
      currency: "EUR",
      notes: "Net 14",
      rush: false,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.values.amount, 1200);
      assert.equal(result.values.currency, "EUR");
      assert.equal(result.values.rush, false);
    }
  });

  it("rejects unknown fields, missing required, bad select, and bounds", () => {
    assert.equal(
      validateChatThreadFormAnswer(form, {
        amount: 10,
        due_date: "2026-11-15",
        currency: "EUR",
        extra: "nope",
      }).ok,
      false,
    );
    assert.equal(
      validateChatThreadFormAnswer(form, {
        due_date: "2026-11-15",
        currency: "EUR",
      }).ok,
      false,
    );
    assert.equal(
      validateChatThreadFormAnswer(form, {
        amount: 10,
        due_date: "2026-11-15",
        currency: "GBP",
      }).ok,
      false,
    );
    assert.equal(
      validateChatThreadFormAnswer(form, {
        amount: -1,
        due_date: "2026-11-15",
        currency: "EUR",
      }).ok,
      false,
    );
  });
});

describe("formatChatThreadFormAnswerBody", () => {
  it("builds a Submitted summary with Yes/No for checkboxes", () => {
    const form = chatThreadMessageFormSchema.parse(sampleForm);
    const body = formatChatThreadFormAnswerBody(form, {
      amount: 1200,
      due_date: "2026-11-15",
      currency: "EUR",
      notes: "Net 14",
      rush: true,
    });
    assert.equal(
      body,
      [
        "Submitted: Invoice details",
        "Amount: 1200",
        "Due date: 2026-11-15",
        "Currency: EUR",
        "Notes: Net 14",
        "Rush: Yes",
      ].join("\n"),
    );
  });
});

describe("createChatThreadMessageInputSchema with form", () => {
  it("accepts body + form", () => {
    const parsed = createChatThreadMessageInputSchema.parse({
      body: "A few details please.",
      form: sampleForm,
    });
    assert.equal(parsed.form?.title, "Invoice details");
  });
});

describe("chatThreadMessageSchema formAnswer", () => {
  it("allows null formAnswer when form present", () => {
    const parsed = chatThreadMessageSchema.parse({
      id: "m1",
      threadId: "t1",
      role: "assistant",
      authorContactId: null,
      authorName: "Sander",
      body: "Details?",
      status: "done",
      createdAt: "2026-10-31T08:00:00.000Z",
      updatedAt: "2026-10-31T08:00:00.000Z",
      form: chatThreadMessageFormSchema.parse({
        title: "Quick",
        fields: [{ name: "name", label: "Name", type: "text", required: true }],
      }),
      formAnswer: null,
    });
    assert.equal(parsed.formAnswer, null);
  });
});

describe("answerChatThreadMessageFormInputSchema", () => {
  it("accepts a values object", () => {
    const parsed = answerChatThreadMessageFormInputSchema.parse({
      values: { amount: 10, rush: false },
    });
    assert.equal(parsed.values.amount, 10);
  });

  it("rejects empty values", () => {
    assert.throws(() =>
      answerChatThreadMessageFormInputSchema.parse({ values: {} }),
    );
  });
});

describe("answerChatThreadMessageInputSchema form branch", () => {
  it("accepts form values object (not array)", () => {
    const parsed = answerChatThreadMessageInputSchema.parse({
      values: { amount: 1200 },
    });
    assert.ok("values" in parsed);
    assert.ok(!Array.isArray(parsed.values));
    assert.equal(
      (parsed.values as Record<string, unknown>).amount,
      1200,
    );
  });
});
