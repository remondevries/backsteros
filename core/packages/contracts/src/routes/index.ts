import { initContract, type AppRouter } from "@ts-rest/core";

import { platformRoutes } from "./platform.js";
import { projectsTasksRoutes } from "./projects-tasks.js";
import { documentsSearchRoutes } from "./documents-search.js";
import { spacesRoutes } from "./spaces.js";
import { crmPortalRoutes } from "./crm-portal.js";
import { financeRoutes } from "./finance.js";
import { emailRoutes } from "./email.js";
import { integrationsRoutes } from "./integrations.js";
import { meetingsHabitsRoutes } from "./meetings-habits.js";
import { agentsChatRoutes } from "./agents-chat.js";

const c = initContract();

/** Main API router, merged from the per-domain routers in this folder. */
export const apiContract: AppRouter = c.router(
  {
    ...platformRoutes,
    ...projectsTasksRoutes,
    ...documentsSearchRoutes,
    ...spacesRoutes,
    ...crmPortalRoutes,
    ...financeRoutes,
    ...emailRoutes,
    ...integrationsRoutes,
    ...meetingsHabitsRoutes,
    ...agentsChatRoutes,
  },
  {
    pathPrefix: "",
  },
);

export { platformRoutes } from "./platform.js";
export { projectsTasksRoutes } from "./projects-tasks.js";
export { documentsSearchRoutes } from "./documents-search.js";
export { spacesRoutes } from "./spaces.js";
export { crmPortalRoutes } from "./crm-portal.js";
export { financeRoutes } from "./finance.js";
export { emailRoutes } from "./email.js";
export { integrationsRoutes } from "./integrations.js";
export { meetingsHabitsRoutes } from "./meetings-habits.js";
export { agentsChatRoutes } from "./agents-chat.js";
