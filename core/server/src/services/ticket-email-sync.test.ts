import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeTicketStatus } from "@backsteros/contracts";

import { readModuleSource } from "../lib/read-module-source.js";

describe("OS-187 ticket email sync", () => {
  it("normalizes waiting_on_client to waiting", () => {
    assert.equal(normalizeTicketStatus("waiting_on_client"), "waiting");
    assert.equal(normalizeTicketStatus("waiting"), "waiting");
    assert.equal(normalizeTicketStatus("in_progress"), "in_progress");
  });

  it("never calls sendMail from sync helpers (source)", () => {
    const src = readModuleSource(
      join(dirname(fileURLToPath(import.meta.url)), "ticket-email-sync.ts"),
      "utf8",
    );
    assert.ok(src.includes("void input.deps?.sendMail"));
    assert.ok(src.includes('sentMail: false'));
    assert.ok(!src.includes("sendAgentMailDraft"));
    assert.ok(!src.includes("startEmailThread"));
    assert.ok(!src.includes("client.sendDraft"));
  });

  it("hooks inbound webhook and outbound send for timeline sync", () => {
    const webhook = readModuleSource(
      join(dirname(fileURLToPath(import.meta.url)), "../lib/agentmail-webhook.ts"),
      "utf8",
    );
    const send = readModuleSource(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "agentmail-settings/send-lifecycle.ts",
      ),
      "utf8",
    );
    assert.ok(webhook.includes("syncLinkedTicketsForEmailMessage"));
    assert.ok(webhook.includes('direction: "inbound"'));
    assert.ok(send.includes("syncLinkedTicketsForEmailMessage"));
    assert.ok(send.includes('direction: "outbound"'));
  });

  it("tickets routes register under /api/v1/tickets and document no-send", () => {
    const routes = readModuleSource(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../app/task-document-routes/tickets-routes.ts",
      ),
      "utf8",
    );
    const register = readModuleSource(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../app/task-document-routes.ts",
      ),
      "utf8",
    );
    assert.ok(routes.includes('"/api/v1/tickets"'));
    assert.ok(routes.includes('"/api/v1/tickets/from-email"'));
    assert.ok(routes.includes("sync-emails"));
    assert.ok(routes.includes("sentMail: false"));
    assert.ok(register.includes("registerTicketsRoutes"));
  });
});
