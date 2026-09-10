/**
 * WordPress site components (deploy-contract.md).
 *
 * Gap vs contract: BacksterOS stores the WordPress flag as
 * `framework: "wordpress"` on app settings (equivalent to `runtime: "wordpress"`).
 * Components live in ~/.config/backsteros/app-wp-components.json — not a single git remote.
 */
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { findHetznerServer } from "./server-connection.ts";
import { loadAppSettings } from "./settings.ts";
import { normalizeServiceScope } from "./service-scope.ts";
import { sshExec } from "./ssh.ts";

export const SITE_COMPONENT_TYPES = [
  "theme",
  "platform_plugin",
  "client_plugin",
  "recipe_mu",
] as const;

export type SiteComponentType = (typeof SITE_COMPONENT_TYPES)[number];

export type SiteComponent = {
  readonly id: string;
  readonly type: SiteComponentType;
  readonly repo: string;
  readonly path: string;
  readonly ref: string;
  readonly autoDeploy: boolean;
  readonly rolloutGroup: string | null;
  readonly lastDeployAt: string | null;
  readonly lastDeployStatus: "success" | "failed" | "running" | "skipped" | null;
  readonly lastDeploySha: string | null;
  readonly updatedAt: string;
};

export type WordpressAppRecord = {
  readonly serverId: string;
  readonly service: string;
  /** Absolute path to site root on the host (compose / codebase root). */
  readonly siteRoot: string;
  readonly components: readonly SiteComponent[];
  readonly webhookToken: string;
  readonly updatedAt: string;
};

export type WordpressComponentJob = {
  readonly id: string;
  readonly serverId: string;
  readonly service: string;
  readonly componentId: string;
  readonly componentType: SiteComponentType;
  readonly repo: string;
  readonly path: string;
  readonly ref: string;
  readonly sha: string | null;
  readonly status: "queued" | "running" | "success" | "failed" | "skipped";
  readonly output: string;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
};

type ComponentsFile = {
  readonly apps: WordpressAppRecord[];
  readonly jobs: WordpressComponentJob[];
};

/** OV reference bindings from deploy-contract.md §4 (demo seed). */
export const OV_REFERENCE_COMPONENTS: readonly Omit<
  SiteComponent,
  "id" | "lastDeployAt" | "lastDeployStatus" | "lastDeploySha" | "updatedAt"
>[] = [
  {
    type: "theme",
    repo: "Lemo-Design/oosterlaarverhoeven",
    path: "wp-content/themes/oosterlaarverhoeven/",
    ref: "production",
    autoDeploy: true,
    rolloutGroup: null,
  },
  {
    type: "platform_plugin",
    repo: "Lemo-Design/wordpress-plugin-admin-dashboard",
    path: "wp-content/plugins/admin-dashboard/",
    ref: "main",
    autoDeploy: true,
    rolloutGroup: "platform",
  },
  {
    type: "recipe_mu",
    repo: "Lemo-Design/wordpress-recipe",
    path: "wp-content/mu-plugins/",
    ref: "main",
    autoDeploy: false,
    rolloutGroup: "recipe",
  },
];

const PLATFORM_CONCURRENCY = 3;
const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;

function componentsFilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "app-wp-components.json");
}

function readFile(): ComponentsFile {
  try {
    const raw = fs.readFileSync(componentsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as ComponentsFile;
    return {
      apps: Array.isArray(parsed.apps) ? parsed.apps : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
  } catch {
    return { apps: [], jobs: [] };
  }
}

function writeFile(data: ComponentsFile): void {
  const filePath = componentsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function newWebhookToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isSiteComponentType(value: unknown): value is SiteComponentType {
  return typeof value === "string" && (SITE_COMPONENT_TYPES as readonly string[]).includes(value);
}

function normalizeRepo(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/github\.com\//iu, "")
    .replace(/\.git$/iu, "")
    .replace(/^git@github\.com:/iu, "")
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "");
}

function normalizeComponentPath(value: string): string {
  let next = value.trim().replace(/\\/gu, "/");
  next = next.replace(/^\.\/+/u, "");
  if (next.startsWith("/")) next = next.slice(1);
  if (next && !next.endsWith("/")) next = `${next}/`;
  return next;
}

function normalizeRef(value: string): string {
  return value
    .trim()
    .replace(/^refs\/heads\//u, "")
    .replace(/^refs\/tags\//u, "");
}

/** Host directory name guesses from the control-plane service id. */
export function siteRootNameHints(service: string): readonly string[] {
  const raw = service.trim();
  if (!raw) return [];
  const hints = new Set<string>([raw]);
  if (raw.endsWith("-web")) hints.add(raw.slice(0, -4));
  if (raw.endsWith("-wordpress")) hints.add(raw.slice(0, -"-wordpress".length));
  if (raw.endsWith("-wp")) hints.add(raw.slice(0, -3));
  const first = raw.split("-")[0]?.trim();
  if (first) hints.add(first);
  return [...hints].filter(Boolean);
}

/**
 * Probe the Hetzner host for a WordPress compose / codebase root
 * (directory containing wp-content/, preferably matching component paths).
 */
export async function detectWordpressSiteRootOnHost(input: {
  readonly ip: string;
  readonly service: string;
  readonly componentPaths?: readonly string[];
}): Promise<string | null> {
  const hints = siteRootNameHints(input.service);
  const paths = (input.componentPaths ?? [])
    .map((entry) => normalizeComponentPath(entry).replace(/\/$/u, ""))
    .filter(Boolean);
  try {
    const raw = await sshExec(
      input.ip,
      [
        "python3 - <<'PY'",
        "import json, os, glob, subprocess",
        `hints = ${JSON.stringify(hints)}`,
        `component_paths = ${JSON.stringify(paths)}`,
        "candidates = []",
        "def add(path):",
        "  path = os.path.abspath(path.rstrip('/'))",
        "  if path and os.path.isdir(path) and path not in candidates:",
        "    candidates.append(path)",
        "for hint in hints:",
        "  add(f'/home/deploy/sites/{hint}')",
        "  add(f'/home/deploy/{hint}')",
        "  add(f'/var/www/{hint}')",
        "  add(f'/var/www/html/{hint}')",
        "for path in sorted(glob.glob('/home/deploy/sites/*')):",
        "  add(path)",
        "try:",
        "  out = subprocess.check_output(['docker','ps','--format','{{.Names}}'], text=True, stderr=subprocess.DEVNULL)",
        "  for name in out.splitlines():",
        "    name = name.strip()",
        "    if not name: continue",
        "    if not any(h and (name == h or name.startswith(h + '-') or h in name) for h in hints):",
        "      continue",
        "    inspect = json.loads(subprocess.check_output(['docker','inspect', name], text=True))[0]",
        "    for mount in inspect.get('Mounts') or []:",
        "      src = mount.get('Source') or ''",
        "      if src: add(src)",
        "      # Prefer compose project roots one level above mounted wp-content",
        "      if src.endswith('/wp-content') or src.endswith('/wp-content/'):",
        "        add(os.path.dirname(src.rstrip('/')))",
        "except Exception:",
        "  pass",
        "scored = []",
        "for root in candidates:",
        "  score = 0",
        "  if os.path.isdir(os.path.join(root, 'wp-content')): score += 10",
        "  if os.path.isfile(os.path.join(root, 'docker-compose.yml')) or os.path.isfile(os.path.join(root, 'compose.yml')): score += 3",
        "  for rel in component_paths:",
        "    if os.path.isdir(os.path.join(root, rel)) or os.path.isfile(os.path.join(root, rel)):",
        "      score += 5",
        "  if score > 0: scored.append({'path': root, 'score': score})",
        "scored.sort(key=lambda item: (-item['score'], item['path']))",
        "best = scored[0]['path'] if scored and scored[0]['score'] >= 10 else None",
        "print(json.dumps({'siteRoot': best, 'candidates': scored[:8]}))",
        "PY",
      ].join("\n"),
      { timeoutMs: 45_000 },
    );
    const parsed = JSON.parse(raw.trim()) as { readonly siteRoot?: string | null };
    const siteRoot = typeof parsed.siteRoot === "string" ? parsed.siteRoot.trim() : "";
    return siteRoot || null;
  } catch {
    return null;
  }
}

async function ensureAppSiteRoot(input: {
  readonly serverId: string;
  readonly service: string;
  readonly ip: string;
  readonly app: WordpressAppRecord;
  readonly force?: boolean;
}): Promise<WordpressAppRecord> {
  if (input.app.siteRoot.trim() && !input.force) return input.app;
  const detected = await detectWordpressSiteRootOnHost({
    ip: input.ip,
    service: input.service,
    componentPaths: input.app.components.map((component) => component.path),
  });
  if (!detected) return input.app;
  const next: WordpressAppRecord = {
    ...input.app,
    siteRoot: detected.replace(/\/$/u, ""),
    updatedAt: new Date().toISOString(),
  };
  writeFile(saveApp(readFile(), next));
  return next;
}

function githubRefMatches(componentRef: string, eventRef: string): boolean {
  const wanted = normalizeRef(componentRef);
  const incoming = eventRef.trim();
  if (!wanted || !incoming) return false;

  // Exact GitHub ref forms
  if (incoming === `refs/heads/${wanted}` || incoming === `refs/tags/${wanted}`) {
    return true;
  }
  if (incoming === wanted) return true;

  // Tags: component ref "v*" or "tags" → any tag; "v1.2.3" → that tag
  if (incoming.startsWith("refs/tags/")) {
    const tag = incoming.slice("refs/tags/".length);
    if (wanted === "tags" || wanted === "tag" || wanted === "v*") return true;
    if (wanted.endsWith("*")) {
      const prefix = wanted.slice(0, -1);
      return tag.startsWith(prefix);
    }
    return tag === wanted;
  }

  // Branches
  if (incoming.startsWith("refs/heads/")) {
    const branch = incoming.slice("refs/heads/".length);
    return branch === wanted;
  }

  return normalizeRef(incoming) === wanted;
}

function makeComponent(
  input: Omit<
    SiteComponent,
    "id" | "lastDeployAt" | "lastDeployStatus" | "lastDeploySha" | "updatedAt"
  > & { readonly id?: string },
): SiteComponent {
  const now = new Date().toISOString();
  return {
    id: input.id ?? randomUUID(),
    type: input.type,
    repo: normalizeRepo(input.repo),
    path: normalizeComponentPath(input.path),
    ref: input.ref.trim() || "main",
    autoDeploy: input.autoDeploy,
    rolloutGroup: input.rolloutGroup?.trim() || null,
    lastDeployAt: null,
    lastDeployStatus: null,
    lastDeploySha: null,
    updatedAt: now,
  };
}

async function resolveServer(serverId: string): Promise<{
  readonly serverId: string;
  readonly ip: string;
}> {
  const server = await findHetznerServer(serverId);
  if (!server) throw new Error("Server not found in Hetzner Cloud");
  const ip = server.public_net.ipv4?.ip;
  if (!ip) throw new Error("Server has no public IPv4 address");
  return { serverId: String(server.id), ip };
}

export async function assertWordpressApp(
  serverIdInput: string,
  serviceInput: string,
): Promise<{ readonly serverId: string; readonly service: string }> {
  const service = normalizeServiceScope(serviceInput);
  if (!service) throw new Error("service is required");
  const settings = await loadAppSettings(serverIdInput, service);
  if (settings.settings.framework !== "wordpress") {
    throw new Error('App framework must be "wordpress" to manage components');
  }
  return { serverId: settings.serverId, service };
}

function ensureAppRecord(
  file: ComponentsFile,
  serverId: string,
  service: string,
): { readonly file: ComponentsFile; readonly app: WordpressAppRecord } {
  const existing = file.apps.find(
    (entry) => entry.serverId === serverId && entry.service === service,
  );
  if (existing) return { file, app: existing };
  const now = new Date().toISOString();
  const app: WordpressAppRecord = {
    serverId,
    service,
    siteRoot: "",
    components: [],
    webhookToken: newWebhookToken(),
    updatedAt: now,
  };
  return { file: { ...file, apps: [app, ...file.apps] }, app };
}

function saveApp(file: ComponentsFile, app: WordpressAppRecord): ComponentsFile {
  const without = file.apps.filter(
    (entry) => !(entry.serverId === app.serverId && entry.service === app.service),
  );
  return { ...file, apps: [app, ...without] };
}

export type WordpressComponentsPayload = {
  readonly serverId: string;
  readonly service: string;
  readonly siteRoot: string;
  readonly webhookToken: string;
  readonly webhookUrl: string;
  readonly components: readonly SiteComponent[];
  readonly jobs: readonly WordpressComponentJob[];
};

function hookBaseUrl(): string {
  const fromEnv = process.env.BACKSTEROS_DEPLOY_HOOK_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/u, "");
  return "https://deploy.backsteros.com";
}

function buildWordpressWebhookUrl(token: string): string {
  const params = new URLSearchParams({ token });
  return `${hookBaseUrl()}/api/hetzner/wordpress-deploy-webhook?${params.toString()}`;
}

export async function loadWordpressComponents(
  serverIdInput: string,
  serviceInput: string,
): Promise<WordpressComponentsPayload> {
  const { serverId, service } = await assertWordpressApp(serverIdInput, serviceInput);
  let file = readFile();
  const existed = file.apps.some(
    (entry) => entry.serverId === serverId && entry.service === service,
  );
  const ensured = ensureAppRecord(file, serverId, service);
  if (!existed) {
    writeFile(ensured.file);
    file = ensured.file;
  }
  const app = ensured.app;
  const jobs = file.jobs
    .filter((job) => job.serverId === serverId && job.service === service)
    .slice(0, 40);
  return {
    serverId,
    service,
    siteRoot: app.siteRoot,
    webhookToken: app.webhookToken,
    webhookUrl: buildWordpressWebhookUrl(app.webhookToken),
    components: app.components,
    jobs,
  };
}

export async function updateWordpressSiteRoot(input: {
  readonly serverId: string;
  readonly service: string;
  readonly siteRoot: string;
}): Promise<WordpressComponentsPayload> {
  const { serverId, service } = await assertWordpressApp(input.serverId, input.service);
  let file = readFile();
  const ensured = ensureAppRecord(file, serverId, service);
  file = ensured.file;
  const next: WordpressAppRecord = {
    ...ensured.app,
    siteRoot: input.siteRoot.trim().replace(/\/$/u, ""),
    updatedAt: new Date().toISOString(),
  };
  writeFile(saveApp(file, next));
  return loadWordpressComponents(serverId, service);
}

export async function upsertWordpressComponent(input: {
  readonly serverId: string;
  readonly service: string;
  readonly id?: string;
  readonly type: SiteComponentType;
  readonly repo: string;
  readonly path: string;
  readonly ref: string;
  readonly autoDeploy: boolean;
  readonly rolloutGroup?: string | null;
}): Promise<WordpressComponentsPayload> {
  const { serverId, service } = await assertWordpressApp(input.serverId, input.service);
  if (!isSiteComponentType(input.type)) throw new Error("Invalid component type");
  if (!normalizeRepo(input.repo).includes("/")) {
    throw new Error("repo must be owner/name (e.g. Lemo-Design/oosterlaarverhoeven)");
  }
  if (!normalizeComponentPath(input.path)) {
    throw new Error("path is required (relative to site root)");
  }

  let file = readFile();
  const ensured = ensureAppRecord(file, serverId, service);
  file = ensured.file;
  const app = ensured.app;
  const now = new Date().toISOString();

  let components: SiteComponent[];
  if (input.id) {
    const existing = app.components.find((c) => c.id === input.id);
    if (!existing) throw new Error("Component not found");
    components = app.components.map((c) =>
      c.id === input.id
        ? {
            ...c,
            type: input.type,
            repo: normalizeRepo(input.repo),
            path: normalizeComponentPath(input.path),
            ref: input.ref.trim() || c.ref,
            autoDeploy: input.autoDeploy,
            rolloutGroup:
              input.rolloutGroup !== undefined
                ? input.rolloutGroup?.trim() || null
                : c.rolloutGroup,
            updatedAt: now,
          }
        : c,
    );
  } else {
    components = [
      makeComponent({
        type: input.type,
        repo: input.repo,
        path: input.path,
        ref: input.ref,
        autoDeploy: input.autoDeploy,
        rolloutGroup: input.rolloutGroup ?? null,
      }),
      ...app.components,
    ];
  }

  writeFile(
    saveApp(file, {
      ...app,
      components,
      updatedAt: now,
    }),
  );
  return loadWordpressComponents(serverId, service);
}

export async function deleteWordpressComponent(input: {
  readonly serverId: string;
  readonly service: string;
  readonly componentId: string;
}): Promise<WordpressComponentsPayload> {
  const { serverId, service } = await assertWordpressApp(input.serverId, input.service);
  let file = readFile();
  const ensured = ensureAppRecord(file, serverId, service);
  file = ensured.file;
  const next: WordpressAppRecord = {
    ...ensured.app,
    components: ensured.app.components.filter((c) => c.id !== input.componentId),
    updatedAt: new Date().toISOString(),
  };
  writeFile(saveApp(file, next));
  return loadWordpressComponents(serverId, service);
}

export async function seedOvWordpressComponents(input: {
  readonly serverId: string;
  readonly service: string;
  readonly replace?: boolean;
}): Promise<WordpressComponentsPayload> {
  const { serverId, service } = await assertWordpressApp(input.serverId, input.service);
  const { ip } = await resolveServer(serverId);
  let file = readFile();
  const ensured = ensureAppRecord(file, serverId, service);
  file = ensured.file;
  const seeded = OV_REFERENCE_COMPONENTS.map((c) => makeComponent(c));
  let next: WordpressAppRecord = {
    ...ensured.app,
    components: input.replace ? seeded : [...seeded, ...ensured.app.components],
    updatedAt: new Date().toISOString(),
  };
  writeFile(saveApp(file, next));
  // Fill site root from the host when missing.
  await ensureAppSiteRoot({
    serverId,
    service,
    ip,
    app: next,
  });
  return loadWordpressComponents(serverId, service);
}

export async function rotateWordpressWebhookToken(input: {
  readonly serverId: string;
  readonly service: string;
}): Promise<WordpressComponentsPayload> {
  const { serverId, service } = await assertWordpressApp(input.serverId, input.service);
  let file = readFile();
  const ensured = ensureAppRecord(file, serverId, service);
  file = ensured.file;
  writeFile(
    saveApp(file, {
      ...ensured.app,
      webhookToken: newWebhookToken(),
      updatedAt: new Date().toISOString(),
    }),
  );
  return loadWordpressComponents(serverId, service);
}

export type MatchedComponentDeploy = {
  readonly serverId: string;
  readonly service: string;
  readonly siteRoot: string;
  readonly component: SiteComponent;
};

/** Pure resolution used by webhook + tests (deploy-contract.md §5). */
export function resolveComponentDeploys(input: {
  readonly apps: readonly WordpressAppRecord[];
  readonly repository: string;
  readonly ref: string;
  readonly requireAutoDeploy?: boolean;
}): readonly MatchedComponentDeploy[] {
  const repo = normalizeRepo(input.repository);
  const requireAuto = input.requireAutoDeploy !== false;
  const matches: MatchedComponentDeploy[] = [];
  for (const app of input.apps) {
    for (const component of app.components) {
      if (normalizeRepo(component.repo) !== repo) continue;
      if (!githubRefMatches(component.ref, input.ref)) continue;
      if (requireAuto && !component.autoDeploy) continue;
      matches.push({
        serverId: app.serverId,
        service: app.service,
        siteRoot: app.siteRoot,
        component,
      });
    }
  }
  return matches;
}

function parseGithubWebhookBody(body: unknown): {
  readonly repository: string;
  readonly ref: string;
  readonly after: string | null;
} | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const repository = raw.repository;
  let repoName = "";
  if (typeof repository === "string") {
    repoName = repository;
  } else if (repository && typeof repository === "object") {
    const full = (repository as { full_name?: unknown }).full_name;
    if (typeof full === "string") repoName = full;
  }
  // Allow simplified control-plane payloads too.
  if (!repoName && typeof raw.repo === "string") repoName = raw.repo;

  let ref = typeof raw.ref === "string" ? raw.ref : "";
  if (!ref && typeof raw.branch === "string") ref = `refs/heads/${raw.branch}`;
  if (!ref && typeof raw.tag === "string") ref = `refs/tags/${raw.tag}`;

  const after =
    typeof raw.after === "string" ? raw.after : typeof raw.sha === "string" ? raw.sha : null;

  if (!repoName || !ref) return null;
  return { repository: repoName, ref, after };
}

async function runComponentDeployOnHost(input: {
  readonly ip: string;
  readonly siteRoot: string;
  readonly component: SiteComponent;
  readonly sha: string | null;
}): Promise<{ readonly exitCode: number; readonly output: string }> {
  if (!input.siteRoot.trim()) {
    return {
      exitCode: 0,
      output:
        "Skipped remote git steps: siteRoot is empty. Set site root in WordPress components, then re-run.",
    };
  }

  // Run as deploy when available — repos under /home/deploy are owned by deploy,
  // and root hits git "dubious ownership" / leaves root-owned files.
  const remote = [
    "if id deploy >/dev/null 2>&1; then RUNAS='sudo -u deploy -H'; else RUNAS=''; fi",
    "$RUNAS python3 - <<'PY'",
    "import json, os, subprocess",
    `site_root = ${JSON.stringify(input.siteRoot)}`,
    `rel = ${JSON.stringify(input.component.path)}`,
    `ref = ${JSON.stringify(normalizeRef(input.component.ref))}`,
    `ctype = ${JSON.stringify(input.component.type)}`,
    "target = os.path.join(site_root, rel)",
    "lines = []",
    "def run(cmd):",
    "  # Avoid dubious-ownership failures when uid still mismatches.",
    "  if cmd and cmd[0] == 'git':",
    "    cmd = ['git', '-c', 'safe.directory=*', *cmd[1:]]",
    "  lines.append('==> ' + ' '.join(cmd))",
    "  proc = subprocess.run(cmd, cwd=target, capture_output=True, text=True)",
    "  if proc.stdout: lines.append(proc.stdout.rstrip())",
    "  if proc.stderr: lines.append(proc.stderr.rstrip())",
    "  if proc.returncode != 0:",
    "    print(json.dumps({'exitCode': proc.returncode, 'output': '\\n'.join(lines)[-180000:]}))",
    "    raise SystemExit(0)",
    "if not os.path.isdir(target):",
    "  print(json.dumps({'exitCode': 1, 'output': f'Component path missing: {target}'}))",
    "  raise SystemExit(0)",
    "if not os.path.isdir(os.path.join(target, '.git')) and ctype != 'recipe_mu':",
    "  print(json.dumps({'exitCode': 1, 'output': f'Not a git checkout: {target}'}))",
    "  raise SystemExit(0)",
    "try:",
    "  if ctype == 'recipe_mu':",
    "    # recipe_mu: sync lemo-*.php from a checkout of wordpress-recipe if present,",
    "    # otherwise expect files already managed at path.",
    "    lines.append(f'==> recipe_mu sync at {target}')",
    "    if os.path.isdir(os.path.join(target, '.git')):",
    "      run(['git', 'fetch', 'origin'])",
    "      run(['git', 'checkout', ref])",
    "      run(['git', 'pull', '--ff-only'])",
    "    else:",
    "      lines.append('No .git in mu-plugins path; leaving files as-is (manual / tagged copy).')",
    "  else:",
    "    run(['git', 'fetch', 'origin'])",
    "    run(['git', 'checkout', ref])",
    "    run(['git', 'pull', '--ff-only'])",
    "  # Optional frontend build when package.json present and build/ missing",
    "  pkg = os.path.join(target, 'package.json')",
    "  build_dir = os.path.join(target, 'build')",
    "  if os.path.isfile(pkg) and not os.path.isdir(build_dir):",
    "    lines.append('==> npm ci && npm run build')",
    "    run(['npm', 'ci'])",
    "    run(['npm', 'run', 'build'])",
    "  # Post-deploy hooks (best-effort)",
    "  compose = os.path.join(site_root, 'docker-compose.yml')",
    "  if os.path.isfile(compose):",
    "    lines.append('==> PHP-FPM reload (OPcache)')",
    "    subprocess.run(['docker', 'compose', 'exec', '-T', 'php', 'kill', '-USR2', '1'], cwd=site_root, capture_output=True, text=True)",
    "  print(json.dumps({'exitCode': 0, 'output': '\\n'.join(lines)[-180000:]}))",
    "except SystemExit:",
    "  raise",
    "except Exception as exc:",
    "  print(json.dumps({'exitCode': 1, 'output': ('\\n'.join(lines) + '\\n' + str(exc))[-180000:]}))",
    "PY",
  ].join("\n");

  try {
    const raw = await sshExec(input.ip, remote, {
      timeoutMs: DEPLOY_TIMEOUT_MS + 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = JSON.parse(raw.trim()) as {
      readonly exitCode?: number;
      readonly output?: string;
    };
    return {
      exitCode: typeof parsed.exitCode === "number" ? parsed.exitCode : 1,
      output: parsed.output ?? "",
    };
  } catch (cause) {
    return {
      exitCode: 1,
      output: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function updateComponentDeployMeta(
  file: ComponentsFile,
  match: MatchedComponentDeploy,
  patch: Partial<SiteComponent>,
): ComponentsFile {
  const app = file.apps.find(
    (entry) => entry.serverId === match.serverId && entry.service === match.service,
  );
  if (!app) return file;
  const components = app.components.map((c) =>
    c.id === match.component.id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
  );
  return saveApp(file, { ...app, components, updatedAt: new Date().toISOString() });
}

async function executeMatchedDeploys(
  matches: readonly MatchedComponentDeploy[],
  sha: string | null,
): Promise<readonly WordpressComponentJob[]> {
  const resolvedMatches: MatchedComponentDeploy[] = [];
  const rootCache = new Map<string, string>();
  for (const match of matches) {
    if (match.siteRoot.trim()) {
      resolvedMatches.push(match);
      continue;
    }
    const cacheKey = `${match.serverId}:${match.service}`;
    let siteRoot = rootCache.get(cacheKey);
    if (siteRoot === undefined) {
      try {
        const { ip } = await resolveServer(match.serverId);
        const file = readFile();
        const app = file.apps.find(
          (entry) => entry.serverId === match.serverId && entry.service === match.service,
        );
        if (app) {
          const ensured = await ensureAppSiteRoot({
            serverId: match.serverId,
            service: match.service,
            ip,
            app,
          });
          siteRoot = ensured.siteRoot;
        } else {
          siteRoot = "";
        }
      } catch {
        siteRoot = "";
      }
      rootCache.set(cacheKey, siteRoot);
    }
    resolvedMatches.push({ ...match, siteRoot });
  }

  const themeAndClient = resolvedMatches.filter(
    (m) => m.component.type === "theme" || m.component.type === "client_plugin",
  );
  const platformish = resolvedMatches.filter(
    (m) => m.component.type === "platform_plugin" || m.component.type === "recipe_mu",
  );

  const jobs: WordpressComponentJob[] = [];
  const createdAt = new Date().toISOString();

  for (const match of [...themeAndClient, ...platformish]) {
    const job: WordpressComponentJob = {
      id: randomBytes(8).toString("hex"),
      serverId: match.serverId,
      service: match.service,
      componentId: match.component.id,
      componentType: match.component.type,
      repo: match.component.repo,
      path: match.component.path,
      ref: match.component.ref,
      sha,
      status: "queued",
      output: "",
      createdAt,
      startedAt: null,
      finishedAt: null,
    };
    jobs.push(job);
  }

  let file = readFile();
  file = { ...file, jobs: [...jobs, ...file.jobs].slice(0, 200) };
  writeFile(file);

  async function runOne(match: MatchedComponentDeploy, jobId: string): Promise<void> {
    let latest = readFile();
    const startedAt = new Date().toISOString();
    latest = {
      ...latest,
      jobs: latest.jobs.map((j) =>
        j.id === jobId ? { ...j, status: "running" as const, startedAt } : j,
      ),
    };
    latest = updateComponentDeployMeta(latest, match, {
      lastDeployStatus: "running",
    });
    writeFile(latest);

    let exitCode = 1;
    let output = "";
    try {
      const { ip } = await resolveServer(match.serverId);
      const result = await runComponentDeployOnHost({
        ip,
        siteRoot: match.siteRoot,
        component: match.component,
        sha,
      });
      exitCode = result.exitCode;
      output = result.output;
      if (!match.siteRoot.trim() && exitCode === 0) {
        // Recorded skip without host mutation.
        exitCode = 0;
      }
    } catch (cause) {
      output = cause instanceof Error ? cause.message : String(cause);
      exitCode = 1;
    }

    const finishedAt = new Date().toISOString();
    const status =
      !match.siteRoot.trim() && exitCode === 0
        ? ("skipped" as const)
        : exitCode === 0
          ? ("success" as const)
          : ("failed" as const);

    latest = readFile();
    latest = {
      ...latest,
      jobs: latest.jobs.map((j) =>
        j.id === jobId
          ? { ...j, status, output, finishedAt, startedAt: j.startedAt ?? startedAt }
          : j,
      ),
    };
    latest = updateComponentDeployMeta(latest, match, {
      lastDeployAt: finishedAt,
      lastDeployStatus: status,
      lastDeploySha: sha,
    });
    writeFile(latest);
  }

  // Theme/client: run sequentially per match (usually one site).
  for (const match of themeAndClient) {
    const job = jobs.find(
      (j) => j.componentId === match.component.id && j.service === match.service,
    );
    if (job) await runOne(match, job.id);
  }

  // Platform / recipe_mu: concurrency limit (deploy-contract.md §5).
  for (let i = 0; i < platformish.length; i += PLATFORM_CONCURRENCY) {
    const batch = platformish.slice(i, i + PLATFORM_CONCURRENCY);
    await Promise.all(
      batch.map(async (match) => {
        const job = jobs.find(
          (j) => j.componentId === match.component.id && j.service === match.service,
        );
        if (job) await runOne(match, job.id);
      }),
    );
  }

  const final = readFile();
  return jobs.map((job) => final.jobs.find((j) => j.id === job.id) ?? job);
}

export async function handleWordpressDeployWebhook(input: {
  readonly token: string;
  readonly body: unknown;
}): Promise<{
  readonly ok: boolean;
  readonly repository: string;
  readonly ref: string;
  readonly matched: number;
  readonly jobs: readonly WordpressComponentJob[];
}> {
  const token = input.token.trim();
  if (!token) throw new Error("token is required");

  const parsed = parseGithubWebhookBody(input.body);
  if (!parsed) throw new Error("Expected GitHub-style JSON with repository + ref");

  const file = readFile();
  const globalSecret = process.env.BACKSTEROS_WORDPRESS_WEBHOOK_SECRET?.trim();
  const matchingApps = file.apps.filter((app) => app.webhookToken === token);
  const useGlobal = Boolean(globalSecret && token === globalSecret);

  if (!useGlobal && matchingApps.length === 0) {
    throw new Error("Invalid WordPress deploy webhook token");
  }

  // Global secret fans out across all WordPress apps (platform rollouts).
  // Per-app token scopes to that site (theme / client plugin hooks).
  const appsToScan = useGlobal ? file.apps : matchingApps;

  const matches = resolveComponentDeploys({
    apps: appsToScan,
    repository: parsed.repository,
    ref: parsed.ref,
    requireAutoDeploy: true,
  });

  const jobs = await executeMatchedDeploys(matches, parsed.after);
  return {
    ok: true,
    repository: normalizeRepo(parsed.repository),
    ref: parsed.ref,
    matched: matches.length,
    jobs,
  };
}

export async function triggerWordpressComponentDeploy(input: {
  readonly serverId: string;
  readonly service: string;
  readonly componentId: string;
}): Promise<WordpressComponentsPayload> {
  const payload = await loadWordpressComponents(input.serverId, input.service);
  const { ip } = await resolveServer(payload.serverId);
  let app = readFile().apps.find(
    (entry) => entry.serverId === payload.serverId && entry.service === payload.service,
  );
  if (!app) throw new Error("WordPress app record missing");
  app = await ensureAppSiteRoot({
    serverId: payload.serverId,
    service: payload.service,
    ip,
    app,
  });
  const component = app.components.find((c) => c.id === input.componentId);
  if (!component) throw new Error("Component not found");

  await executeMatchedDeploys(
    [
      {
        serverId: app.serverId,
        service: app.service,
        siteRoot: app.siteRoot,
        component,
      },
    ],
    null,
  );
  return loadWordpressComponents(input.serverId, input.service);
}
