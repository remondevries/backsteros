"use client";

import { AvatarUpload } from "@/components/avatars/avatar-upload";
import { getOrganizationAvatarSrc } from "@/lib/avatars/urls";
import {
  removeOrganizationAvatarAction,
  uploadOrganizationAvatarAction,
} from "@/lib/mutations/organizations";

type OrganizationAvatarUploadProps = {
  organizationId: string;
  organizationName: string;
  avatarStorageKey: string | null;
  updatedAt: Date;
  onSaved?: () => void;
};

export function OrganizationAvatarUpload({
  organizationId,
  organizationName,
  avatarStorageKey,
  updatedAt,
  onSaved,
}: OrganizationAvatarUploadProps) {
  const avatarSrc = avatarStorageKey
    ? getOrganizationAvatarSrc(organizationId, updatedAt)
    : null;

  return (
    <AvatarUpload
      displayName={organizationName}
      avatarSrc={avatarSrc}
      onUpload={(file) => uploadOrganizationAvatarAction(organizationId, file)}
      onRemove={() => removeOrganizationAvatarAction(organizationId)}
      onSuccess={onSaved}
    />
  );
}
