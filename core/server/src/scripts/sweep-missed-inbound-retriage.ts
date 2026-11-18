/**
 * OS-188: one-time sweep after deploy — list Waiting/Done threads whose latest
 * inbound (non-sent) message is newer than the latest outbound/`sent` message
 * and would actually bounce under the real retriage rule.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/sweep-missed-inbound-retriage.ts
 *     → dry-run (default): prints thread id / display id / subject / status only.
 *   ... --apply
 *     → retriages matching threads to Triage (writes); reports threads actually changed.
 *
 * No writes unless --apply. Safe to run read-only against cloud after migration.
 */
import { and, eq, inArray } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { emailThreads, workspaceIntegrationSecrets } from "../db/schema.js";
import { AgentMailClient } from "../lib/agentmail-client.js";
import {
  isAgentMailOutboundMessage,
  isLikelyClientThankYouMessage,
  isNewerInboundMessage,
  latestAgentMailOutboundAt,
  shouldBounceWaitingThreadOnInbound,
} from "../lib/email-status-labels.js";
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
  preview?: string | null;
  text?: string | null;
};

export type SweepMissedInboundRow = {
  id: string;
  number: number;
  inboxId: string;
  threadKey: string;
  status: string;
  updatedAt?: Date | string | null;
  lastProcessedInboundMessageId?: string | null;
  lastProcessedInboundAt?: Date | string | null;
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
  return latestAgentMailOutboundAt(messages);
}

export function latestInbound(
  messages: ReadonlyArray<SweepThreadMessage>,
): { messageId: string; at: number; preview: string | null; text: string | null } | null {
  let best: {
    messageId: string;
    at: number;
    preview: string | null;
    text: string | null;
  } | null = null;
  for (const message of messages) {
    if (isAgentMailOutboundMessage(message.labels)) continue;
    const messageId = message.messageId?.trim() || "";
    if (!messageId) continue;
    const at = Date.parse(message.timestamp) || 0;
    if (at <= 0) continue;
    if (!best || at >= best.at) {
      best = {
        messageId,
        at,
        preview: message.preview ?? null,
        text: message.text ?? null,
      };
    }
  }
  return best;
}

/**
 * Mirror retriageEmailThreadOnInbound bounce predicates so dry-run candidates
 * match threads --apply would actually move (cursor + outbound/waiting floor).
 * Done + short client thank-you is skipped unless that real rule would bounce.
 */
export function wouldSweepRetriageHit(input: {
  status: string;
  inboundMessageId: string;
  inboundAt: number;
  inboundPreview?: string | null;
  inboundText?: string | null;
  lastOutboundAt: number | null;
  updatedAt?: Date | string | null;
  lastProcessedInboundMessageId?: string | null;
  lastProcessedInboundAt?: Date | string | null;
}): boolean {
  const isNew = isNewerInboundMessage({
    storedId: input.lastProcessedInboundMessageId,
    storedAt: input.lastProcessedInboundAt,
    candidateId: input.inboundMessageId,
    candidateAt: input.inboundAt,
  });
  if (!isNew) return false;

  const mayBounce = shouldBounceWaitingThreadOnInbound({
    status: input.status,
    inboundAt: input.inboundAt,
    lastOutboundAt: input.lastOutboundAt,
    waitingEnteredAt: input.updatedAt,
  });
  if (!mayBounce) return false;

  const status = (input.status ?? "").trim();
  if (status === "completed" || status === "done") {
    const thankYou =
      isLikelyClientThankYouMessage(input.inboundText) ||
      isLikelyClientThankYouMessage(input.inboundPreview);
    if (thankYou) {
      // Thank-you alone is not enough: only keep if bounce still holds when the
      // outbound floor is ignored (status-entered / updatedAt cutoff) — i.e. a
      // real post-Done reply, not a thanks that landed before Done was set.
      return shouldBounceWaitingThreadOnInbound({
        status: input.status,
        inboundAt: input.inboundAt,
        lastOutboundAt: null,
        waitingEnteredAt: input.updatedAt,
      });
    }
  }
  return true;
}

export async function findMissedInboundRetriageCandidates(input: {
  rows: ReadonlyArray<SweepMissedInboundRow>;
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
    if (
      !wouldSweepRetriageHit({
        status: row.status,
        inboundMessageId: inbound.messageId,
        inboundAt: inbound.at,
        inboundPreview: inbound.preview,
        inboundText: inbound.text,
        lastOutboundAt: outboundAt,
        updatedAt: row.updatedAt,
        lastProcessedInboundMessageId: row.lastProcessedInboundMessageId,
        lastProcessedInboundAt: row.lastProcessedInboundAt,
      })
    ) {
      continue;
    }
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

export async function applyMissedInboundRetriageHits(input: {
  workspaceId: string;
  hits: ReadonlyArray<SweepMissedInboundHit>;
  retriage?: typeof emailThreadsService.retriageEmailThreadOnInbound;
}): Promise<{ changed: SweepMissedInboundHit[]; unchanged: number }> {
  const retriage =
    input.retriage ?? emailThreadsService.retriageEmailThreadOnInbound;
  const changed: SweepMissedInboundHit[] = [];
  let unchanged = 0;
  for (const hit of input.hits) {
    const beforeStatus = hit.status;
    const result = await retriage(input.workspaceId, hit.inboxId, {
      threadId: hit.threadKey,
      messageId: hit.inboundMessageId,
      messageAt: hit.inboundAt,
      lastOutboundAt: hit.lastOutboundAt,
      source: "poll",
    });
    if (result?.status === "triage" && beforeStatus !== "triage") {
      changed.push(hit);
    } else {
      unchanged += 1;
    }
  }
  return { changed, unchanged };
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
  const allChanged: SweepMissedInboundHit[] = [];
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
        updatedAt: emailThreads.updatedAt,
        lastProcessedInboundMessageId: emailThreads.lastProcessedInboundMessageId,
        lastProcessedInboundAt: emailThreads.lastProcessedInboundAt,
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
            preview: message.preview,
            text: message.text,
          })),
        })),
    });
    allHits.push(...hits);

    if (args.apply) {
      const { changed } = await applyMissedInboundRetriageHits({
        workspaceId: workspace.workspaceId,
        hits,
      });
      allChanged.push(...changed);
    }
  }

  if (args.apply) {
    console.log(
      `Applied retriage to ${allChanged.length} thread(s) (${allHits.length} candidate(s)):`,
    );
    for (const hit of allChanged) {
      console.log(
        `${hit.displayId}\t${hit.id}\t${hit.status}\t${hit.subject.replace(/\s+/g, " ").slice(0, 80)}`,
      );
    }
  } else {
    console.log(
      `Dry-run: ${allHits.length} Waiting/Done thread(s) with inbound newer than last outbound:`,
    );
    for (const hit of allHits) {
      console.log(
        `${hit.displayId}\t${hit.id}\t${hit.status}\t${hit.subject.replace(/\s+/g, " ").slice(0, 80)}`,
      );
    }
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
