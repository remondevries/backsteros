import { getServer, listServerActions, type HetznerServerAction } from "./cloud.ts";

export type ServerActivityItem = {
  readonly id: string;
  readonly title: string;
  readonly command: string;
  readonly status: "running" | "success" | "error";
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly actorName: string;
  readonly actorInitials: string;
  readonly errorMessage: string | null;
};

const ACTION_TITLES: Record<string, string> = {
  change_alias: "Changed DNS alias",
  change_dns_ptr: "Changed reverse DNS",
  change_protection: "Changed protection settings",
  change_server_type: "Changed server type",
  create_image: "Created image",
  create_server: "Created server",
  detach_iso: "Detached ISO",
  disable_backup: "Disabled backups",
  disable_rescue: "Disabled rescue mode",
  enable_backup: "Enabled backups",
  enable_rescue: "Enabled rescue mode",
  poweron_server: "Powered on server",
  poweroff_server: "Powered off server",
  reboot_server: "Rebooted server",
  rebuild_server: "Rebuilt server",
  request_console: "Opened console",
  reset_password: "Reset root password",
  reset_server: "Reset server",
  shutdown_server: "Shut down server",
  start_server: "Started server",
  stop_server: "Stopped server",
};

function humanizeCommand(command: string): string {
  const known = ACTION_TITLES[command];
  if (known) return known;
  const spaced = command.replaceAll("_", " ").trim();
  if (!spaced) return "Server action";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toActivityItem(action: HetznerServerAction): ServerActivityItem {
  return {
    id: String(action.id),
    title: humanizeCommand(action.command),
    command: action.command,
    status: action.status,
    startedAt: action.started,
    finishedAt: action.finished,
    actorName: "Hetzner",
    actorInitials: "HZ",
    errorMessage: action.error?.message ?? null,
  };
}

export async function loadServerActivity(serverId: string): Promise<{
  readonly serverId: string;
  readonly serverName: string;
  readonly items: readonly ServerActivityItem[];
}> {
  const server = await getServer(serverId);
  const actions = await listServerActions(server.id, { perPage: 50 });
  return {
    serverId: String(server.id),
    serverName: server.name,
    items: actions.map(toActivityItem),
  };
}
