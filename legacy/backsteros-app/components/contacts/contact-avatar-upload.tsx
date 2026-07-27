"use client";

import { AvatarUpload } from "@/components/avatars/avatar-upload";
import { getContactAvatarSrc } from "@/lib/avatars/urls";
import {
  removeContactAvatarAction,
  uploadContactAvatarAction,
} from "@/lib/mutations/contacts";

type ContactAvatarUploadProps = {
  contactId: string;
  contactName: string;
  avatarStorageKey: string | null;
  updatedAt: Date;
  onSaved?: () => void;
};

export function ContactAvatarUpload({
  contactId,
  contactName,
  avatarStorageKey,
  updatedAt,
  onSaved,
}: ContactAvatarUploadProps) {
  const avatarSrc = avatarStorageKey
    ? getContactAvatarSrc(contactId, updatedAt)
    : null;

  return (
    <AvatarUpload
      displayName={contactName}
      avatarSrc={avatarSrc}
      onUpload={(file) => uploadContactAvatarAction(contactId, file)}
      onRemove={() => removeContactAvatarAction(contactId)}
      onSuccess={onSaved}
    />
  );
}
