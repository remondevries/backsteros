export type StaticServer = {
  readonly id: string;
  readonly name: string;
  readonly ip: string;
  readonly role: string;
  readonly os: string;
  readonly sites: number;
  readonly jobs: number;
  readonly accent: string;
};

export type StaticSite = {
  readonly id: string;
  readonly domain: string;
  readonly repository: string;
  readonly runtime: string;
  readonly serverName: string;
  readonly deployedLabel: string;
  readonly accent: string;
  readonly initial: string;
};

export type StaticDeployment = {
  readonly id: string;
  readonly status: "success" | "failed";
  readonly commit: string | null;
  readonly siteDomain: string;
  readonly siteAccent: string;
  readonly siteInitial: string;
  readonly summary: string;
  readonly meta: string;
};

/** Placeholder servers until the deploy control plane is wired to core. */
export const STATIC_SERVERS: readonly StaticServer[] = [
  {
    id: "srv-hetzner-1",
    name: "hetzner-fsn1",
    ip: "65.21.xxx.xxx",
    role: "App server",
    os: "Ubuntu 24.04",
    sites: 4,
    jobs: 2,
    accent: "#3d9a6a",
  },
  {
    id: "srv-hetzner-2",
    name: "backsteros-core",
    ip: "167.235.xxx.xxx",
    role: "App server",
    os: "Ubuntu 24.04",
    sites: 2,
    jobs: 1,
    accent: "#5b8def",
  },
  {
    id: "srv-staging",
    name: "staging",
    ip: "49.12.xxx.xxx",
    role: "App server",
    os: "Ubuntu 22.04",
    sites: 1,
    jobs: 0,
    accent: "#c4922a",
  },
];

export const STATIC_SITES: readonly StaticSite[] = [
  {
    id: "site-platform",
    domain: "platform.kifungo-opleidingen.nl",
    repository: "kifungo-opleidingen / app",
    runtime: "Node 22",
    serverName: "hetzner-fsn1",
    deployedLabel: "Deployed 1 day ago",
    accent: "#7c5cbf",
    initial: "K",
  },
  {
    id: "site-agent",
    domain: "agent.backsteros.com",
    repository: "backsteros / agents",
    runtime: "Node 22",
    serverName: "backsteros-core",
    deployedLabel: "Deployed 3 days ago",
    accent: "#3d9a6a",
    initial: "A",
  },
  {
    id: "site-docs",
    domain: "docs.backsteros.com",
    repository: "backsteros / docs",
    runtime: "Static",
    serverName: "hetzner-fsn1",
    deployedLabel: "Deployed 5 days ago",
    accent: "#5b8def",
    initial: "D",
  },
];

export const STATIC_DEPLOYMENTS: readonly StaticDeployment[] = [
  {
    id: "dep-1",
    status: "success",
    commit: "20f1abc",
    siteDomain: "platform.kifungo-opleidingen.nl",
    siteAccent: "#7c5cbf",
    siteInitial: "K",
    summary: "Fix admin activity chart stretch",
    meta: "Deployed 1 day ago via Kamal",
  },
  {
    id: "dep-2",
    status: "success",
    commit: "9c4e12d",
    siteDomain: "agent.backsteros.com",
    siteAccent: "#3d9a6a",
    siteInitial: "A",
    summary: "Bump agent door health checks",
    meta: "Deployed 3 days ago via Compose",
  },
  {
    id: "dep-3",
    status: "failed",
    commit: "a81b0ef",
    siteDomain: "docs.backsteros.com",
    siteAccent: "#5b8def",
    siteInitial: "D",
    summary: "Publish deploy control-plane notes",
    meta: "Failed 4 days ago via Custom",
  },
  {
    id: "dep-4",
    status: "success",
    commit: null,
    siteDomain: "platform.kifungo-opleidingen.nl",
    siteAccent: "#7c5cbf",
    siteInitial: "K",
    summary: "Restart queue workers",
    meta: "Deployed 6 days ago via Custom",
  },
];

export const SERVERS_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", href: "/servers" },
  { id: "servers", label: "Servers", href: "/servers/servers" },
] as const;
