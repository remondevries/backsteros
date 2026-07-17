"use client";

import type { Organization as ApiOrganization } from "@backsteros/contracts";

import {
  assertAvatarFile,
  resolveAvatarContentType,
} from "@/lib/avatars/utils";

import {
  apiErrorText,
  getMutationContext,
  patchOrganizationLocal,
  toLocalFields,
} from "./client";

export type CreateOrganizationResult =
  | {
      ok: true;
      organizationId: string;
      organizationKey: string;
      organizationNumber: number | null;
    }
  | { ok: false; error: string };

export type UpdateOrganizationNameResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateOrganizationDetailsResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateOrganizationSummaryResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteOrganizationResult =
  | { ok: true; redirectHref: string }
  | { ok: false; error: string };

export type UpdateOrganizationAvatarResult =
  | { ok: true }
  | { ok: false; error: string };

function organizationKeyFromName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 6);
  return (base || "org") + Math.floor(Math.random() * 90 + 10);
}

async function patchOrganization(
  organizationId: string,
  body: Record<string, unknown>,
): Promise<ApiOrganization> {
  const { client, sync, refresh } = getMutationContext();
  await patchOrganizationLocal(sync, organizationId, body);
  const organization = await client.requestJson<ApiOrganization>(
    `/api/v1/organizations/${encodeURIComponent(organizationId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  refresh();
  return organization;
}

export async function createOrganizationAction(input: {
  name: string;
}): Promise<CreateOrganizationResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Organization name is required." };
  const key = organizationKeyFromName(name);
  const body = { key, name };

  try {
    const { client, sync, refresh } = getMutationContext();
    if (sync?.ready) {
      const organizationId = await sync.createMetadata(
        "organizations",
        toLocalFields(body),
      );
      refresh();
      return {
        ok: true,
        organizationId,
        organizationKey: key,
        organizationNumber: null,
      };
    }
    const organization = await client.requestJson<ApiOrganization>(
      "/api/v1/organizations",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    refresh();
    return {
      ok: true,
      organizationId: organization.id,
      organizationKey: organization.key,
      organizationNumber: organization.number,
    };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateOrganizationNameAction(input: {
  organizationId: string;
  name: string;
}): Promise<UpdateOrganizationNameResult> {
  if (!input.organizationId.trim()) {
    return { ok: false, error: "Organization is required." };
  }
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Organization name is required." };
  try {
    await patchOrganization(input.organizationId, { name });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateOrganizationDetailsAction(input: {
  organizationId: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): Promise<UpdateOrganizationDetailsResult> {
  if (!input.organizationId.trim()) {
    return { ok: false, error: "Organization is required." };
  }

  const body: Record<string, unknown> = {};
  for (const field of [
    "phone",
    "email",
    "website",
    "address",
    "city",
    "postalCode",
    "country",
  ] as const) {
    if (input[field] !== undefined) {
      const value = input[field]?.trim() || null;
      if (field === "email" && value && !value.includes("@")) {
        return { ok: false, error: "Enter a valid email address." };
      }
      body[field] = value;
    }
  }

  if (Object.keys(body).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  try {
    await patchOrganization(input.organizationId, body);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateOrganizationSummaryAction(input: {
  organizationId: string;
  summary: string;
}): Promise<UpdateOrganizationSummaryResult> {
  if (!input.organizationId.trim()) {
    return { ok: false, error: "Organization is required." };
  }
  try {
    await patchOrganization(input.organizationId, {
      summary: input.summary.trim() || null,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function deleteOrganizationAction(input: {
  organizationId: string;
  pathname?: string;
}): Promise<DeleteOrganizationResult> {
  if (!input.organizationId.trim()) {
    return { ok: false, error: "Organization is required." };
  }
  try {
    const { client, sync, refresh } = getMutationContext();
    await patchOrganizationLocal(sync, input.organizationId, {
      deletedAt: new Date().toISOString(),
    });
    await client.requestJson(
      `/api/v1/organizations/${encodeURIComponent(input.organizationId)}`,
      { method: "DELETE" },
    );
    refresh();
    return {
      ok: true,
      redirectHref: input.pathname?.trim() || "/organizations",
    };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function uploadOrganizationAvatarAction(
  organizationId: string,
  file: File,
): Promise<UpdateOrganizationAvatarResult> {
  if (!organizationId.trim()) {
    return { ok: false, error: "Organization is required." };
  }

  const fileError = assertAvatarFile(file);
  if (fileError) return { ok: false, error: fileError };

  try {
    const { client, sync, refresh } = getMutationContext();
    const contentType = resolveAvatarContentType(file);
    const avatar = await client.uploadAvatar(
      "organization",
      organizationId,
      file,
      contentType,
    );
    await patchOrganizationLocal(sync, organizationId, {
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

export async function removeOrganizationAvatarAction(
  organizationId: string,
): Promise<UpdateOrganizationAvatarResult> {
  if (!organizationId.trim()) {
    return { ok: false, error: "Organization is required." };
  }

  try {
    const { client, sync, refresh } = getMutationContext();
    await client.deleteAvatar("organization", organizationId);
    await patchOrganizationLocal(sync, organizationId, {
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
