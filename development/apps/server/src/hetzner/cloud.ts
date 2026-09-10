/**
 * Thin Hetzner Cloud API client for the Servers control plane.
 * Token: `HCLOUD_TOKEN`, or `~/.config/secrets/hetzner.env` as a local fallback.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HETZNER_CLOUD_API = "https://api.hetzner.cloud/v1";

export type HetznerLocation = {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly network_zone: string;
  readonly city: string;
  readonly country: string;
};

export type HetznerServerType = {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly cores: number;
  readonly memory: number;
  readonly disk: number;
  readonly architecture: string;
  readonly prices: readonly {
    readonly location: string;
    readonly price_monthly: { readonly gross: string };
  }[];
};

export type HetznerImage = {
  readonly id: number;
  readonly name: string | null;
  readonly description: string;
  readonly type: string;
  readonly os_flavor: string;
  readonly os_version: string | null;
  readonly architecture: string;
  readonly status: string;
};

export type HetznerSshKey = {
  readonly id: number;
  readonly name: string;
  readonly fingerprint: string;
};

export type HetznerServer = {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly public_net: {
    readonly ipv4: { readonly ip: string } | null;
  };
  readonly server_type: { readonly name: string };
  readonly image: { readonly name: string | null; readonly description: string } | null;
  readonly backup_window?: string | null;
  readonly location?: {
    readonly name: string;
    readonly city: string;
  } | null;
  readonly datacenter?: {
    readonly name: string;
    readonly location: { readonly name: string; readonly city: string };
  } | null;
};

export type HetznerBackupImage = {
  readonly id: number;
  readonly type: "backup" | "snapshot";
  readonly description: string;
  readonly status: string;
  readonly created: string;
  readonly disk_size: number;
  readonly image_size: number | null;
  readonly bound_to: number | null;
  readonly created_from: { readonly id: number; readonly name: string } | null;
  readonly os_flavor: string | null;
  readonly os_version: string | null;
};

export type CreateServerInput = {
  readonly name: string;
  readonly server_type: string;
  readonly image: string;
  readonly location: string;
  readonly ssh_keys?: readonly string[];
  readonly start_after_create?: boolean;
};

export type CreateServerResult = {
  readonly server: HetznerServer;
  readonly action: { readonly id: number; readonly status: string };
  readonly root_password: string | null;
};

export class HetznerCloudError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HetznerCloudError";
    this.status = status;
    this.body = body;
  }
}

function readTokenFromSecretsFile(): string | null {
  const filePath = path.join(os.homedir(), ".config", "secrets", "hetzner.env");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^(?:export\s+)?HCLOUD_TOKEN\s*=\s*(.*)$/.exec(trimmed);
      if (!match) continue;
      let value = match[1]?.trim() ?? "";
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value.length > 0 ? value : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveHetznerCloudToken(): string | null {
  const fromEnv = process.env.HCLOUD_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return readTokenFromSecretsFile();
}

export function isHetznerCloudConfigured(): boolean {
  return resolveHetznerCloudToken() != null;
}

async function hcloudFetch<T>(
  pathname: string,
  init?: RequestInit & { readonly query?: Record<string, string | undefined> },
): Promise<T> {
  const token = resolveHetznerCloudToken();
  if (!token) {
    throw new HetznerCloudError(
      "Hetzner Cloud is not configured. Set HCLOUD_TOKEN or ~/.config/secrets/hetzner.env",
      503,
      null,
    );
  }

  const url = new URL(`${HETZNER_CLOUD_API}${pathname}`);
  if (init?.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value != null && value !== "") url.searchParams.set(key, value);
    }
  }

  const { query: _query, ...requestInit } = init ?? {};
  const response = await fetch(url, {
    ...requestInit,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(requestInit.headers ?? {}),
    },
  });

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "message" in body.error &&
      typeof (body.error as { message: unknown }).message === "string"
        ? (body.error as { message: string }).message
        : `Hetzner Cloud request failed (${response.status})`;
    throw new HetznerCloudError(message, response.status, body);
  }

  return body as T;
}

export async function listLocations(): Promise<readonly HetznerLocation[]> {
  const data = await hcloudFetch<{ locations: HetznerLocation[] }>("/locations");
  return data.locations;
}

export async function listServerTypes(): Promise<readonly HetznerServerType[]> {
  const data = await hcloudFetch<{ server_types: HetznerServerType[] }>("/server_types");
  // Prefer current x86 shared/cloud types that are generally available.
  return data.server_types.filter(
    (type) =>
      (type.architecture === "x86" &&
        (type.name.startsWith("cx") || type.name.startsWith("cpx"))) ||
      (type.architecture === "arm" && type.name.startsWith("cax")),
  );
}

export async function listSystemImages(): Promise<readonly HetznerImage[]> {
  const data = await hcloudFetch<{ images: HetznerImage[] }>("/images", {
    query: { type: "system", status: "available", architecture: "x86" },
  });
  return data.images
    .filter((image) => image.name != null && image.status === "available")
    .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));
}

export async function listSshKeys(): Promise<readonly HetznerSshKey[]> {
  const data = await hcloudFetch<{ ssh_keys: HetznerSshKey[] }>("/ssh_keys");
  return data.ssh_keys;
}

export async function listServers(): Promise<readonly HetznerServer[]> {
  const data = await hcloudFetch<{ servers: HetznerServer[] }>("/servers");
  return data.servers;
}

export async function getServer(serverId: number | string): Promise<HetznerServer> {
  const data = await hcloudFetch<{ server: HetznerServer }>(`/servers/${serverId}`);
  return data.server;
}

export type HetznerCloudMetricsResponse = {
  readonly metrics: {
    readonly start: string;
    readonly end: string;
    readonly step: number;
    readonly time_series: Record<
      string,
      {
        readonly values: readonly (readonly [number, string])[];
      }
    >;
  };
};

export async function fetchServerCloudMetrics(
  serverId: number | string,
  input: {
    readonly type: string;
    readonly start: string;
    readonly end: string;
    readonly step?: number;
  },
): Promise<HetznerCloudMetricsResponse> {
  return hcloudFetch<HetznerCloudMetricsResponse>(`/servers/${serverId}/metrics`, {
    query: {
      type: input.type,
      start: input.start,
      end: input.end,
      step: input.step != null ? String(input.step) : undefined,
    },
  });
}

export type HetznerServerAction = {
  readonly id: number;
  readonly command: string;
  readonly started: string;
  readonly finished: string | null;
  readonly progress: number;
  readonly status: "running" | "success" | "error";
  readonly error: { readonly code: string; readonly message: string } | null;
};

export async function listServerActions(
  serverId: number | string,
  options?: { readonly perPage?: number },
): Promise<readonly HetznerServerAction[]> {
  const data = await hcloudFetch<{ actions: HetznerServerAction[] }>(
    `/servers/${serverId}/actions`,
    {
      query: {
        sort: "started:desc",
        per_page: String(options?.perPage ?? 50),
      },
    },
  );
  return data.actions;
}

export async function listServerBackupImages(
  serverId: number | string,
): Promise<readonly HetznerBackupImage[]> {
  const id = String(serverId);
  const [backups, snapshots] = await Promise.all([
    hcloudFetch<{ images: HetznerBackupImage[] }>("/images", {
      query: { type: "backup", bound_to: id, sort: "created:desc" },
    }),
    hcloudFetch<{ images: HetznerBackupImage[] }>("/images", {
      query: { type: "snapshot", sort: "created:desc" },
    }),
  ]);

  const relatedSnapshots = snapshots.images.filter(
    (image) => image.created_from != null && String(image.created_from.id) === id,
  );

  return [...backups.images, ...relatedSnapshots].sort(
    (a, b) => Date.parse(b.created) - Date.parse(a.created),
  );
}

export async function createServer(input: CreateServerInput): Promise<CreateServerResult> {
  const name = input.name.trim();
  if (!name) {
    throw new HetznerCloudError("Server name is required", 400, null);
  }
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(name)) {
    throw new HetznerCloudError(
      "Server name must be a valid hostname (letters, numbers, hyphens)",
      400,
      null,
    );
  }

  const data = await hcloudFetch<CreateServerResult>("/servers", {
    method: "POST",
    body: JSON.stringify({
      name,
      server_type: input.server_type,
      image: input.image,
      location: input.location,
      ssh_keys: input.ssh_keys?.length ? [...input.ssh_keys] : undefined,
      start_after_create: input.start_after_create ?? true,
    }),
  });
  return data;
}

export type HetznerCatalog = {
  readonly configured: true;
  readonly locations: readonly HetznerLocation[];
  readonly serverTypes: readonly HetznerServerType[];
  readonly images: readonly HetznerImage[];
  readonly sshKeys: readonly HetznerSshKey[];
};

export async function loadHetznerCatalog(): Promise<HetznerCatalog> {
  const [locations, serverTypes, images, sshKeys] = await Promise.all([
    listLocations(),
    listServerTypes(),
    listSystemImages(),
    listSshKeys(),
  ]);
  return { configured: true, locations, serverTypes, images, sshKeys };
}

export function monthlyPriceForLocation(
  serverType: HetznerServerType,
  locationName: string,
): string | null {
  const price = serverType.prices.find((entry) => entry.location === locationName);
  if (!price) return null;
  const gross = Number(price.price_monthly.gross);
  if (!Number.isFinite(gross)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(gross);
}
