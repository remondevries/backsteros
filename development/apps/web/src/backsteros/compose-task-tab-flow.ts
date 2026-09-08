export type ComposeTaskTabField =
  | "description"
  | "status"
  | "dueDate"
  | "priority"
  | "assignee"
  | "cancel"
  | "submit";

export type ComposeTaskTabFlowContext = {
  readonly statusEnabled: boolean;
  readonly assigneeEnabled: boolean;
};

const COMPOSE_TASK_TAB_SEQUENCE: readonly ComposeTaskTabField[] = [
  "description",
  "status",
  "dueDate",
  "priority",
  "assignee",
  "cancel",
  "submit",
];

function isComposeTaskTabFieldEnabled(
  field: ComposeTaskTabField,
  context: ComposeTaskTabFlowContext,
): boolean {
  if (field === "status") return context.statusEnabled;
  if (field === "assignee") return context.assigneeEnabled;
  return true;
}

/** Desktop `getNextComposeTaskTabField` — Tab order through create-task controls. */
export function getNextComposeTaskTabField(
  current: ComposeTaskTabField,
  context: ComposeTaskTabFlowContext,
): ComposeTaskTabField | null {
  const currentIndex = COMPOSE_TASK_TAB_SEQUENCE.indexOf(current);
  const startIndex = currentIndex === -1 ? 0 : currentIndex + 1;

  for (let index = startIndex; index < COMPOSE_TASK_TAB_SEQUENCE.length; index += 1) {
    const field = COMPOSE_TASK_TAB_SEQUENCE[index];
    if (field && isComposeTaskTabFieldEnabled(field, context)) {
      return field;
    }
  }

  return null;
}

/** Shift+Tab order through create-task controls. */
export function getPreviousComposeTaskTabField(
  current: ComposeTaskTabField,
  context: ComposeTaskTabFlowContext,
): ComposeTaskTabField | null {
  const currentIndex = COMPOSE_TASK_TAB_SEQUENCE.indexOf(current);
  const startIndex = currentIndex === -1 ? COMPOSE_TASK_TAB_SEQUENCE.length - 1 : currentIndex - 1;

  for (let index = startIndex; index >= 0; index -= 1) {
    const field = COMPOSE_TASK_TAB_SEQUENCE[index];
    if (field && isComposeTaskTabFieldEnabled(field, context)) {
      return field;
    }
  }

  return null;
}

export function composeTaskTabFieldFromPropertyDropdownId(
  id: string | null | undefined,
): ComposeTaskTabField | null {
  switch (id) {
    case "status":
    case "dueDate":
    case "priority":
    case "assignee":
      return id;
    default:
      return null;
  }
}
