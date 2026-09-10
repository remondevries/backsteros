export type StaticServerApp = {
  readonly id: string;
  readonly domain: string;
  readonly repository: string;
  readonly runtime: string;
  readonly deployedLabel: string;
  readonly accent: string;
  readonly initial: string;
};

export type StaticServerDatabase = {
  readonly id: string;
  readonly name: string;
};

export type StaticServerJob = {
  readonly id: string;
  readonly user: string;
  readonly command: string;
  readonly frequency: string;
  readonly installed: boolean;
};

export type StaticServerActivity = {
  readonly id: string;
  readonly summary: string;
  readonly domain: string;
  readonly meta: string;
  readonly accent: string;
  readonly initial: string;
};

export type StaticServerProfile = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: string;
  readonly status: "connected" | "disconnected";
  readonly accent: string;
  readonly initial: string;
  readonly details: {
    readonly hetznerId: string;
    readonly type: string;
    readonly databaseType: string;
    readonly region: string;
    readonly runtime: string;
    readonly os: string;
    readonly created: string;
  };
  readonly networking: {
    readonly publicIp: string;
    readonly privateIp: string | null;
  };
  readonly apps: readonly StaticServerApp[];
  readonly databases: readonly StaticServerDatabase[];
  readonly backgroundProcesses: readonly string[];
  readonly scheduledJobs: readonly StaticServerJob[];
  readonly backups: readonly string[];
  readonly activity: readonly StaticServerActivity[];
};

/** Static Forge-style profiles until each section is wired live. */
export const STATIC_SERVER_PROFILES: readonly StaticServerProfile[] = [
  {
    id: "165290762",
    slug: "lemodesign",
    name: "lemodesign",
    role: "App server",
    status: "connected",
    accent: "#5b8def",
    initial: "L",
    details: {
      hetznerId: "165290762",
      type: "App server",
      databaseType: "None",
      region: "Nuremberg, DE",
      runtime: "Docker / Kamal",
      os: "Ubuntu 24.04",
      created: "Sep 9, 2026",
    },
    networking: {
      publicIp: "46.225.171.3",
      privateIp: null,
    },
    apps: [
      {
        id: "app-kifungo",
        domain: "platform.kifungo-opleidingen.nl",
        repository: "lemo-design / kifungo",
        runtime: "Node 22",
        deployedLabel: "Deployed 4 hours ago",
        accent: "#5b8def",
        initial: "K",
      },
      {
        id: "app-blog",
        domain: "blog.lemo-design.com",
        repository: "lemo-design / lemodesign-blog",
        runtime: "Node 22",
        deployedLabel: "Deployed 10 minutes ago",
        accent: "#c4922a",
        initial: "B",
      },
      {
        id: "app-website",
        domain: "staging.lemo-design.com",
        repository: "lemo-design / lemodesign-website",
        runtime: "Static",
        deployedLabel: "Deployed 40 minutes ago",
        accent: "#7c5cbf",
        initial: "S",
      },
      {
        id: "app-rdv",
        domain: "remondevries.com",
        repository: "remondevries / remondevries-com",
        runtime: "Node 22",
        deployedLabel: "Deployed 24 minutes ago",
        accent: "#c45c5c",
        initial: "R",
      },
      {
        id: "app-hosting",
        domain: "lemo-hosting.com",
        repository: "lemo-design / lemohosting",
        runtime: "Node 22",
        deployedLabel: "Deployed 5 minutes ago",
        accent: "#3d9a6a",
        initial: "H",
      },
    ],
    databases: [],
    backgroundProcesses: [],
    scheduledJobs: [],
    backups: [],
    activity: [
      {
        id: "act-1",
        summary: "Deploying pushed code",
        domain: "lemo-hosting.com",
        meta: "5 minutes ago by accounts@remondevries.com via Kamal",
        accent: "#3d9a6a",
        initial: "H",
      },
      {
        id: "act-2",
        summary: "Deploying pushed code",
        domain: "blog.lemo-design.com",
        meta: "10 minutes ago by accounts@remondevries.com via Kamal",
        accent: "#c4922a",
        initial: "B",
      },
      {
        id: "act-3",
        summary: "Deploying pushed code",
        domain: "remondevries.com",
        meta: "24 minutes ago by accounts@remondevries.com via Kamal",
        accent: "#c45c5c",
        initial: "R",
      },
      {
        id: "act-4",
        summary: "Deploying pushed code",
        domain: "platform.kifungo-opleidingen.nl",
        meta: "4 hours ago by accounts@remondevries.com via Kamal",
        accent: "#5b8def",
        initial: "K",
      },
    ],
  },
];

export const SERVER_DETAIL_NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "apps", label: "Apps" },
  { id: "storage", label: "Storage" },
  { id: "processes", label: "Processes" },
  { id: "runtime", label: "Runtime" },
  { id: "observe", label: "Observe" },
  { id: "settings", label: "Settings" },
] as const;

export type ServerDetailTabId = (typeof SERVER_DETAIL_NAV_ITEMS)[number]["id"];

export function isServerDetailTabId(value: unknown): value is ServerDetailTabId {
  return typeof value === "string" && SERVER_DETAIL_NAV_ITEMS.some((item) => item.id === value);
}

export function resolveStaticServerProfile(serverId: string): StaticServerProfile | null {
  const normalized = serverId.trim().toLowerCase();
  return (
    STATIC_SERVER_PROFILES.find(
      (profile) =>
        profile.id === serverId ||
        profile.slug.toLowerCase() === normalized ||
        profile.name.toLowerCase() === normalized,
    ) ?? null
  );
}

export function listStaticServerProfiles(): readonly StaticServerProfile[] {
  return STATIC_SERVER_PROFILES;
}
