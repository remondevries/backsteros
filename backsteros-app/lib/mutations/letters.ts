"use client";

import type {
  Letter as ApiLetter,
  LetterAttachment,
} from "@backsteros/contracts";

import { dueDateToIso } from "@/lib/entity-normalize";
import { isTaskStatus, type TaskStatus } from "@/lib/task-status";

import {
  apiErrorText,
  getMutationContext,
  patchLetterLocal,
  toLocalFields,
} from "./client";

export type CreateLetterResult =
  | { ok: true; letterId: string; letterNumber: number | null }
  | { ok: false; error: string };

export type UpdateLetterTitleResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateLetterIconResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateLetterStatusResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateLetterDueDateResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateLetterReceivedDateResult =
  | { ok: true }
  | { ok: false; error: string };

export type MoveLetterToProjectResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateLetterOrganizationResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateLetterContactResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateLetterContextResult =
  | { ok: true }
  | { ok: false; error: string };

export type TriageLetterResult =
  | { ok: true }
  | { ok: false; error: string };

export type UploadLetterPdfResult =
  | { ok: true; attachmentId?: string }
  | { ok: false; error: string };

export type RenameLetterAttachmentResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteLetterResult =
  | { ok: true; redirectHref: string }
  | { ok: false; error: string };

async function patchLetter(
  letterId: string,
  body: Record<string, unknown>,
): Promise<ApiLetter> {
  const { client, sync, refresh } = getMutationContext();
  await patchLetterLocal(sync, letterId, body);
  const letter = await client.requestJson<ApiLetter>(
    `/api/v1/letters/${encodeURIComponent(letterId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  refresh();
  return letter;
}

export async function createLetterAction(input: {
  title: string;
  projectId?: string | null;
  organizationId?: string | null;
  contactId?: string | null;
  status?: TaskStatus;
  dueDate?: string | null;
  receivedDate?: string | null;
  context?: string | null;
}): Promise<CreateLetterResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Letter title is required." };

  const body = {
    title,
    projectId: input.projectId ?? null,
    organizationId: input.organizationId ?? null,
    contactId: input.contactId ?? null,
    status: input.status && isTaskStatus(input.status) ? input.status : "triage",
    dueDate: dueDateToIso(input.dueDate),
    receivedDate: dueDateToIso(input.receivedDate),
    context: input.context?.trim() || null,
    sortOrder: -Date.now(),
  };

  try {
    const { client, sync, refresh } = getMutationContext();
    // Create on the API first so PDF upload (and other REST blob ops) can follow
    // immediately. Local-only PowerSync create races the async uploader → 404.
    const letter = await client.requestJson<ApiLetter>("/api/v1/letters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (sync?.ready) {
      try {
        await sync.createMetadata(
          "letters",
          toLocalFields({
            ...body,
            number: letter.number,
          }),
          letter.id,
        );
      } catch {
        // Non-fatal: download sync will eventually bring the row in.
      }
    }
    refresh();
    return { ok: true, letterId: letter.id, letterNumber: letter.number };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateLetterTitleAction(input: {
  letterId: string;
  title: string;
}): Promise<UpdateLetterTitleResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Letter title is required." };
  try {
    await patchLetter(input.letterId, { title });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateLetterIconAction(input: {
  letterId: string;
  icon: string | null;
}): Promise<UpdateLetterIconResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  try {
    await patchLetter(input.letterId, { icon: input.icon });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateLetterStatusAction(input: {
  letterId: string;
  status: TaskStatus;
}): Promise<UpdateLetterStatusResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  if (!isTaskStatus(input.status)) return { ok: false, error: "Invalid status." };
  try {
    await patchLetter(input.letterId, { status: input.status });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateLetterDueDateAction(input: {
  letterId: string;
  dueDate: string | null;
}): Promise<UpdateLetterDueDateResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  try {
    await patchLetter(input.letterId, { dueDate: dueDateToIso(input.dueDate) });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateLetterReceivedDateAction(input: {
  letterId: string;
  receivedDate: string | null;
}): Promise<UpdateLetterReceivedDateResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  try {
    await patchLetter(input.letterId, {
      receivedDate: dueDateToIso(input.receivedDate),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function moveLetterToProjectAction(input: {
  letterId: string;
  projectId: string | null;
}): Promise<MoveLetterToProjectResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  try {
    await patchLetter(input.letterId, { projectId: input.projectId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateLetterOrganizationAction(input: {
  letterId: string;
  organizationId: string | null;
  clearContact?: boolean;
}): Promise<UpdateLetterOrganizationResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  try {
    const body: Record<string, unknown> = {
      organizationId: input.organizationId,
    };
    if (input.clearContact || input.organizationId == null) {
      body.contactId = null;
    }
    await patchLetter(input.letterId, body);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateLetterContactAction(input: {
  letterId: string;
  contactId: string | null;
}): Promise<UpdateLetterContactResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  try {
    await patchLetter(input.letterId, { contactId: input.contactId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateLetterContextAction(input: {
  letterId: string;
  context: string;
}): Promise<UpdateLetterContextResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  try {
    await patchLetter(input.letterId, {
      context: input.context.trim() || null,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function triageLetterAction(input: {
  letterId: string;
  projectId?: string | null;
  organizationId?: string | null;
  contactId?: string | null;
  status?: TaskStatus;
  dueDate?: string | null;
}): Promise<TriageLetterResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  if (input.status != null && !isTaskStatus(input.status)) {
    return { ok: false, error: "Invalid status." };
  }

  const body: Record<string, unknown> = {};
  if (input.projectId !== undefined) body.projectId = input.projectId;
  if (input.organizationId !== undefined) {
    body.organizationId = input.organizationId;
  }
  if (input.contactId !== undefined) body.contactId = input.contactId;
  if (input.status !== undefined) body.status = input.status;
  if (input.dueDate !== undefined) body.dueDate = dueDateToIso(input.dueDate);

  try {
    const { client, sync, refresh } = getMutationContext();
    await patchLetterLocal(sync, input.letterId, body);
    await client.requestJson(
      `/api/v1/letters/${encodeURIComponent(input.letterId)}/triage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function uploadLetterPdfAction(input: {
  letterId: string;
  file: File;
  onProgress?: (ratio: number) => void;
}): Promise<UploadLetterPdfResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  if (!input.file) return { ok: false, error: "Choose a PDF file to upload." };
  try {
    const { client, refresh } = getMutationContext();
    input.onProgress?.(0);
    try {
      const attachment = await client.uploadLetterAttachment(
        input.letterId,
        input.file,
        input.file.name,
        {
          onProgress: (event) => {
            input.onProgress?.(event.ratio);
          },
        },
      );
      input.onProgress?.(1);
      refresh();
      return { ok: true, attachmentId: attachment.id };
    } catch (error) {
      // Prod API without /attachments yet — fall back to legacy single-PDF PUT.
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status?: unknown }).status)
          : null;
      if (status !== 404) throw error;
      await client.uploadLetterPdf(input.letterId, input.file, input.file.name, {
        onProgress: (event) => {
          input.onProgress?.(event.ratio);
        },
      });
      input.onProgress?.(1);
      refresh();
      return { ok: true };
    }
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function renameLetterAttachmentAction(input: {
  letterId: string;
  attachmentId: string;
  originalFilename: string;
}): Promise<RenameLetterAttachmentResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  if (!input.attachmentId.trim()) {
    return { ok: false, error: "Attachment is required." };
  }
  const filename = input.originalFilename.trim();
  if (!filename) return { ok: false, error: "Name is required." };

  try {
    const { client, refresh } = getMutationContext();
    await client.updateLetterAttachment(input.letterId, input.attachmentId, {
      originalFilename: filename,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export type ReorderLetterAttachmentsResult =
  | { ok: true; attachments: LetterAttachment[] }
  | { ok: false; error: string };

export async function reorderLetterAttachmentsAction(input: {
  letterId: string;
  orderedIds: string[];
}): Promise<ReorderLetterAttachmentsResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  if (input.orderedIds.length === 0) {
    return { ok: false, error: "Attachment order is required." };
  }

  try {
    const { client, refresh } = getMutationContext();
    const result = await client.reorderLetterAttachments(
      input.letterId,
      input.orderedIds,
    );
    refresh();
    return { ok: true, attachments: result.attachments };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function deleteLetterAction(input: {
  letterId: string;
}): Promise<DeleteLetterResult> {
  if (!input.letterId.trim()) return { ok: false, error: "Letter is required." };
  try {
    const { client, sync, refresh } = getMutationContext();
    await patchLetterLocal(sync, input.letterId, {
      deletedAt: new Date().toISOString(),
    });
    await client.requestJson(
      `/api/v1/letters/${encodeURIComponent(input.letterId)}`,
      { method: "DELETE" },
    );
    refresh();
    return { ok: true, redirectHref: "/letters" };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}
