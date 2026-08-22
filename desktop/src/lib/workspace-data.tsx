/**
 * Workspace snapshot entry point. The implementation lives in
 * `./workspace/` (per-entity hooks + shared query helpers); this module
 * re-exports the public surface so existing imports keep working.
 */
export {
  DesktopWorkspaceDataProvider,
  useDesktopWorkspaceData,
} from "./workspace/use-desktop-workspace-data";
export type { DesktopWorkspaceData } from "./workspace/workspace-data-types";
