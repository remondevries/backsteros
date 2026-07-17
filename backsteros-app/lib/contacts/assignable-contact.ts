import { toTimestampMs } from "@/lib/sync/timestamps";

export type AssignableContact = {
  id: string;
  key: string;
  number: number | null;
  name: string;
  email: string | null;
  organizationId: string | null;
  organizationName: string | null;
  avatarStorageKey: string | null;
  avatarUpdatedAt: number;
};

export const TASK_ASSIGNEE_UNASSIGNED = "__unassigned__" as const;

export function mapContactToAssignable(contact: {
  id: string;
  key: string;
  number: number | null;
  name: string;
  email: string | null;
  organizationId: string | null;
  organization: { name: string } | null;
  avatarStorageKey: string | null;
  updatedAt: Date | number | string;
}): AssignableContact {
  return {
    id: contact.id,
    key: contact.key,
    number: contact.number,
    name: contact.name,
    email: contact.email,
    organizationId: contact.organizationId,
    organizationName: contact.organization?.name ?? null,
    avatarStorageKey: contact.avatarStorageKey,
    avatarUpdatedAt: toTimestampMs(contact.updatedAt),
  };
}
