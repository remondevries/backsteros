import { createFileRoute } from "@tanstack/react-router";

import { ServersListPage } from "../components/servers/ServersListPage";

export const Route = createFileRoute("/servers/servers")({
  component: ServersListPage,
});
