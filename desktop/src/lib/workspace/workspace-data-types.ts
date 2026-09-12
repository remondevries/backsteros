import type { Dispatch, SetStateAction } from "react";
import type {
  Area as ApiArea,
  Contact as ApiContact,
  Letter as ApiLetter,
  Organization as ApiOrganization,
  Project as ApiProject,
  Habit as ApiHabit,
  Task as ApiTask,
  TaskLink,
} from "@backsteros/contracts";
import type {
  ContactListItem,
  InboxListItem,
  JournalListItem,
  KnowledgeListItem,
  LetterListItem,
  MeetingListItem,
  OrganizationListItem,
  ProjectOverviewRowProject,
  TaskItemRowTask,
} from "@backsteros/ui";

import type { useDesktopPowerSync } from "../powersync-context";

/** PowerSync context value shared with the workspace-data sub-hooks. */
export type WorkspacePowerSync = ReturnType<typeof useDesktopPowerSync>;

/** React state setter for a nullable list of API rows. */
export type ApiRowsSetter<T> = Dispatch<SetStateAction<T[] | null>>;

export type DesktopWorkspaceData = {
  source: "empty" | "powersync";
  ready: boolean;
  /** Non-inbox tasks — use for the Tasks list (`/tasks`). */
  tasks: TaskItemRowTask[];
  /** Inbox tasks with full metadata (assigneeId, etc.) — not in `tasks`. */
  inboxTasks: TaskItemRowTask[];
  /**
   * Non-inbox + inbox, deduped by id.
   * Use for contact/project/journal filters and task id lookups.
   */
  allTasks: TaskItemRowTask[];
  projects: Array<
    ProjectOverviewRowProject & {
      organizationId?: string | null;
      type?: string;
      localWorkingDirectory?: string | null;
      githubRepository?: string | null;
    }
  >;
  letters: LetterListItem[];
  meetings: MeetingListItem[];
  /** All documents (project + knowledge + journal metadata). */
  documents: KnowledgeListItem[];
  knowledgeDocuments: KnowledgeListItem[];
  projectDocuments: KnowledgeListItem[];
  journalItems: JournalListItem[];
  habits: ApiHabit[];
  inboxItems: InboxListItem[];
  contacts: ContactListItem[];
  organizations: OrganizationListItem[];
  areas: ApiArea[];
  projectSummaries: Record<string, string>;
  projectDescriptions: Record<string, string>;
  /** Session/detail descriptions — list SQL omits them; prefer useDesktopTaskDescription. */
  taskDescriptions: Record<string, string>;
  letterBodies: Record<string, string>;
  /** Full API task rows (includes links when REST hydrate filled them). */
  taskDetails: Record<string, ApiTask>;
  /** Full API project rows (includes summary/description when available). */
  projectDetails: Record<string, ApiProject>;
  /** journalDate → document id for content load/save. */
  journalDocumentIdsByDate: Record<string, string>;
  contactDetails: Record<string, ApiContact>;
  organizationDetails: Record<string, ApiOrganization>;
  letterRecords: Record<string, ApiLetter>;
  patchTask: (
    id: string,
    values: Record<string, unknown>,
  ) => Promise<{ number?: number } | void>;
  patchProject: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchLetter: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchMeeting: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchContact: (id: string, values: Record<string, unknown>) => Promise<void>;
  patchOrganization: (
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  softDeleteTask: (id: string) => Promise<void>;
  softDeleteProject: (id: string) => Promise<void>;
  softDeleteLetter: (id: string) => Promise<void>;
  softDeleteMeeting: (id: string) => Promise<void>;
  softDeleteContact: (id: string) => Promise<void>;
  softDeleteOrganization: (id: string) => Promise<void>;
  softDeleteDocument: (id: string) => Promise<void>;
  createOrganization: (input: {
    name: string;
  }) => Promise<{ id: string; key: string; number?: number | null }>;
  createContact: (input: {
    name?: string;
    firstName?: string;
    lastName?: string | null;
    organizationId?: string | null;
    email?: string | null;
  }) => Promise<{ id: string; key: string; number?: number | null }>;
  createProject: (input: {
    name: string;
    status?: string;
    area?: string | null;
    organizationId?: string | null;
    type?: string;
  }) => Promise<{ id: string; key: string }>;
  createArea: (input: {
    name: string;
    parent: "personal" | "business" | "clients";
  }) => Promise<{ id: string }>;
  softDeleteArea: (id: string) => Promise<void>;
  reloadHabits: () => Promise<ApiHabit[]>;
  createHabit: (input: {
    title: string;
    icon?: string | null;
  }) => Promise<ApiHabit>;
  updateHabit: (
    id: string,
    input: {
      title?: string;
      cadence?: ApiHabit["cadence"];
      icon?: string | null;
      description?: string | null;
      projectId?: string;
      nextDueYmd?: string;
    },
  ) => Promise<ApiHabit>;
  recordHabitDay: (
    habitId: string,
    input: { dueYmd: string; status: "completed" | "canceled" },
  ) => Promise<ApiTask>;
  createInboxTask: (input: {
    title: string;
    description?: string;
    status?: string;
    priority?: number;
    assigneeId?: string | null;
    relatedContactIds?: string[];
    relatedOrganizationIds?: string[];
    dueDate?: string | null;
    links?: TaskLink[];
    /** Default true. Pass false for Today/Tomorrow due-list creates. */
    inbox?: boolean;
    /** Mark as a Communication support ticket. */
    support?: boolean;
  }) => Promise<{ id: string; number: number | null }>;
  createProjectTask: (input: {
    projectId: string;
    title: string;
    description?: string;
    status?: string;
    priority?: number;
    assigneeId?: string | null;
    relatedContactIds?: string[];
    relatedOrganizationIds?: string[];
    dueDate?: string | null;
    links?: TaskLink[];
    /** Mark as a Communication support ticket. */
    support?: boolean;
  }) => Promise<{ id: string; number: number | null }>;
  /** Create a copy of an existing task (new id/number; no agent chat). */
  duplicateTask: (
    sourceId: string,
  ) => Promise<{ id: string; number: number | null }>;
  /**
   * Create a copy of an existing project (new id/key). Optionally copies
   * tasks; never copies agent chats, github repo, or local working directory.
   */
  duplicateProject: (
    sourceId: string,
    options?: { includeTasks?: boolean },
  ) => Promise<{ id: string; key: string }>;
  createLetter: (input: {
    title: string;
    body?: string;
    status?: string;
    organizationId?: string | null;
    contactId?: string | null;
    projectId?: string | null;
    dueDate?: string | null;
    receivedDate?: string | null;
  }) => Promise<{ id: string; number: number | null }>;
  createMeeting: (input: {
    title?: string;
    summary?: string | null;
    notes?: string | null;
    transcription?: string | null;
    status?: string;
    startAt: string;
    endAt: string;
  }) => Promise<{ id: string; number: number | null }>;
  createKnowledgeDocument: (input: {
    title: string;
    content?: string;
    folderPath?: string;
    parentId?: string | null;
  }) => Promise<{ id: string; path: string; contentVersion: number }>;
  createProjectDocument: (input: {
    projectId: string;
    title: string;
    content?: string;
    folderPath?: string;
    parentId?: string | null;
  }) => Promise<{ id: string; path: string; contentVersion: number }>;
  createKnowledgeFolder: (input: {
    title: string;
    parentId?: string | null;
  }) => Promise<{ id: string; path: string }>;
  createProjectFolder: (input: {
    projectId: string;
    title: string;
    parentId?: string | null;
  }) => Promise<{ id: string; path: string }>;
  renameDocument: (
    id: string,
    title: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateDocumentIcon: (
    id: string,
    icon: string | null,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  moveDocument: (
    id: string,
    parentId: string | null,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  reorderDocuments: (
    orderedIds: string[],
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  deleteDocument: (
    id: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Soft-pull document list from REST (agent creates before PowerSync). */
  softRefreshApiDocuments: () => Promise<void>;
};
