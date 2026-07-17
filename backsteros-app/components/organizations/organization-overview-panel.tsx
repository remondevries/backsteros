"use client";

import { OrganizationAvatarUpload } from "@/components/organizations/organization-avatar-upload";
import { OrganizationOverviewDetailsForm } from "@/components/organizations/organization-overview-details-form";
import { OrganizationOverviewNameEditor } from "@/components/organizations/organization-overview-name-editor";
import type { Organization } from "@/lib/db/schema";
import { getOrganizationDisplayId } from "@/lib/organization-display-id";

type OrganizationOverviewPanelProps = {
  organization: Organization;
  onSaved?: () => void;
};

export function OrganizationOverviewPanel({
  organization,
  onSaved,
}: OrganizationOverviewPanelProps) {
  const displayId = getOrganizationDisplayId(organization);

  return (
    <article className="mx-auto flex w-full min-w-0 flex-col items-center text-foreground">
      <header className="flex w-full max-w-[800px] flex-col items-center gap-3 px-4 pt-6">
        <OrganizationAvatarUpload
          organizationId={organization.id}
          organizationName={organization.name}
          avatarStorageKey={organization.avatarStorageKey}
          updatedAt={organization.updatedAt}
          onSaved={onSaved}
        />
        {displayId ? (
          <p className="font-mono text-xs tabular-nums text-foreground/45">
            {displayId}
          </p>
        ) : null}
        <OrganizationOverviewNameEditor
          organizationId={organization.id}
          value={organization.name}
          onNameSaved={() => onSaved?.()}
        />
      </header>

      <div className="w-full max-w-[800px] px-4 pb-8 pt-8">
        <OrganizationOverviewDetailsForm
          organization={organization}
          onSaved={onSaved}
        />
      </div>
    </article>
  );
}
