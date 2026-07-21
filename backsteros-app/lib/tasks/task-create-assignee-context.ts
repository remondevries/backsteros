import type { AssignableContact } from "@/lib/contacts/assignable-contact";
import { getDefaultAssigneeId } from "@/lib/settings/default-assignee";

export function getTaskCreateAssigneeContext(contacts: AssignableContact[] = []) {
  return {
    contacts,
    defaultAssigneeId: getDefaultAssigneeId(),
  };
}
