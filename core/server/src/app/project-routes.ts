/**
 * project-routes routes (OS-73 split from routes.ts).
 */
import type { Hono } from "./route-deps.js";

import { registerProjectCoreRoutes } from "./project-routes/projects-core-routes.js";
import { registerProjectUpdateRoutes } from "./project-routes/project-updates-routes.js";
import { registerProjectGithubRoutes } from "./project-routes/github-routes.js";
import { registerProjectInfraRoutes } from "./project-routes/infra-routes.js";
import { registerProjectFsRoutes } from "./project-routes/fs-routes.js";

export function registerProjectRoutes(app: Hono) {
  registerProjectCoreRoutes(app);
  registerProjectUpdateRoutes(app);
  registerProjectGithubRoutes(app);
  registerProjectInfraRoutes(app);
  registerProjectFsRoutes(app);
}
