/**
 * Whether a task should appear on a contact's Tasks tab:
 * assignee, structural contact scope, or Related contacts.
 */
export function taskInvolvesContact(
  task: {
    assigneeId?: string | null;
    contactId?: string | null;
    relatedContactIds?: readonly string[] | null;
  },
  contactId: string,
): boolean {
  if (!contactId) return false;
  if (task.assigneeId === contactId) return true;
  if (task.contactId === contactId) return true;
  const related = task.relatedContactIds;
  if (Array.isArray(related) && related.includes(contactId)) return true;
  return false;
}
