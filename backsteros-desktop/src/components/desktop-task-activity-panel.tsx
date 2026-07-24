import { useCallback, useMemo } from "react";
import { useUser } from "@clerk/clerk-react";
import { TaskActivityPanel } from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";

type ContactLike = {
  id: string;
  email?: string | null;
};

export function DesktopTaskActivityPanel({
  taskId,
  taskUpdatedAt,
  contacts,
  contactAvatarSrc,
}: {
  taskId: string;
  taskUpdatedAt?: string | number | null;
  contacts: readonly ContactLike[];
  contactAvatarSrc: Record<string, string>;
}) {
  const { client } = useDesktopApi();
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
      map.set(contact.id, contactAvatarSrc[contact.id] ?? null);
    }
    return map;
  }, [contactAvatarSrc, contacts]);

  const avatarByEmail = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of contacts) {
      const email = contact.email?.trim().toLowerCase();
      if (!email) continue;
      const src = contactAvatarSrc[contact.id] ?? null;
      if (src) map.set(email, src);
    }
    return map;
  }, [contactAvatarSrc, contacts]);

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
