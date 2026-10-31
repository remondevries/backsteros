/**
 * Resolve `[@kind:…]` tokens in chat bodies for agent webhooks / thread APIs.
 * Always scoped to `workspaceId` — never crosses orgs.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { ChatResolvedMention } from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  contacts,
  documents,
  letters,
  meetings,
  organizations,
  projects,
  tasks,
} from "../db/schema.js";
import {
  extractChatMentionTokens,
  type ParsedChatMentionToken,
} from "../lib/chat-mention-tokens.js";
import {
  resolveContactRef,
  resolveOrganizationRef,
  resolveProjectRef,
  resolveTaskRef,
} from "../lib/entity-refs.js";

function unresolved(
  token: ParsedChatMentionToken,
  path: string | null = null,
): ChatResolvedMention {
  return {
    kind: token.kind,
    raw: token.raw,
    resolved: false,
    id: null,
    displayId: null,
    title: null,
    status: null,
    path,
  };
}

async function resolveOne(
  workspaceId: string,
  token: ParsedChatMentionToken,
): Promise<ChatResolvedMention> {
  switch (token.kind) {
    case "task": {
      const path = `/api/v1/tasks/${encodeURIComponent(token.displayId)}`;
      const taskId = await resolveTaskRef(workspaceId, token.displayId);
      if (!taskId) return unresolved(token, path);
      const [row] = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          number: tasks.number,
          projectKey: projects.key,
        })
        .from(tasks)
        .leftJoin(
          projects,
          and(
            eq(projects.id, tasks.projectId),
            eq(projects.workspaceId, tasks.workspaceId),
          ),
        )
        .where(
          and(
            eq(tasks.workspaceId, workspaceId),
            eq(tasks.id, taskId),
            isNull(tasks.deletedAt),
          ),
        )
        .limit(1);
      if (!row) return unresolved(token, path);
      const displayId = row.projectKey
        ? `${row.projectKey}-${row.number}`
        : `IN-${row.number}`;
      return {
        kind: "task",
        raw: token.raw,
        resolved: true,
        id: row.id,
        displayId,
        title: row.title,
        status: row.status,
        path,
      };
    }
    case "project": {
      const path = `/api/v1/projects/${encodeURIComponent(token.key)}`;
      const projectId = await resolveProjectRef(workspaceId, token.key);
      if (!projectId) return unresolved(token, path);
      const [row] = await db
        .select({
          id: projects.id,
          key: projects.key,
          name: projects.name,
          status: projects.status,
        })
        .from(projects)
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            eq(projects.id, projectId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);
      if (!row) return unresolved(token, path);
      return {
        kind: "project",
        raw: token.raw,
        resolved: true,
        id: row.id,
        displayId: row.key,
        title: row.name,
        status: row.status,
        path,
      };
    }
    case "contact": {
      const path = `/api/v1/contacts/${encodeURIComponent(token.key)}`;
      const contactId = await resolveContactRef(workspaceId, token.key);
      if (!contactId) return unresolved(token, path);
      const [row] = await db
        .select({
          id: contacts.id,
          name: contacts.name,
          number: contacts.number,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspaceId),
            eq(contacts.id, contactId),
            isNull(contacts.deletedAt),
          ),
        )
        .limit(1);
      if (!row) return unresolved(token, path);
      return {
        kind: "contact",
        raw: token.raw,
        resolved: true,
        id: row.id,
        displayId: row.number != null ? `C-${row.number}` : token.key,
        title: row.name,
        status: null,
        path: `/api/v1/contacts/${encodeURIComponent(row.id)}`,
      };
    }
    case "organization": {
      const path = `/api/v1/organizations/${encodeURIComponent(token.key)}`;
      const organizationId = await resolveOrganizationRef(
        workspaceId,
        token.key,
      );
      if (!organizationId) return unresolved(token, path);
      const [row] = await db
        .select({
          id: organizations.id,
          key: organizations.key,
          name: organizations.name,
        })
        .from(organizations)
        .where(
          and(
            eq(organizations.workspaceId, workspaceId),
            eq(organizations.id, organizationId),
            isNull(organizations.deletedAt),
          ),
        )
        .limit(1);
      if (!row) return unresolved(token, path);
      return {
        kind: "organization",
        raw: token.raw,
        resolved: true,
        id: row.id,
        displayId: row.key,
        title: row.name,
        status: null,
        path: `/api/v1/organizations/${encodeURIComponent(row.id)}`,
      };
    }
    case "letter": {
      const path = `/api/v1/letters/${encodeURIComponent(token.displayId)}`;
      const [row] = await db
        .select({
          id: letters.id,
          title: letters.title,
          status: letters.status,
          number: letters.number,
        })
        .from(letters)
        .where(
          and(
            eq(letters.workspaceId, workspaceId),
            isNull(letters.deletedAt),
            sql`(
              ${letters.id} = ${token.displayId}
              or (
                ${letters.number} is not null
                and lower(concat('l-', ${letters.number}::text)) = ${token.displayId.toLowerCase()}
              )
            )`,
          ),
        )
        .limit(1);
      if (!row) return unresolved(token, path);
      return {
        kind: "letter",
        raw: token.raw,
        resolved: true,
        id: row.id,
        displayId:
          row.number != null ? `L-${row.number}` : token.displayId,
        title: row.title,
        status: row.status,
        path: `/api/v1/letters/${encodeURIComponent(row.id)}`,
      };
    }
    case "meeting": {
      const path = `/api/v1/meetings/${encodeURIComponent(token.displayId)}`;
      const [row] = await db
        .select({
          id: meetings.id,
          title: meetings.title,
          status: meetings.status,
          number: meetings.number,
        })
        .from(meetings)
        .where(
          and(
            eq(meetings.workspaceId, workspaceId),
            isNull(meetings.deletedAt),
            sql`(
              ${meetings.id} = ${token.displayId}
              or (
                ${meetings.number} is not null
                and lower(concat('m-', ${meetings.number}::text)) = ${token.displayId.toLowerCase()}
              )
            )`,
          ),
        )
        .limit(1);
      if (!row) return unresolved(token, path);
      return {
        kind: "meeting",
        raw: token.raw,
        resolved: true,
        id: row.id,
        displayId:
          row.number != null ? `M-${row.number}` : token.displayId,
        title: row.title,
        status: row.status,
        path: `/api/v1/meetings/${encodeURIComponent(row.id)}`,
      };
    }
    case "document": {
      const path = `/api/v1/documents/${encodeURIComponent(token.projectKey)}/${token.relativePath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      const [row] = await db
        .select({
          id: documents.id,
          title: documents.title,
          docPath: documents.path,
          projectKey: projects.key,
        })
        .from(documents)
        .innerJoin(
          projects,
          and(
            eq(projects.id, documents.projectId),
            eq(projects.workspaceId, documents.workspaceId),
          ),
        )
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            isNull(documents.deletedAt),
            sql`lower(${projects.key}) = ${token.projectKey.toLowerCase()}`,
            sql`lower(${documents.path}) = ${token.relativePath.toLowerCase()}`,
          ),
        )
        .limit(1);
      if (!row) return unresolved(token, path);
      return {
        kind: "document",
        raw: token.raw,
        resolved: true,
        id: row.id,
        displayId: `${row.projectKey}/${row.docPath}`,
        title: row.title,
        status: null,
        path,
      };
    }
    case "journal":
      return {
        kind: "journal",
        raw: token.raw,
        resolved: true,
        id: token.date,
        displayId: token.date,
        title: token.date,
        status: null,
        path: `/api/v1/journal/${encodeURIComponent(token.date)}`,
      };
    case "habit":
      return unresolved(
        token,
        `/api/v1/habits/${encodeURIComponent(token.habitId)}`,
      );
    case "email":
      return unresolved(
        token,
        `/api/v1/email/${encodeURIComponent(token.displayId)}`,
      );
    case "message":
      return unresolved(
        token,
        `/api/v1/communication/${encodeURIComponent(token.id)}`,
      );
    case "post":
      return unresolved(
        token,
        `/api/v1/social/posts/${encodeURIComponent(token.id)}`,
      );
    case "transaction":
      return unresolved(
        token,
        `/api/v1/finance/transactions/${encodeURIComponent(token.id)}`,
      );
    case "invoice":
      return unresolved(
        token,
        `/api/v1/finance/invoices/${encodeURIComponent(token.id)}`,
      );
    case "estimate":
      return unresolved(
        token,
        `/api/v1/finance/estimates/${encodeURIComponent(token.id)}`,
      );
  }
}

/**
 * Resolve mention tokens in a chat body for one workspace.
 * Empty body / no tokens → `[]`. Unresolvable tokens stay in the list with
 * `resolved: false`.
 */
export async function resolveChatMentionsInBody(
  workspaceId: string,
  body: string,
): Promise<ChatResolvedMention[]> {
  const [list] = await resolveChatMentionsInBodies(workspaceId, [body]);
  return list ?? [];
}

/**
 * Batch-resolve mentions for many bodies (OS-162). Unique tokens are resolved
 * once and reused across messages — avoids per-message N+1 hydrate.
 */
export async function resolveChatMentionsInBodies(
  workspaceId: string,
  bodies: readonly string[],
): Promise<ChatResolvedMention[][]> {
  const tokenLists = bodies.map((body) =>
    body.trim().length > 0 ? extractChatMentionTokens(body) : [],
  );
  const cache = new Map<string, ChatResolvedMention>();
  const unique: ParsedChatMentionToken[] = [];
  for (const tokens of tokenLists) {
    for (const token of tokens) {
      if (cache.has(token.raw)) continue;
      cache.set(token.raw, unresolved(token)); // placeholder until resolved
      unique.push(token);
    }
  }
  await Promise.all(
    unique.map(async (token) => {
      cache.set(token.raw, await resolveOne(workspaceId, token));
    }),
  );
  return tokenLists.map((tokens) =>
    tokens.map((token) => cache.get(token.raw) ?? unresolved(token)),
  );
}
