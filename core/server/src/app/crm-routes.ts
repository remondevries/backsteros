/**
 * crm-routes routes (OS-73 split from routes.ts).
 */
import type { Hono } from "./route-deps.js";

import { registerOrganizationRoutes } from "./crm-routes/organizations-routes.js";
import { registerContactRoutes } from "./crm-routes/contacts-routes.js";
import { registerCrmRelationshipRoutes } from "./crm-routes/relationships-routes.js";
import { registerCrmGroupRoutes } from "./crm-routes/groups-routes.js";
import { registerAreaRoutes } from "./crm-routes/areas-routes.js";

export function registerCrmRoutes(app: Hono) {
  registerOrganizationRoutes(app);
  registerContactRoutes(app);
  registerCrmRelationshipRoutes(app);
  registerCrmGroupRoutes(app);
  registerAreaRoutes(app);
}
