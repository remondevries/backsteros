import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideEmailCommand } from "./email-command-intent.js";

describe("decideEmailCommand", () => {
  it("executes explicit task / calendar / note without keyword matching", () => {
    assert.deepEqual(
      decideEmailCommand({ prompt: "whatever", explicitIntent: "task" }),
      { kind: "execute", intent: "task" },
    );
    assert.deepEqual(
      decideEmailCommand({ prompt: "whatever", explicitIntent: "calendar" }),
      { kind: "execute", intent: "calendar" },
    );
    assert.deepEqual(
      decideEmailCommand({
        prompt: "Remember to call Jan",
        explicitIntent: "note",
      }),
      {
        kind: "execute",
        intent: "note",
        noteMessage: "Remember to call Jan",
      },
    );
  });

  it("classifies English and Dutch mailbox commands", () => {
    for (const prompt of [
      "mark as spam",
      "Report spam",
      "markeer als spam",
      "blokkeer de afzender",
    ]) {
      assert.deepEqual(decideEmailCommand({ prompt }), {
        kind: "execute",
        intent: "spam",
      });
    }
    for (const prompt of [
      "archive this",
      "Archive",
      "archiveer dit",
      "please archive",
    ]) {
      assert.deepEqual(decideEmailCommand({ prompt }), {
        kind: "execute",
        intent: "archive",
      });
    }
    for (const prompt of ["delete this", "trash", "verwijder dit", "gooi weg"]) {
      assert.deepEqual(decideEmailCommand({ prompt }), {
        kind: "execute",
        intent: "trash",
      });
    }
    assert.deepEqual(decideEmailCommand({ prompt: "mark as read" }), {
      kind: "execute",
      intent: "mark_read",
    });
    assert.deepEqual(decideEmailCommand({ prompt: "markeer als ongelezen" }), {
      kind: "execute",
      intent: "mark_unread",
    });
  });

  it("classifies task / meeting / note keyword commands", () => {
    for (const prompt of [
      "make a task of this",
      "create a task",
      "maak hier een taak van",
      "taak van dit",
    ]) {
      assert.deepEqual(decideEmailCommand({ prompt }), {
        kind: "execute",
        intent: "task",
      });
    }
    for (const prompt of [
      "make a meeting of this",
      "schedule a meeting",
      "maak een afspraak",
      "plan een meeting",
    ]) {
      assert.deepEqual(decideEmailCommand({ prompt }), {
        kind: "execute",
        intent: "calendar",
      });
    }
    assert.deepEqual(
      decideEmailCommand({ prompt: "add a note: call back tomorrow" }),
      {
        kind: "execute",
        intent: "note",
        noteMessage: "call back tomorrow",
      },
    );
    assert.deepEqual(
      decideEmailCommand({ prompt: "notitie: bel Jan terug" }),
      {
        kind: "execute",
        intent: "note",
        noteMessage: "bel Jan terug",
      },
    );
  });

  it("lets fixed mailbox keywords override reply_draft UI intent", () => {
    assert.deepEqual(
      decideEmailCommand({
        prompt: "mark as spam",
        explicitIntent: "reply_draft",
      }),
      { kind: "execute", intent: "spam" },
    );
    assert.deepEqual(
      decideEmailCommand({
        prompt: "make a task of this",
        explicitIntent: "reply_draft",
      }),
      { kind: "execute", intent: "task" },
    );
  });

  it("falls back to Judith for prose and ambiguous prompts", () => {
    assert.deepEqual(
      decideEmailCommand({
        prompt: "Rewrite this more politely and thank them",
        explicitIntent: "reply_draft",
      }),
      { kind: "wake", intent: "reply_draft" },
    );
    assert.deepEqual(
      decideEmailCommand({
        prompt: "What do you think we should do with this?",
      }),
      { kind: "wake", intent: null },
    );
    assert.deepEqual(decideEmailCommand({ prompt: "add a note" }), {
      kind: "wake",
      intent: null,
    });
    assert.deepEqual(
      decideEmailCommand({
        prompt: "Please delete the second paragraph and soften the tone",
        explicitIntent: "reply_draft",
      }),
      { kind: "wake", intent: "reply_draft" },
    );
  });
});
