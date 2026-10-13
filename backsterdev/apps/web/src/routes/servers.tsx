import { createFileRoute } from "@tanstack/react-router";

import { ServersLayout } from "../components/servers/ServersLayout";

export const Route = createFileRoute("/servers")({
  component: ServersLayout,
});
