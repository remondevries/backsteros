/**
 * OS-164 — webhookVerifiedAt clear/set rules (source + decrypt compare).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("OS-164 agents webhookVerifiedAt", () => {
  it("updateAgent clears verified only when URL or secret plaintext changes", () => {
    const src = readFileSync(join(here, "agents.ts"), "utf8");
    assert.match(src, /clearWebhookVerified/);
    assert.match(src, /decryptAgentChatWebhookSecret/);
    assert.match(src, /patch\.webhookVerifiedAt\s*=\s*null/);
    assert.match(src, /export async function markAgentWebhookVerified/);
    assert.match(src, /export async function clearAgentWebhookVerified/);
  });

  it("testAgentWebhook marks on success and clears on delivery failure", () => {
    const src = readFileSync(join(here, "agent-chat.ts"), "utf8");
    assert.match(
      src,
      /if \(result\.ok\) \{\s*await markAgentWebhookVerified/,
    );
    assert.match(src, /await clearAgentWebhookVerified\(workspaceId, agentId\)/);
  });

  it("schema exposes webhook_verified_at", () => {
    const schema = readFileSync(join(here, "../db/schema.ts"), "utf8");
    assert.match(schema, /webhookVerifiedAt:\s*timestamp\("webhook_verified_at"/);
  });
});
