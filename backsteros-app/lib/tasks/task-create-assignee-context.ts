import type { AssignableContact } from "@/lib/contacts/assignable-contact";

export function getTaskCreateAssigneeContext(contacts: AssignableContact[] = []) {
  return {
    contacts,
    defaultAssigneeId: null as string | null,
  };
}
