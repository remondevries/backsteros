/**
 * Workspace snapshot entry point. The implementation lives in
 * `./workspace/` (per-entity hooks + shared query helpers); this module
 * re-exports the public surface so existing imports keep working.
 */
export {
  DesktopWorkspaceDataProvider,
  useDesktopWorkspaceData,
  useDesktopWorkspaceMeta,
  useDesktopWorkspaceInboxItems,
  useDesktopWorkspaceTasks,
  useDesktopWorkspaceProjects,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceDocuments,
  useDesktopWorkspaceActions,
  useWorkspaceSurfaceReady,
} from "./workspace/use-desktop-workspace-data";
export type {
  DesktopWorkspaceMeta,
  DesktopWorkspaceTasks,
  DesktopWorkspaceProjects,
  DesktopWorkspacePeople,
  DesktopWorkspaceDocuments,
  DesktopWorkspaceActions,
  WorkspaceSurface,
  WorkspaceSurfaceReady,
} from "./workspace/use-desktop-workspace-data";
export type { DesktopWorkspaceData } from "./workspace/workspace-data-types";
