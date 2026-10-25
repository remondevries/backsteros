import { and, eq, isNull, or, sql } from "drizzle-orm";

import { getContactById, getOrganizationById, listContacts } from "./organizations-contacts.js";
import { db } from "../../db/index.js";
import { documents, projects, tasks } from "../../db/schema.js";
import { getLetterById, listLetters } from "./letters.js";
export async function getOrganizationRelations(workspaceId: string, id: string) {
  const organization = await getOrganizationById(workspaceId, id);
  if (!organization) return null;
  const [contactRows, projectRows, letterRows] = await Promise.all([
    listContacts(workspaceId, { organizationId: id }),
    db.select().from(projects).where(and(eq(projects.workspaceId, workspaceId), eq(projects.organizationId, id), isNull(projects.deletedAt))),
    listLetters(workspaceId, { organizationId: id }),
  ]);
  return { organization, contacts: contactRows, projects: projectRows, letters: letterRows };
}

export async function getContactRelations(workspaceId: string, id: string) {
  const contact = await getContactById(workspaceId, id);
  if (!contact) return null;
  const [organization, taskRows, letterRows] = await Promise.all([
    contact.organizationId ? getOrganizationById(workspaceId, contact.organizationId) : null,
    db.select().from(tasks).where(and(
      eq(tasks.workspaceId, workspaceId),
      or(
        eq(tasks.contactId, id),
        eq(tasks.assigneeId, id),
        sql`${tasks.relatedContactIds} @> ${JSON.stringify([id])}::jsonb`,
      ),
      isNull(tasks.deletedAt),
    )),
    listLetters(workspaceId, { contactId: id }),
  ]);
  return { contact, organization, tasks: taskRows, letters: letterRows };
}

export async function getProjectRelations(workspaceId: string, id: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) return null;
  const [organization, taskRows, documentRows, letterRows] = await Promise.all([
    project.organizationId ? getOrganizationById(workspaceId, project.organizationId) : null,
    db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.projectId, id), isNull(tasks.deletedAt))),
    db.select().from(documents).where(and(eq(documents.workspaceId, workspaceId), eq(documents.projectId, id), isNull(documents.deletedAt))),
    listLetters(workspaceId, { projectId: id }),
  ]);
  return { project, organization, tasks: taskRows, documents: documentRows, letters: letterRows };
}

export async function getTaskRelations(workspaceId: string, id: string) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id), isNull(tasks.deletedAt)))
    .limit(1);
  if (!task) return null;
  const [project, contact, assignee] = await Promise.all([
    task.projectId
      ? db.select().from(projects).where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, task.projectId), isNull(projects.deletedAt))).limit(1).then(([row]) => row ?? null)
      : null,
    task.contactId ? getContactById(workspaceId, task.contactId) : null,
    task.assigneeId ? getContactById(workspaceId, task.assigneeId) : null,
  ]);
  return { task, project, contact, assignee };
}

export async function getLetterRelations(workspaceId: string, id: string) {
  const letter = await getLetterById(workspaceId, id);
  if (!letter) return null;
  const [project, organization, contact] = await Promise.all([
    letter.projectId
      ? db.select().from(projects).where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, letter.projectId), isNull(projects.deletedAt))).limit(1).then(([row]) => row ?? null)
      : null,
    letter.organizationId ? getOrganizationById(workspaceId, letter.organizationId) : null,
    letter.contactId ? getContactById(workspaceId, letter.contactId) : null,
  ]);
  return { letter, project, organization, contact };
}
