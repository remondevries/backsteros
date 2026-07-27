import { toTimestampMs } from "@/lib/sync/timestamps";

export type AssignableOrganization = {
  id: string;
  key: string;
  number: number | null;
  name: string;
  avatarStorageKey: string | null;
  avatarUpdatedAt: number;
};

export const PROJECT_ORGANIZATION_NONE = "__none__" as const;

export function mapOrganizationToAssignable(organization: {
  id: string;
  key: string;
  number: number | null;
  name: string;
  avatarStorageKey: string | null;
  updatedAt: Date | number | string;
}): AssignableOrganization {
  return {
    id: organization.id,
    key: organization.key,
    number: organization.number,
    name: organization.name,
    avatarStorageKey: organization.avatarStorageKey,
    avatarUpdatedAt: toTimestampMs(organization.updatedAt),
  };
}
