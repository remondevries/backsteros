/**
 * task-document-routes routes (OS-73 split from routes.ts).
 */
import type { Hono } from "./route-deps.js";

import { registerTasksRoutes } from "./task-document-routes/tasks-routes.js";
import { registerTaskCollaborationRoutes } from "./task-document-routes/task-collaboration-routes.js";
import { registerTaskMediaRoutes } from "./task-document-routes/task-media-routes.js";
import { registerDocumentsRoutes } from "./task-document-routes/documents-routes.js";
import { registerHabitsRoutes } from "./task-document-routes/habits-routes.js";
import { registerMeetingsRoutes } from "./task-document-routes/meetings-routes.js";
import { registerWhoopRoutes } from "./task-document-routes/whoop-routes.js";

export function registerTaskDocumentRoutes(app: Hono) {
  registerTasksRoutes(app);
  registerTaskCollaborationRoutes(app);
  registerTaskMediaRoutes(app);
  registerDocumentsRoutes(app);
  registerHabitsRoutes(app);
  registerMeetingsRoutes(app);
  registerWhoopRoutes(app);
}
