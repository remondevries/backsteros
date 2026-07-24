"use client";

import { useCallback, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { TaskActivityPanel } from "@backsteros/ui";

import { useAppApi } from "@/lib/api-context";
import { getContactAvatarSrc } from "@/lib/avatars/urls";

type ContactLike = {
  id: string;
  email?: string | null;
  avatarStorageKey?: string | null;
  avatarUpdatedAt?: number | Date | null;
  updatedAt?: string | Date | number | null;
};

function contactAvatarUpdatedAt(contact: ContactLike): number {
  if (contact.avatarUpdatedAt != null) {
    return contact.avatarUpdatedAt instanceof Date
      ? contact.avatarUpdatedAt.getTime()
      : Number(contact.avatarUpdatedAt);
  }
  if (contact.updatedAt == null) return 0;
  if (contact.updatedAt instanceof Date) return contact.updatedAt.getTime();
  if (typeof contact.updatedAt === "number") return contact.updatedAt;
  const parsed = Date.parse(String(contact.updatedAt));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AppTaskActivityPanel({
  taskId,
  taskUpdatedAt,
  contacts,
}: {
  taskId: string;
  taskUpdatedAt?: string | number | null;
  contacts: readonly ContactLike[];
}) {
  const { client } = useAppApi();
  const { user } = useUser();

  const requestJson = useCallback(
    <T,>(path: string, init?: RequestInit) => client.requestJson<T>(path, init),
    [client],
  );

  const currentUser = useMemo(
    () => ({
      email:
        user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || null,
      imageUrl: user?.imageUrl?.trim() || null,
    }),
    [user?.imageUrl, user?.primaryEmailAddress?.emailAddress],
  );

  const assigneeAvatarById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of contacts) {
      if (!contact.avatarStorageKey) {
        map.set(contact.id, null);
        continue;
      }
      map.set(
        contact.id,
        getContactAvatarSrc(contact.id, contactAvatarUpdatedAt(contact)),
      );
    }
    return map;
  }, [contacts]);

  const avatarByEmail = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of contacts) {
      const email = contact.email?.trim().toLowerCase();
      if (!email) continue;
      const src = assigneeAvatarById.get(contact.id) ?? null;
      if (src) map.set(email, src);
    }
    return map;
  }, [assigneeAvatarById, contacts]);

  return (
    <TaskActivityPanel
      taskId={taskId}
      taskUpdatedAt={taskUpdatedAt}
      requestJson={requestJson}
      currentUser={currentUser}
      assigneeAvatarById={assigneeAvatarById}
      avatarByEmail={avatarByEmail}
    />
  );
}
