"use client";

import type { Contact as ApiContact } from "@backsteros/contracts";

import {
  assertAvatarFile,
  resolveAvatarContentType,
} from "@/lib/avatars/utils";

import {
  apiErrorText,
  getMutationContext,
  patchContactLocal,
  toLocalFields,
} from "./client";

export type CreateContactResult =
  | {
      ok: true;
      contactId: string;
      contactKey: string;
      contactNumber: number | null;
    }
  | { ok: false; error: string };

export type UpdateContactNameResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateContactDetailsResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateContactSummaryResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateContactOrganizationResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteContactResult =
  | { ok: true; redirectHref: string }
  | { ok: false; error: string };

export type UpdateContactAvatarResult =
  | { ok: true }
  | { ok: false; error: string };

function contactKeyFromName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 6);
  return (base || "person") + Math.floor(Math.random() * 90 + 10);
}

async function patchContact(
  contactId: string,
  body: Record<string, unknown>,
): Promise<ApiContact> {
  const { client, sync, refresh } = getMutationContext();
  await patchContactLocal(sync, contactId, body);
  const contact = await client.requestJson<ApiContact>(
    `/api/v1/contacts/${encodeURIComponent(contactId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  refresh();
  return contact;
}

export async function createContactAction(input: {
  name: string;
  organizationId?: string | null;
}): Promise<CreateContactResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Contact name is required." };
  const key = contactKeyFromName(name);
  const body = {
    key,
    name,
    organizationId: input.organizationId ?? null,
  };

  try {
    const { client, sync, refresh } = getMutationContext();
    if (sync?.ready) {
      const contactId = await sync.createMetadata(
        "contacts",
        toLocalFields(body),
      );
      refresh();
      return { ok: true, contactId, contactKey: key, contactNumber: null };
    }
    const contact = await client.requestJson<ApiContact>("/api/v1/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
    return {
      ok: true,
      contactId: contact.id,
      contactKey: contact.key,
      contactNumber: contact.number,
    };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateContactNameAction(input: {
  contactId: string;
  name: string;
}): Promise<UpdateContactNameResult> {
  if (!input.contactId.trim()) return { ok: false, error: "Contact is required." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Contact name is required." };
  try {
    await patchContact(input.contactId, { name });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateContactDetailsAction(input: {
  contactId: string;
  email?: string | null;
  title?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  socialAccounts?: { platform: string; url: string }[];
}): Promise<UpdateContactDetailsResult> {
  if (!input.contactId.trim()) return { ok: false, error: "Contact is required." };

  const body: Record<string, unknown> = {};
  if (input.email !== undefined) {
    const email = input.email?.trim() || null;
    if (email && !email.includes("@")) {
      return { ok: false, error: "Enter a valid email address." };
    }
    body.email = email;
  }
  if (input.title !== undefined) {
    body.title = input.title?.trim() || null;
  }
  if (input.phone !== undefined) {
    body.phone = input.phone?.trim() || null;
  }
  if (input.address !== undefined) {
    body.address = input.address?.trim() || null;
  }
  if (input.city !== undefined) {
    body.city = input.city?.trim() || null;
  }
  if (input.postalCode !== undefined) {
    body.postalCode = input.postalCode?.trim() || null;
  }
  if (input.country !== undefined) {
    body.country = input.country?.trim() || null;
  }
  if (input.socialAccounts !== undefined) {
    const accounts = input.socialAccounts
      .map((entry) => ({
        platform: entry.platform.trim(),
        url: entry.url.trim(),
      }))
      .filter((entry) => entry.platform.length > 0 && entry.url.length > 0);
    if (accounts.length > 20) {
      return { ok: false, error: "Too many social accounts." };
    }
    body.socialAccounts = accounts;
  }
  if (Object.keys(body).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  try {
    await patchContact(input.contactId, body);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateContactSummaryAction(input: {
  contactId: string;
  summary: string;
}): Promise<UpdateContactSummaryResult> {
  if (!input.contactId.trim()) return { ok: false, error: "Contact is required." };
  try {
    await patchContact(input.contactId, {
      summary: input.summary.trim() || null,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateContactOrganizationAction(input: {
  contactId: string;
  organizationId: string | null;
}): Promise<UpdateContactOrganizationResult> {
  if (!input.contactId.trim()) return { ok: false, error: "Contact is required." };
  try {
    await patchContact(input.contactId, {
      organizationId: input.organizationId,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function deleteContactAction(input: {
  contactId: string;
  pathname?: string;
}): Promise<DeleteContactResult> {
  if (!input.contactId.trim()) return { ok: false, error: "Contact is required." };
  try {
    const { client, sync, refresh } = getMutationContext();
    await patchContactLocal(sync, input.contactId, {
      deletedAt: new Date().toISOString(),
    });
    await client.requestJson(
      `/api/v1/contacts/${encodeURIComponent(input.contactId)}`,
      { method: "DELETE" },
    );
    refresh();
    return { ok: true, redirectHref: input.pathname?.trim() || "/contacts" };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function uploadContactAvatarAction(
  contactId: string,
  file: File,
): Promise<UpdateContactAvatarResult> {
  if (!contactId.trim()) return { ok: false, error: "Contact is required." };

  const fileError = assertAvatarFile(file);
  if (fileError) return { ok: false, error: fileError };

  try {
    const { client, sync, refresh } = getMutationContext();
    const contentType = resolveAvatarContentType(file);
    const avatar = await client.uploadAvatar(
      "contact",
      contactId,
      file,
      contentType,
    );
    await patchContactLocal(sync, contactId, {
      avatarStorageKey: avatar.storageKey,
      avatarContentType: avatar.contentType,
      updatedAt: avatar.updatedAt,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error, "Failed to upload avatar.") };
  }
}

export async function removeContactAvatarAction(
  contactId: string,
): Promise<UpdateContactAvatarResult> {
  if (!contactId.trim()) return { ok: false, error: "Contact is required." };

  try {
    const { client, sync, refresh } = getMutationContext();
    await client.deleteAvatar("contact", contactId);
    await patchContactLocal(sync, contactId, {
      avatarStorageKey: null,
      avatarContentType: null,
      updatedAt: new Date().toISOString(),
    });
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error, "Failed to remove avatar.") };
  }
}
