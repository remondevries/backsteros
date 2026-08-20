import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type {
  EmailThreadComment,
  EmailThreadMetadata,
  UpdateEmailThreadMetadataInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  contacts,
  emailThreadComments,
  emailThreads,
  organizations,
  projects,
  type DbEmailThread,
  type DbEmailThreadComment,
  type DbProject,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  getContactById,
  getOrganizationById,
} from "./circle-domain.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export type EmailThreadListMeta = {
  status: EmailThreadMetadata["status"];
  priority: number;
  dueDate: string | null;
  organizationId: string | null;
  organizationName: string | null;
  contactId: string | null;
  contactName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectName: string | null;
  projectKey: string | null;
};

export function resolveEmailThreadKey(input: {
  threadId?: string | null;
  messageId: string;
}): string {
  const threadId = input.threadId?.trim();
  if (threadId) return threadId;
  return input.messageId.trim();
}

async function organizationExists(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const org = await getOrganizationById(workspaceId, id, executor);
  return Boolean(org);
}

async function contactExists(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const contact = await getContactById(workspaceId, id, executor);
  return Boolean(contact);
}

async function getProjectById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<DbProject | null> {
  const [row] = await executor
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, id),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function projectExists(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  return Boolean(await getProjectById(workspaceId, id, executor));
}

async function getEmailThreadRow(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(emailThreads)
    .where(
      and(
        eq(emailThreads.workspaceId, workspaceId),
        eq(emailThreads.inboxId, inboxId),
        eq(emailThreads.threadKey, threadKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function toEmailThreadMetadata(
  workspaceId: string,
  row: DbEmailThread,
): Promise<EmailThreadMetadata> {
  const [organization, contact, assignee, project] = await Promise.all([
    row.organizationId
      ? getOrganizationById(workspaceId, row.organizationId)
      : null,
    row.contactId ? getContactById(workspaceId, row.contactId) : null,
    row.assigneeId ? getContactById(workspaceId, row.assigneeId) : null,
    row.projectId ? getProjectById(workspaceId, row.projectId) : null,
  ]);
  return {
    id: row.id,
    inboxId: row.inboxId,
    threadKey: row.threadKey,
    organizationId: row.organizationId ?? null,
    organizationName: organization?.name ?? null,
    contactId: row.contactId ?? null,
    contactName: contact?.name ?? null,
    assigneeId: row.assigneeId ?? null,
    assigneeName: assignee?.name ?? null,
    projectId: row.projectId ?? null,
    projectName: project?.name ?? null,
    projectKey: project?.key ?? null,
    status: row.status as EmailThreadMetadata["status"],
    priority: row.priority ?? 0,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOrCreateEmailThreadMetadata(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  executor: DbExecutor = db,
): Promise<EmailThreadMetadata> {
  const existing = await getEmailThreadRow(
    workspaceId,
    inboxId,
    threadKey,
    executor,
  );
  if (existing) {
    return toEmailThreadMetadata(workspaceId, existing);
  }
  const id = newId();
  const [row] = await executor
    .insert(emailThreads)
    .values({
      id,
      workspaceId,
      inboxId,
      threadKey,
      status: "backlog",
      priority: 0,
    })
    .returning();
  return toEmailThreadMetadata(workspaceId, row!);
}

/** Map of `inboxId\\0threadKey` → list meta for side-panel enrichment (no row create). */
export async function listEmailThreadListMetaMap(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<Map<string, EmailThreadListMeta>> {
  const rows = await executor
    .select({
      inboxId: emailThreads.inboxId,
      threadKey: emailThreads.threadKey,
      status: emailThreads.status,
      priority: emailThreads.priority,
      dueDate: emailThreads.dueDate,
      organizationId: emailThreads.organizationId,
      contactId: emailThreads.contactId,
      assigneeId: emailThreads.assigneeId,
      projectId: emailThreads.projectId,
    })
    .from(emailThreads)
    .where(eq(emailThreads.workspaceId, workspaceId));

  const organizationIds = [
    ...new Set(
      rows
        .map((row) => row.organizationId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const contactIds = [
    ...new Set(
      rows.flatMap((row) =>
        [row.contactId, row.assigneeId].filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    ),
  ];
  const projectIds = [
    ...new Set(
      rows
        .map((row) => row.projectId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const organizationNameById = new Map<string, string>();
  if (organizationIds.length > 0) {
    const organizationRows = await executor
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(
        and(
          eq(organizations.workspaceId, workspaceId),
          inArray(organizations.id, organizationIds),
          isNull(organizations.deletedAt),
        ),
      );
    for (const organization of organizationRows) {
      organizationNameById.set(organization.id, organization.name);
    }
  }

  const contactNameById = new Map<string, string>();
  if (contactIds.length > 0) {
    const contactRows = await executor
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          inArray(contacts.id, contactIds),
          isNull(contacts.deletedAt),
        ),
      );
    for (const contact of contactRows) {
      contactNameById.set(contact.id, contact.name);
    }
  }

  const projectById = new Map<
    string,
    { name: string; key: string }
  >();
  if (projectIds.length > 0) {
    const projectRows = await executor
      .select({
        id: projects.id,
        name: projects.name,
        key: projects.key,
      })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          inArray(projects.id, projectIds),
          isNull(projects.deletedAt),
        ),
      );
    for (const project of projectRows) {
      projectById.set(project.id, { name: project.name, key: project.key });
    }
  }

  const map = new Map<string, EmailThreadListMeta>();
  for (const row of rows) {
    const project = row.projectId ? projectById.get(row.projectId) : null;
    map.set(`${row.inboxId}\0${row.threadKey}`, {
      status: row.status as EmailThreadMetadata["status"],
      priority: row.priority ?? 0,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      organizationId: row.organizationId ?? null,
      organizationName: row.organizationId
        ? (organizationNameById.get(row.organizationId) ?? null)
        : null,
      contactId: row.contactId ?? null,
      contactName: row.contactId
        ? (contactNameById.get(row.contactId) ?? null)
        : null,
      assigneeId: row.assigneeId ?? null,
      assigneeName: row.assigneeId
        ? (contactNameById.get(row.assigneeId) ?? null)
        : null,
      projectId: row.projectId ?? null,
      projectName: project?.name ?? null,
      projectKey: project?.key ?? null,
    });
  }
  return map;
}

/** @deprecated Prefer listEmailThreadListMetaMap */
export async function listEmailThreadStatusMap(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<Map<string, EmailThreadMetadata["status"]>> {
  const meta = await listEmailThreadListMetaMap(workspaceId, executor);
  const map = new Map<string, EmailThreadMetadata["status"]>();
  for (const [key, value] of meta) {
    map.set(key, value.status);
  }
  return map;
}

export function emailThreadStatusLookupKey(
  inboxId: string,
  threadKey: string,
): string {
  return `${inboxId}\0${threadKey}`;
}

export async function updateEmailThreadMetadata(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  input: UpdateEmailThreadMetadataInput,
  executor: DbExecutor = db,
): Promise<EmailThreadMetadata | null> {
  if (
    input.organizationId &&
    !(await organizationExists(workspaceId, input.organizationId, executor))
  ) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }
  if (
    input.contactId &&
    !(await contactExists(workspaceId, input.contactId, executor))
  ) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  if (
    input.assigneeId &&
    !(await contactExists(workspaceId, input.assigneeId, executor))
  ) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  if (
    input.projectId &&
    !(await projectExists(workspaceId, input.projectId, executor))
  ) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const existing = await getEmailThreadRow(
    workspaceId,
    inboxId,
    threadKey,
    executor,
  );
  const now = new Date();
  const dueDate =
    input.dueDate === undefined
      ? undefined
      : input.dueDate
        ? new Date(input.dueDate)
        : null;
  const patch = {
    organizationId:
      input.organizationId === undefined ? undefined : input.organizationId,
    contactId: input.contactId === undefined ? undefined : input.contactId,
    assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId,
    projectId: input.projectId === undefined ? undefined : input.projectId,
    status: input.status,
    priority: input.priority,
    dueDate,
    updatedAt: now,
  };

  if (existing) {
    const [row] = await executor
      .update(emailThreads)
      .set(patch)
      .where(eq(emailThreads.id, existing.id))
      .returning();
    return row ? toEmailThreadMetadata(workspaceId, row) : null;
  }

  const [row] = await executor
    .insert(emailThreads)
    .values({
      id: newId(),
      workspaceId,
      inboxId,
      threadKey,
      status: input.status ?? "backlog",
      priority: input.priority ?? 0,
      dueDate: dueDate === undefined ? null : dueDate,
      organizationId: input.organizationId ?? null,
      contactId: input.contactId ?? null,
      assigneeId: input.assigneeId ?? null,
      projectId: input.projectId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row ? toEmailThreadMetadata(workspaceId, row) : null;
}

function toEmailThreadComment(row: DbEmailThreadComment): EmailThreadComment {
  const author = row.author === "agent" ? "agent" : "user";
  return {
    id: row.id,
    emailThreadId: row.emailThreadId,
    body: row.body ?? "",
    author,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEmailThreadComments(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  executor: DbExecutor = db,
): Promise<EmailThreadComment[]> {
  const thread = await getEmailThreadRow(
    workspaceId,
    inboxId,
    threadKey,
    executor,
  );
  if (!thread) return [];
  const rows = await executor
    .select()
    .from(emailThreadComments)
    .where(
      and(
        eq(emailThreadComments.workspaceId, workspaceId),
        eq(emailThreadComments.emailThreadId, thread.id),
        isNull(emailThreadComments.deletedAt),
      ),
    )
    .orderBy(asc(emailThreadComments.createdAt));
  return rows.map(toEmailThreadComment);
}

export async function createEmailThreadComment(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
  input: { body: string; author?: "user" | "agent" },
  executor: DbExecutor = db,
): Promise<EmailThreadComment> {
  const metadata = await getOrCreateEmailThreadMetadata(
    workspaceId,
    inboxId,
    threadKey,
    executor,
  );
  const now = new Date();
  const [row] = await executor
    .insert(emailThreadComments)
    .values({
      id: newId(),
      workspaceId,
      emailThreadId: metadata.id,
      body: input.body.trim(),
      author: input.author === "agent" ? "agent" : "user",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toEmailThreadComment(row!);
}

export async function updateEmailThreadComment(
  workspaceId: string,
  commentId: string,
  body: string,
  executor: DbExecutor = db,
): Promise<EmailThreadComment | null> {
  const [row] = await executor
    .update(emailThreadComments)
    .set({
      body: body.trim(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailThreadComments.workspaceId, workspaceId),
        eq(emailThreadComments.id, commentId),
        isNull(emailThreadComments.deletedAt),
      ),
    )
    .returning();
  return row ? toEmailThreadComment(row) : null;
}

export async function deleteEmailThreadComment(
  workspaceId: string,
  commentId: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [row] = await executor
    .update(emailThreadComments)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailThreadComments.workspaceId, workspaceId),
        eq(emailThreadComments.id, commentId),
        isNull(emailThreadComments.deletedAt),
      ),
    )
    .returning({ id: emailThreadComments.id });
  return Boolean(row);
}

/** Remove local thread metadata + comments when the AgentMail thread is gone. */
export async function deleteEmailThreadLocal(
  workspaceId: string,
  inboxId: string,
  threadKey: string,
): Promise<boolean> {
  const deleted = await db
    .delete(emailThreads)
    .where(
      and(
        eq(emailThreads.workspaceId, workspaceId),
        eq(emailThreads.inboxId, inboxId),
        eq(emailThreads.threadKey, threadKey),
      ),
    )
    .returning({ id: emailThreads.id });
  return deleted.length > 0;
}
