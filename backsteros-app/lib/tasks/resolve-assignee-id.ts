import { getContactById } from "@/lib/db/queries/contacts";
import { getDefaultAssigneeId } from "@/lib/settings/default-assignee";

export function resolveTaskAssigneeId(
  assigneeId: string | null | undefined,
): string | null {
  const trimmed = assigneeId?.trim();
  if (trimmed) {
    const contact = getContactById(trimmed);
    return contact ? trimmed : getDefaultAssigneeId();
  }

  return getDefaultAssigneeId();
}
