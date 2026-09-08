export type ComposeTaskTabField =
  | "description"
  | "status"
  | "dueDate"
  | "priority"
  | "assignee"
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
