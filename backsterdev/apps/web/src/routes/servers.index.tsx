import { createFileRoute } from "@tanstack/react-router";

import { ServersDashboardPage } from "../components/servers/ServersDashboardPage";

export const Route = createFileRoute("/servers/")({
  component: ServersDashboardPage,
});
