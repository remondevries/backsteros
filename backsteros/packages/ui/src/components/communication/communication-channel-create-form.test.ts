import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure submit gating mirrored from CommunicationChannelCreateForm.
 * Kept here so Meta window / template / Telegram / support rules stay covered
 * without a DOM harness.
 */
function canSubmitChannelCreate(input: {
  channel: "whatsapp" | "instagram" | "messenger" | "telegram" | "support";
  contactId: string | null;
  content: string;
  subject?: string;
  templateSelected: boolean;
  windowState: {
    open: boolean;
    requiresTemplate: boolean;
  } | null;
  submitting?: boolean;
  hasInbox?: boolean;
}): boolean {
  const {
    channel,
    contactId,
    content,
    subject = "",
    templateSelected,
    windowState,
    submitting = false,
    hasInbox = true,
  } = input;
  const requiresTemplate =
    channel === "whatsapp" &&
    contactId != null &&
    (windowState == null || windowState.requiresTemplate);
  const blocked =
    channel !== "whatsapp" &&
    contactId != null &&
    windowState != null &&
    !windowState.open;
  const needsSubject = channel === "support";
  return (
    Boolean(contactId) &&
    !submitting &&
    !blocked &&
    (!needsSubject || subject.trim().length > 0) &&
    (requiresTemplate ? templateSelected : content.trim().length > 0) &&
    (channel !== "whatsapp" || hasInbox)
  );
}

describe("channel create submit gating", () => {
  it("requires an approved WhatsApp template outside the messaging window", () => {
    assert.equal(
      canSubmitChannelCreate({
        channel: "whatsapp",
        contactId: "c1",
        content: "hello",
        templateSelected: false,
        windowState: { open: false, requiresTemplate: true },
      }),
      false,
    );
    assert.equal(
      canSubmitChannelCreate({
        channel: "whatsapp",
        contactId: "c1",
        content: "hello",
        templateSelected: true,
        windowState: { open: false, requiresTemplate: true },
      }),
      true,
    );
  });

  it("allows free-form WhatsApp inside the messaging window", () => {
    assert.equal(
      canSubmitChannelCreate({
        channel: "whatsapp",
        contactId: "c1",
        content: "hello",
        templateSelected: false,
        windowState: { open: true, requiresTemplate: false },
      }),
      true,
    );
  });

  it("blocks Instagram and Messenger when the messaging window is closed", () => {
    for (const channel of ["instagram", "messenger"] as const) {
      assert.equal(
        canSubmitChannelCreate({
          channel,
          contactId: "c1",
          content: "hello",
          templateSelected: false,
          windowState: { open: false, requiresTemplate: false },
        }),
        false,
      );
      assert.equal(
        canSubmitChannelCreate({
          channel,
          contactId: "c1",
          content: "hello",
          templateSelected: false,
          windowState: { open: true, requiresTemplate: false },
        }),
        true,
      );
    }
  });

  it("blocks Telegram without an existing bot chat", () => {
    assert.equal(
      canSubmitChannelCreate({
        channel: "telegram",
        contactId: "c1",
        content: "hello",
        templateSelected: false,
        windowState: { open: false, requiresTemplate: false },
      }),
      false,
    );
    assert.equal(
      canSubmitChannelCreate({
        channel: "telegram",
        contactId: "c1",
        content: "hello",
        templateSelected: false,
        windowState: { open: true, requiresTemplate: false },
      }),
      true,
    );
  });

  it("requires a subject for support tickets", () => {
    assert.equal(
      canSubmitChannelCreate({
        channel: "support",
        contactId: "c1",
        content: "Need help",
        subject: "",
        templateSelected: false,
        windowState: { open: true, requiresTemplate: false },
      }),
      false,
    );
    assert.equal(
      canSubmitChannelCreate({
        channel: "support",
        contactId: "c1",
        content: "Need help",
        subject: "Billing",
        templateSelected: false,
        windowState: { open: true, requiresTemplate: false },
      }),
      true,
    );
  });
});
