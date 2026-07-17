"use client";

import { useState } from "react";

import { getContactAvatarSrc } from "@/lib/avatars/urls";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import { ContactPersonIcon } from "@/components/icons/contact-person-icon";
import { MobileRemoteImage } from "@/components/mobile/mobile-remote-image";

type AssigneeContactIconProps = {
  contact: Pick<
    AssignableContact,
    "id" | "avatarStorageKey" | "avatarUpdatedAt"
  > | null;
  size?: number;
};

export function AssigneeContactIcon({
  contact,
  size = 14,
}: AssigneeContactIconProps) {
  const [failed, setFailed] = useState(false);

  if (contact?.avatarStorageKey && !failed) {
    return (
      <MobileRemoteImage
        kind="contact-avatar"
        entityId={contact.id}
        storageKey={contact.avatarStorageKey}
        fallbackSrc={getContactAvatarSrc(contact.id, contact.avatarUpdatedAt)}
        alt=""
        size={size}
        className="rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return <ContactPersonIcon size={size} className="text-foreground/70" />;
}
