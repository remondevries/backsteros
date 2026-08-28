/** Surfaces that gate side-panel / list skeletons independently. */
export type WorkspaceSurface =
  | "inbox"
  | "tasks"
  | "projects"
  | "knowledge"
  | "journal"
  | "letters"
  | "contacts"
  | "organizations"
  | "calendar"
  | "habits";

export type WorkspaceSurfaceReady = Record<WorkspaceSurface, boolean>;

export type WorkspaceReadyInput = {
  authenticated: boolean;
  restHydrateSettled: boolean;
  queriesGracePeriodExpired: boolean;
  powerSyncReady: boolean;
  powerSyncStatus: string;
  localLoaded: {
    tasks: boolean;
    inboxTasks: boolean;
    projects: boolean;
    documents: boolean;
    letters: boolean;
    contacts: boolean;
    organizations: boolean;
    habits: boolean;
    meetings: boolean;
    areas: boolean;
  };
  apiLoaded: {
    tasks: boolean;
    inboxTasks: boolean;
    projects: boolean;
    documents: boolean;
    letters: boolean;
    contacts: boolean;
    organizations: boolean;
    habits: boolean;
    meetings: boolean;
    areas: boolean;
  };
};

type EntityKey = keyof WorkspaceReadyInput["localLoaded"];

function entityReady(
  input: WorkspaceReadyInput,
  keys: readonly EntityKey[],
): boolean {
  if (!input.authenticated) return true;
  if (input.powerSyncStatus === "error") return true;
  if (input.restHydrateSettled) return true;
  if (keys.some((key) => input.localLoaded[key])) return true;
  if (keys.some((key) => input.apiLoaded[key])) return true;
  if (input.powerSyncReady && input.queriesGracePeriodExpired) return true;
  return false;
}

export function computeWorkspaceSurfaceReady(
  input: WorkspaceReadyInput,
): WorkspaceSurfaceReady {
  return {
    inbox: entityReady(input, ["tasks", "inboxTasks", "projects"]),
    tasks: entityReady(input, ["tasks", "projects"]),
    projects: entityReady(input, ["projects"]),
    knowledge: entityReady(input, ["documents"]),
    journal: entityReady(input, ["documents", "habits", "meetings"]),
    letters: entityReady(input, ["letters", "projects"]),
    contacts: entityReady(input, ["contacts"]),
    organizations: entityReady(input, ["organizations"]),
    calendar: entityReady(input, ["tasks", "meetings", "habits"]),
    habits: entityReady(input, ["habits", "tasks"]),
  };
}

/** Backward-compatible global ready — true when any core list can render. */
export function computeWorkspaceGlobalReady(
  readyBySurface: WorkspaceSurfaceReady,
): boolean {
  return (
    readyBySurface.inbox ||
    readyBySurface.tasks ||
    readyBySurface.projects ||
    readyBySurface.knowledge
  );
}
