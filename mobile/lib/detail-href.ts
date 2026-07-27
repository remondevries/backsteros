/** Root-stack detail routes — back returns to the screen that opened them. */

export function taskDetailHref(taskId: string): `/task/${string}` {
  return `/task/${taskId}`;
}

export function projectDetailHref(projectId: string): `/project/${string}` {
  return `/project/${projectId}`;
}

export function documentDetailHref(documentId: string): `/document/${string}` {
  return `/document/${documentId}`;
}

export function letterDetailHref(letterId: string): `/letter/${string}` {
  return `/letter/${letterId}`;
}

export function contactDetailHref(contactId: string): `/contact/${string}` {
  return `/contact/${contactId}`;
}

export function organizationDetailHref(
  organizationId: string,
): `/organization/${string}` {
  return `/organization/${organizationId}`;
}
