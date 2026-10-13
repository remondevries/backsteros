/**
 * Stable React context identities for desktop workspace slices.
 * Kept in a rarely edited module so Vite HMR of the data hook does not
 * recreate contexts and leave consumers outside the provider.
 */
import { createContext } from "react";
import type { InboxListItem } from "@backsteros/ui";

import type { DesktopWorkspaceData } from "./workspace-data-types";
import type {
  WorkspaceSurface,
  WorkspaceSurfaceReady,
} from "./workspace-ready";

/** Meta + readiness — changes infrequently relative to entity rows. */
export type DesktopWorkspaceMeta = Pick<
  DesktopWorkspaceData,
  "source" | "ready" | "habits" | "meetings" | "areas"
> & {
  readyBySurface: WorkspaceSurfaceReady;
};

export type { WorkspaceSurface, WorkspaceSurfaceReady };

export type DesktopWorkspaceTasks = Pick<
  DesktopWorkspaceData,
  | "tasks"
  | "inboxTasks"
  | "allTasks"
  | "taskDescriptions"
  | "taskDetails"
>;

export type DesktopWorkspaceProjects = Pick<
  DesktopWorkspaceData,
  | "projects"
  | "letters"
  | "projectSummaries"
  | "projectDescriptions"
  | "letterBodies"
  | "letterRecords"
  | "projectDetails"
>;

export type DesktopWorkspacePeople = Pick<
  DesktopWorkspaceData,
  "contacts" | "organizations" | "contactDetails" | "organizationDetails"
>;

export type DesktopWorkspaceDocuments = Pick<
  DesktopWorkspaceData,
  | "documents"
  | "knowledgeDocuments"
  | "projectDocuments"
  | "journalItems"
  | "journalDocumentIdsByDate"
>;

export type DesktopWorkspaceActions = Omit<
  DesktopWorkspaceData,
  | keyof DesktopWorkspaceMeta
  | keyof DesktopWorkspaceTasks
  | keyof DesktopWorkspaceProjects
  | keyof DesktopWorkspacePeople
  | keyof DesktopWorkspaceDocuments
  | "inboxItems"
>;

export const DesktopWorkspaceMetaContext =
  createContext<DesktopWorkspaceMeta | null>(null);
export const DesktopWorkspaceInboxItemsContext = createContext<
  InboxListItem[] | null
>(null);
export const DesktopWorkspaceTasksContext =
  createContext<DesktopWorkspaceTasks | null>(null);
export const DesktopWorkspaceProjectsContext =
  createContext<DesktopWorkspaceProjects | null>(null);
export const DesktopWorkspacePeopleContext =
  createContext<DesktopWorkspacePeople | null>(null);
export const DesktopWorkspaceDocumentsContext =
  createContext<DesktopWorkspaceDocuments | null>(null);
export const DesktopWorkspaceActionsContext =
  createContext<DesktopWorkspaceActions | null>(null);
