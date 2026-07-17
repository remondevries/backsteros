export type ComposeTaskTabField =
  | "description"
  | "status"
  | "dueDate"
  | "assignee"
  | "submit";

export type ComposeTaskTabFlowContext = {
  statusEnabled: boolean;
  assigneeEnabled: boolean;
};

const COMPOSE_TASK_TAB_SEQUENCE: ComposeTaskTabField[] = [
  "description",
  "status",
  "dueDate",
  "assignee",
  "submit",
];

function isComposeTaskTabFieldEnabled(
  field: ComposeTaskTabField,
  context: ComposeTaskTabFlowContext,
): boolean {
  if (field === "status") {
    return context.statusEnabled;
  }

  if (field === "assignee") {
    return context.assigneeEnabled;
  }

  return true;
}

export function getNextComposeTaskTabField(
  current: ComposeTaskTabField,
  context: ComposeTaskTabFlowContext,
): ComposeTaskTabField | null {
  const currentIndex = COMPOSE_TASK_TAB_SEQUENCE.indexOf(current);
  const startIndex = currentIndex === -1 ? 0 : currentIndex + 1;

  for (let index = startIndex; index < COMPOSE_TASK_TAB_SEQUENCE.length; index++) {
    const field = COMPOSE_TASK_TAB_SEQUENCE[index]!;
    if (isComposeTaskTabFieldEnabled(field, context)) {
      return field;
    }
  }

  return null;
}
