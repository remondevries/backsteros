import type { Hono } from "hono";

import { registerTaskLabelRoutes } from "./task-label-routes.js";
import { registerDocumentPropertyTypeRoutes } from "./document-property-type-routes.js";
import { registerSearchRoutes } from "./search-routes.js";
import { registerProjectRoutes } from "./project-routes.js";
import { registerTaskDocumentRoutes } from "./task-document-routes.js";
import { registerCrmRoutes } from "./crm-routes.js";
import { registerLetterRoutes } from "./letter-routes.js";
import { registerSettingsRoutes } from "./settings-routes.js";
import { registerEmailRoutes } from "./email-routes.js";
import { registerChatRoutes } from "./chat-routes.js";
import { registerSocialRoutes } from "./social-routes.js";
import { withAuth } from "./route-shared.js";
import { registerFinanceRoutes } from "./finance-routes.js";
import { registerAgentAiRoutes } from "./agent-ai-routes.js";
import { registerApiKeyRoutes } from "./api-key-routes.js";
import { registerAgentMessageWebhookRoutes } from "./agent-message-webhook-routes.js";
import { registerAgentRoutes } from "./agent-routes.js";
import { registerAgentChatRoutes } from "./agent-chat-routes.js";
import { forbidden, getAuth, isAgentPersonaAuth } from "./route-helpers.js";

export function registerApiRoutes(app: Hono) {
  app.use("/api/v1/*", withAuth);
  // OS-146: agent persona keys never read/write integration settings.
  app.use("/api/v1/settings/*", async (c, next) => {
    if (isAgentPersonaAuth(getAuth(c))) {
      return c.json(forbidden(), 403);
    }
    await next();
  });
  registerTaskLabelRoutes(app);
  registerDocumentPropertyTypeRoutes(app);
  registerSearchRoutes(app);
  registerProjectRoutes(app);
  registerTaskDocumentRoutes(app);
  registerCrmRoutes(app);
  registerLetterRoutes(app);
  registerSettingsRoutes(app);
  registerEmailRoutes(app);
  registerChatRoutes(app);
  registerAgentMessageWebhookRoutes(app);
  registerAgentRoutes(app);
  registerAgentChatRoutes(app);
  registerSocialRoutes(app);
  registerFinanceRoutes(app);
  registerAgentAiRoutes(app);
  registerApiKeyRoutes(app);
}
