"use client";

/** Local PowerSync letter patches are not wired yet; server persist is authoritative. */

export async function updateLocalLetterStatus(_input: {
  letterId: string;
  projectId?: string | null;
  status: string;
}): Promise<{ ok: true }> {
  return { ok: true };
}

export async function updateLocalLetterDueDate(_input: {
  letterId: string;
  projectId?: string | null;
  dueDate: string | null;
}): Promise<{ ok: true }> {
  return { ok: true };
}

export async function updateLocalLetterReceivedDate(_input: {
  letterId: string;
  projectId?: string | null;
  receivedDate: string | null;
}): Promise<{ ok: true }> {
  return { ok: true };
}

export async function updateLocalLetterOrganization(_input: {
  letterId: string;
  organizationId: string | null;
}): Promise<{ ok: true }> {
  return { ok: true };
}

export async function updateLocalLetterContact(_input: {
  letterId: string;
  contactId: string | null;
}): Promise<{ ok: true }> {
  return { ok: true };
}

export async function moveLocalLetterToProject(_input: {
  letterId: string;
  projectId: string | null;
}): Promise<{ ok: true }> {
  return { ok: true };
}
