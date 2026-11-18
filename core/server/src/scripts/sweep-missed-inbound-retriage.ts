/**
 * OS-188: one-time sweep after deploy — list Waiting/Done threads whose latest
 * inbound (non-sent) message is newer than the latest outbound/`sent` message.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/sweep-missed-inbound-retriage.ts
 *     → dry-run (default): prints thread id / display id / subject / status only.
 *   ... --apply
 *     → retriages matching threads to Triage (writes).
 *
 * No writes unless --apply. Safe to run read-only against cloud after migration.
 */
import { and, eq, inArray } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { emailThreads, workspaceIntegrationSecrets } from "../db/schema.js";
import { AgentMailClient } from "../lib/agentmail-client.js";
import { isAgentMailOutboundMessage } from "../lib/email-status-labels.js";
import * as emailThreadsService from "../services/email-threads.js";
import { formatEmailDisplayId } from "../services/email-threads.js";

export type SweepMissedInboundArgs = {
  apply: boolean;
  workspaceId: string | null;
};

export type SweepMissedInboundHit = {
  id: string;
  displayId: string;
  inboxId: string;
  threadKey: string;
  status: string;
  subject: string;
  inboundMessageId: string;
  inboundAt: string;
  lastOutboundAt: string | null;
};

export type SweepThreadMessage = {
  messageId: string;
  timestamp: string;
  labels: string[];
};

export function parseSweepMissedInboundArgs(
  argv: readonly string[],
): SweepMissedInboundArgs {
  let apply = false;
  let workspaceId: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--apply") apply = true;
    else if (arg === "--workspace") {
      const id = argv[++i];
      if (!id?.trim()) throw new Error("--workspace requires an id");
      workspaceId = id.trim();
    } else if (arg === "--") continue;
    else {
      throw new Error(
        `unknown argument: ${arg} (supported: --apply, --workspace <id>)`,
      );
    }
  }
  return { apply, workspaceId };
}

export function latestOutboundAt(
  messages: ReadonlyArray<Pick<SweepThreadMessage, "labels" | "timestamp">>,
): number | null {
  let max = 0;
  for (const message of messages) {
    if (!isAgentMailOutboundMessage(message.labels)) continue;
    const at = Date.parse(message.timestamp) || 0;
    if (at > max) max = at;
  }
  return max > 0 ? max : null;
}

export function latestInbound(
  messages: ReadonlyArray<SweepThreadMessage>,
): { messageId: string; at: number } | null {
  let best: { messageId: string; at: number } | null = null;
  for (const message of messages) {
    if (isAgentMailOutboundMessage(message.labels)) continue;
    const messageId = message.messageId?.trim() || "";
    if (!messageId) continue;
    const at = Date.parse(message.timestamp) || 0;
    if (at <= 0) continue;
    if (!best || at >= best.at) best = { messageId, at };
  }
  return best;
}

export async function findMissedInboundRetriageCandidates(input: {
  rows: ReadonlyArray<{
    id: string;
    number: number;
    inboxId: string;
    threadKey: string;
    status: string;
  }>;
  getThread: (
    inboxId: string,
    threadId: string,
  ) => Promise<{ subject: string; messages: SweepThreadMessage[] }>;
}): Promise<SweepMissedInboundHit[]> {
  const hits: SweepMissedInboundHit[] = [];
  for (const row of input.rows) {
    const threadId = row.threadKey.trim();
    if (!threadId || threadId.startsWith("draft:")) continue;
    let thread: { subject: string; messages: SweepThreadMessage[] };
    try {
      thread = await input.getThread(row.inboxId, threadId);
    } catch {
      continue;
    }
    const inbound = latestInbound(thread.messages);
    if (!inbound) continue;
    const outboundAt = latestOutboundAt(thread.messages);
    if (outboundAt != null && inbound.at <= outboundAt) continue;
    hits.push({
      id: row.id,
      displayId: formatEmailDisplayId(row.number),
      inboxId: row.inboxId,
      threadKey: row.threadKey,
      status: row.status,
      subject: thread.subject || "(no subject)",
      inboundMessageId: inbound.messageId,
      inboundAt: new Date(inbound.at).toISOString(),
      lastOutboundAt:
        outboundAt != null ? new Date(outboundAt).toISOString() : null,
    });
  }
  return hits;
}

async function main() {
  const args = parseSweepMissedInboundArgs(process.argv.slice(2));
  const secretQuery = db
    .select({
      workspaceId: workspaceIntegrationSecrets.workspaceId,
      apiKey: workspaceIntegrationSecrets.agentmailApiKey,
    })
    .from(workspaceIntegrationSecrets);
  const secretRows = args.workspaceId
    ? await secretQuery.where(
        eq(workspaceIntegrationSecrets.workspaceId, args.workspaceId),
      )
    : await secretQuery;

  const workspaces = secretRows.filter((row) => row.apiKey?.trim());
  if (workspaces.length === 0) {
    console.log("No AgentMail workspaces found.");
    await sqlClient.end({ timeout: 2 });
    return;
  }

  const allHits: SweepMissedInboundHit[] = [];
  for (const workspace of workspaces) {
    const apiKey = workspace.apiKey!.trim();
    const client = new AgentMailClient({ apiKey });
    const rows = await db
      .select({
        id: emailThreads.id,
        number: emailThreads.number,
        inboxId: emailThreads.inboxId,
        threadKey: emailThreads.threadKey,
        status: emailThreads.status,
      })
      .from(emailThreads)
      .where(
        and(
          eq(emailThreads.workspaceId, workspace.workspaceId),
          inArray(emailThreads.status, ["waiting", "completed"]),
        ),
      );
    const hits = await findMissedInboundRetriageCandidates({
      rows,
      getThread: (inboxId, threadId) =>
        client.getThread(inboxId, threadId).then((thread) => ({
          subject: thread.subject,
          messages: thread.messages.map((message) => ({
            messageId: message.messageId,
            timestamp: message.timestamp,
            labels: message.labels ?? [],
          })),
        })),
    });
    allHits.push(...hits);

    if (args.apply) {
      for (const hit of hits) {
        await emailThreadsService.retriageEmailThreadOnInbound(
          workspace.workspaceId,
          hit.inboxId,
          {
            threadId: hit.threadKey,
            messageId: hit.inboundMessageId,
            messageAt: hit.inboundAt,
            lastOutboundAt: hit.lastOutboundAt,
            source: "poll",
          },
        );
      }
    }
  }

  console.log(
    args.apply
      ? `Applied retriage to ${allHits.length} thread(s):`
      : `Dry-run: ${allHits.length} Waiting/Done thread(s) with inbound newer than last outbound:`,
  );
  for (const hit of allHits) {
    console.log(
      `${hit.displayId}\t${hit.id}\t${hit.status}\t${hit.subject.replace(/\s+/g, " ").slice(0, 80)}`,
    );
  }

  await sqlClient.end({ timeout: 2 });
}

const entry = process.argv[1] ?? "";
const isMain =
  entry.endsWith("sweep-missed-inbound-retriage.ts") ||
  entry.endsWith("sweep-missed-inbound-retriage.js");
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
