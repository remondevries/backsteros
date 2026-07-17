"use client";

import { useState } from "react";

import { getOrganizationAvatarSrc } from "@/lib/avatars/urls";
import type { AssignableOrganization } from "@/lib/organizations/assignable-organization";
import { OrganizationIcon } from "@/components/icons/organization-icon";
import { MobileRemoteImage } from "@/components/mobile/mobile-remote-image";

type OrganizationAssigneeIconProps = {
  organization: Pick<
    AssignableOrganization,
    "id" | "avatarStorageKey" | "avatarUpdatedAt"
  > | null;
  size?: number;
};

export function OrganizationAssigneeIcon({
  organization,
  size = 14,
}: OrganizationAssigneeIconProps) {
  const [failed, setFailed] = useState(false);

  if (organization?.avatarStorageKey && !failed) {
    return (
      <MobileRemoteImage
        kind="organization-avatar"
        entityId={organization.id}
        storageKey={organization.avatarStorageKey}
        fallbackSrc={getOrganizationAvatarSrc(
          organization.id,
          organization.avatarUpdatedAt,
        )}
        alt=""
        size={size}
        className="rounded-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return <OrganizationIcon size={size} className="text-foreground/70" />;
}
