import { isHetznerCloudConfigured, listServers, type HetznerServer } from "./cloud.ts";
import { checkSshConnection } from "./ssh.ts";

export type ServerConnectionResult = {
  readonly connected: boolean;
  readonly serverId: string | null;
  readonly serverName: string | null;
  readonly hetznerStatus: string | null;
  readonly publicIp: string | null;
  readonly error: string | null;
};

export async function findHetznerServer(serverId: string): Promise<HetznerServer | null> {
  const servers = await listServers();
  const normalized = serverId.trim().toLowerCase();
  return (
    servers.find(
      (server) =>
        String(server.id) === serverId ||
        server.name.toLowerCase() === normalized ||
        server.name.toLowerCase() === serverId.trim().toLowerCase(),
    ) ?? null
  );
}

export async function checkServerConnection(serverId: string): Promise<ServerConnectionResult> {
  if (!isHetznerCloudConfigured()) {
    return {
      connected: false,
      serverId: null,
      serverName: null,
      hetznerStatus: null,
      publicIp: null,
      error: "Hetzner Cloud is not configured",
    };
  }

  const server = await findHetznerServer(serverId);
  if (!server) {
    return {
      connected: false,
      serverId: null,
      serverName: null,
      hetznerStatus: null,
      publicIp: null,
      error: "Server not found in Hetzner Cloud",
    };
  }

  const publicIp = server.public_net.ipv4?.ip ?? null;
  const base = {
    serverId: String(server.id),
    serverName: server.name,
    hetznerStatus: server.status,
    publicIp,
  };

  if (!publicIp) {
    return {
      ...base,
      connected: false,
      error: "No public IPv4 address",
    };
  }

  if (server.status !== "running") {
    return {
      ...base,
      connected: false,
      error: `Server is ${server.status}`,
    };
  }

  const ssh = await checkSshConnection(publicIp);
  return {
    ...base,
    connected: ssh.connected,
    error: ssh.connected ? null : (ssh.error ?? "SSH connection failed"),
  };
}
