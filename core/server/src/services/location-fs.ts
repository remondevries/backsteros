/**
 * Directory browser for project Development / Production location fields and
 * the local working-directory picker (OS-111). Local lists the host filesystem;
 * development/production list over SSH (same host aliases as OS-106 checkout).
 * Paths are jailed under a configurable base so the picker never walks the
 * server root. Local defaults to `{projectBase}/Codebase`.
 */
import { access, constants, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  PROJECT_VAULT_CODEBASE_FOLDER,
  buildProjectVaultAbsolutePath,
} from "../lib/storage.js";

const execFileAsync = promisify(execFile);

export type LocationFsTarget = "local" | "development" | "production";

export type LocationFsEntry = {
  readonly name: string;
  /** Absolute POSIX path. */
  readonly path: string;
  readonly kind: "directory";
};

export type LocationFsListResult = {
  readonly target: LocationFsTarget;
  readonly base: string;
  readonly path: string;
  readonly exists: boolean;
  readonly writable: boolean;
  readonly entries: readonly LocationFsEntry[];
};

export type LocationFsCreateResult = {
  readonly target: LocationFsTarget;
  readonly path: string;
};

export class LocationFsError extends Error {
  readonly code: string;
  readonly status: 400 | 403 | 404 | 502;

  constructor(
    message: string,
    code: string,
    status: 400 | 403 | 404 | 502 = 400,
  ) {
    super(message);
    this.name = "LocationFsError";
    this.code = code;
    this.status = status;
  }
}

export type LocationFsExec = (
  file: string,
  args: readonly string[],
  options?: { readonly timeout?: number; readonly env?: NodeJS.ProcessEnv },
) => Promise<{ readonly stdout: string; readonly stderr: string }>;

export type LocationFsDeps = {
  readonly exec?: LocationFsExec;
  readonly env?: NodeJS.ProcessEnv;
  readonly homedir?: () => string;
  /** Absolute vault root (Projects lives under this). Used for target=local. */
  readonly vaultRoot?: string;
};

export type LocationFsScope = {
  /** Required for target=local — jail is `{vault}/Projects/{key}`. */
  readonly projectKey?: string;
};

const SSH_TIMEOUT_MS = 30_000;
const DEFAULT_REMOTE_BASE = "/home/deploy/Projects";

function envOf(deps: LocationFsDeps): NodeJS.ProcessEnv {
  return deps.env ?? process.env;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Absolute path to the default Local location: `{projectBase}/Codebase`. */
export function defaultLocalCodebasePath(projectBase: string): string {
  return path.join(projectBase, PROJECT_VAULT_CODEBASE_FOLDER);
}

/**
 * Resolve the local jail: `{vaultRoot}/Projects/{projectKey}`.
 * `BACKSTEROS_LOCAL_FS_ROOT` overrides the vault root (still appends Projects/key).
 */
export function resolveLocalProjectBase(
  projectKey: string,
  deps: LocationFsDeps = {},
): string {
  const key = projectKey.trim();
  if (!key) {
    throw new LocationFsError(
      "projectKey is required for local location browsing",
      "fs_project_required",
    );
  }
  const env = envOf(deps);
  const rootOverride = env.BACKSTEROS_LOCAL_FS_ROOT?.trim();
  const vaultRoot = rootOverride
    ? path.resolve(rootOverride)
    : deps.vaultRoot?.trim()
      ? path.resolve(deps.vaultRoot.trim())
      : path.resolve((deps.homedir ?? homedir)(), "BacksterOS");
  // When override is already a …/Projects leaf, treat it as the Projects parent.
  const projectsParent = path.basename(vaultRoot) === "Projects"
    ? path.dirname(vaultRoot)
    : vaultRoot;
  return buildProjectVaultAbsolutePath(projectsParent, key);
}

export function resolveLocationFsBase(
  target: LocationFsTarget,
  deps: LocationFsDeps = {},
  scope: LocationFsScope = {},
): string {
  const env = envOf(deps);
  if (target === "local") {
    if (!scope.projectKey?.trim()) {
      throw new LocationFsError(
        "projectKey is required for local location browsing",
        "fs_project_required",
      );
    }
    return resolveLocalProjectBase(scope.projectKey, deps);
  }
  if (target === "development") {
    const configured = env.BACKSTEROS_DEVELOPMENT_FS_ROOT?.trim();
    return configured || DEFAULT_REMOTE_BASE;
  }
  const configured = env.BACKSTEROS_PRODUCTION_FS_ROOT?.trim();
  return configured || DEFAULT_REMOTE_BASE;
}

export function resolveLocationFsSshHost(
  target: "development" | "production",
  deps: LocationFsDeps = {},
): string {
  const env = envOf(deps);
  if (target === "development") {
    return (
      env.BACKSTEROS_DEVELOPMENT_SSH_HOST?.trim() ||
      "development"
    );
  }
  return env.BACKSTEROS_PRODUCTION_SSH_HOST?.trim() || "production";
}

/** Normalize an absolute POSIX path; reject empty / relative / `..` segments. */
export function normalizeAbsolutePath(input: string | undefined | null): string {
  const raw = (input ?? "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (!raw.startsWith("/")) {
    throw new LocationFsError(
      "Path must be absolute",
      "fs_path_invalid",
    );
  }
  const segments = raw.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new LocationFsError(
      "Path must not contain '.' or '..' segments",
      "fs_path_outside_root",
      403,
    );
  }
  return `/${segments.join("/")}`;
}

function isPathInsideBase(base: string, candidate: string): boolean {
  const baseNorm = base.endsWith("/") ? base.slice(0, -1) : base;
  const candidateNorm = candidate.endsWith("/")
    ? candidate.slice(0, -1)
    : candidate;
  return (
    candidateNorm === baseNorm || candidateNorm.startsWith(`${baseNorm}/`)
  );
}

function defaultExec(): LocationFsExec {
  return async (file, args, options) => {
    const result = await execFileAsync(file, [...args], {
      timeout: options?.timeout,
      env: options?.env,
      maxBuffer: 2 * 1024 * 1024,
    });
    return {
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
    };
  };
}

async function ensureLocalBase(base: string): Promise<string> {
  await mkdir(base, { recursive: true });
  return realpath(base);
}

async function listLocal(
  baseConfigured: string,
  pathInput: string | undefined,
): Promise<LocationFsListResult> {
  const baseReal = await ensureLocalBase(baseConfigured);
  const requested = normalizeAbsolutePath(pathInput) || baseReal;
  if (!isPathInsideBase(baseReal, requested) && requested !== baseReal) {
    // requested may not be realpath'd yet; compare against configured base too
    if (!isPathInsideBase(baseConfigured, requested)) {
      throw new LocationFsError(
        "Path is outside the allowed base",
        "fs_path_outside_root",
        403,
      );
    }
  }

  let absolute: string;
  let exists = true;
  try {
    absolute = await realpath(requested);
  } catch {
    exists = false;
    absolute = path.resolve(requested);
    if (!isPathInsideBase(baseReal, absolute)) {
      throw new LocationFsError(
        "Path is outside the allowed base",
        "fs_path_outside_root",
        403,
      );
    }
    return {
      target: "local",
      base: baseReal,
      path: absolute,
      exists: false,
      writable: false,
      entries: [],
    };
  }

  if (!isPathInsideBase(baseReal, absolute)) {
    throw new LocationFsError(
      "Path is outside the allowed base",
      "fs_path_outside_root",
      403,
    );
  }

  const info = await stat(absolute);
  if (!info.isDirectory()) {
    throw new LocationFsError("Path is not a directory", "fs_not_directory");
  }

  let writable = false;
  try {
    await access(absolute, constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }

  const dirents = await readdir(absolute, { withFileTypes: true });
  const entries: LocationFsEntry[] = [];
  for (const dirent of dirents) {
    const name = dirent.name;
    if (!name || name.startsWith(".")) continue;
    let isDir = dirent.isDirectory();
    if (!isDir && (dirent.isSymbolicLink() || !dirent.isFile())) {
      try {
        const childInfo = await stat(path.join(absolute, name));
        isDir = childInfo.isDirectory();
      } catch {
        continue;
      }
    }
    if (!isDir) continue;
    entries.push({
      name,
      path: path.posix.join(absolute.split(path.sep).join("/"), name),
      kind: "directory",
    });
  }
  entries.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  return {
    target: "local",
    base: baseReal,
    path: absolute.split(path.sep).join("/"),
    exists,
    writable,
    entries,
  };
}

async function createLocalFolder(
  baseConfigured: string,
  parentInput: string,
  name: string,
): Promise<LocationFsCreateResult> {
  const trimmedName = name.trim();
  if (
    !trimmedName ||
    trimmedName === "." ||
    trimmedName === ".." ||
    trimmedName.includes("/") ||
    trimmedName.includes("\\") ||
    trimmedName.includes("\0")
  ) {
    throw new LocationFsError("Invalid folder name", "fs_invalid_name");
  }

  const baseReal = await ensureLocalBase(baseConfigured);
  const parentNorm = normalizeAbsolutePath(parentInput) || baseReal;
  let parentReal: string;
  try {
    parentReal = await realpath(parentNorm);
  } catch {
    throw new LocationFsError("Parent directory was not found", "fs_not_found", 404);
  }
  if (!isPathInsideBase(baseReal, parentReal)) {
    throw new LocationFsError(
      "Path is outside the allowed base",
      "fs_path_outside_root",
      403,
    );
  }
  const absolute = path.join(parentReal, trimmedName);
  if (!isPathInsideBase(baseReal, absolute)) {
    throw new LocationFsError(
      "Path is outside the allowed base",
      "fs_path_outside_root",
      403,
    );
  }
  try {
    await mkdir(absolute, { recursive: false });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    if (code === "EEXIST") {
      throw new LocationFsError("Folder already exists", "fs_already_exists");
    }
    throw new LocationFsError(
      "Could not create folder",
      "fs_create_failed",
    );
  }
  return {
    target: "local",
    path: absolute.split(path.sep).join("/"),
  };
}

/** Remote Python helper: list dirs / mkdir under a jailed base. */
export function buildRemoteLocationFsScript(): string {
  // Kept as one remote `-c` payload; intentional minimal Python (no deps).
  return [
    "import json, os, sys, stat",
    "def die(code, message, status=400):",
    '    print(json.dumps({"ok": False, "code": code, "message": message, "status": status}))',
    "    sys.exit(0)",
    "def normalize(p):",
    '    p = (p or "").strip().replace(chr(92), "/")',
    '    if not p: return ""',
    '    if not p.startswith("/"): die("fs_path_invalid", "Path must be absolute")',
    '    parts = [s for s in p.split("/") if s]',
    '    if any(s in (".", "..") for s in parts): die("fs_path_outside_root", "Path must not contain . or .. segments", 403)',
    '    return "/" + "/".join(parts)',
    "def inside(base, candidate):",
    '    b = base.rstrip("/")',
    '    c = candidate.rstrip("/")',
    '    return c == b or c.startswith(b + "/")',
    "def ensure_base(base):",
    "    os.makedirs(base, mode=0o755, exist_ok=True)",
    "    return os.path.realpath(base)",
    "op = sys.argv[1]; base_in = sys.argv[2]",
    'path_in = sys.argv[3] if len(sys.argv) > 3 else ""',
    'name_in = sys.argv[4] if len(sys.argv) > 4 else ""',
    "base = ensure_base(normalize(base_in) or base_in)",
    "requested = normalize(path_in) or base",
    'if op == "list":',
    '    if not inside(base, requested) and requested != base: die("fs_path_outside_root", "Path is outside the allowed base", 403)',
    "    if not os.path.exists(requested):",
    '        if not inside(base, requested): die("fs_path_outside_root", "Path is outside the allowed base", 403)',
    '        print(json.dumps({"ok": True, "base": base, "path": requested, "exists": False, "writable": False, "entries": []})); sys.exit(0)',
    "    real = os.path.realpath(requested)",
    '    if not inside(base, real): die("fs_path_outside_root", "Path is outside the allowed base", 403)',
    '    if not os.path.isdir(real): die("fs_not_directory", "Path is not a directory")',
    "    writable = os.access(real, os.W_OK); entries = []",
    "    try: names = sorted(os.listdir(real), key=lambda n: n.lower())",
    '    except OSError: die("fs_list_failed", "Could not list directory", 502)',
    "    for name in names:",
    '        if not name or name.startswith("."): continue',
    "        child = os.path.join(real, name)",
    "        try: st = os.stat(child)",
    "        except OSError: continue",
    "        if not stat.S_ISDIR(st.st_mode): continue",
    '        entries.append({"name": name, "path": child, "kind": "directory"})',
    '    print(json.dumps({"ok": True, "base": base, "path": real, "exists": True, "writable": writable, "entries": entries})); sys.exit(0)',
    'if op == "mkdir":',
    '    name = (name_in or "").strip()',
    '    if (not name or name in (".", "..") or "/" in name or chr(92) in name or chr(0) in name): die("fs_invalid_name", "Invalid folder name")',
    "    parent = normalize(path_in) or base",
    '    if not os.path.isdir(parent): die("fs_not_found", "Parent directory was not found", 404)',
    "    parent_real = os.path.realpath(parent)",
    '    if not inside(base, parent_real): die("fs_path_outside_root", "Path is outside the allowed base", 403)',
    "    absolute = os.path.join(parent_real, name)",
    '    if not inside(base, absolute): die("fs_path_outside_root", "Path is outside the allowed base", 403)',
    '    if os.path.exists(absolute): die("fs_already_exists", "Folder already exists")',
    "    try: os.mkdir(absolute, 0o755)",
    '    except OSError as exc: die("fs_create_failed", "Could not create folder: %s" % exc)',
    '    print(json.dumps({"ok": True, "path": absolute})); sys.exit(0)',
    'die("fs_invalid_op", "Unknown operation")',
  ].join("\n");
}

type RemoteOkList = {
  ok: true;
  base: string;
  path: string;
  exists: boolean;
  writable: boolean;
  entries: LocationFsEntry[];
};

type RemoteOkCreate = {
  ok: true;
  path: string;
};

type RemoteErr = {
  ok: false;
  code: string;
  message: string;
  status?: number;
};

async function runRemote(
  target: "development" | "production",
  op: "list" | "mkdir",
  base: string,
  pathArg: string,
  nameArg: string,
  deps: LocationFsDeps,
): Promise<RemoteOkList | RemoteOkCreate> {
  const exec = deps.exec ?? defaultExec();
  const host = resolveLocationFsSshHost(target, deps);
  const script = buildRemoteLocationFsScript();
  const remoteCmd = [
    "python3",
    "-c",
    shellSingleQuote(script),
    op,
    shellSingleQuote(base),
    shellSingleQuote(pathArg || ""),
    shellSingleQuote(nameArg || ""),
  ].join(" ");

  let stdout: string;
  let stderr: string;
  try {
    const result = await exec(
      "ssh",
      [
        "-A",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=15",
        host,
        `bash -lc ${shellSingleQuote(remoteCmd)}`,
      ],
      { timeout: SSH_TIMEOUT_MS, env: envOf(deps) },
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "SSH directory listing failed";
    const errStderr =
      error &&
      typeof error === "object" &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr
        : "";
    throw new LocationFsError(
      (errStderr.trim() || message).slice(0, 500),
      "fs_ssh_failed",
      502,
    );
  }

  const line = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .pop()
    ?.trim();
  if (!line) {
    throw new LocationFsError(
      (stderr.trim() || "Empty SSH response").slice(0, 500),
      "fs_ssh_failed",
      502,
    );
  }

  let parsed: RemoteOkList | RemoteOkCreate | RemoteErr;
  try {
    parsed = JSON.parse(line) as RemoteOkList | RemoteOkCreate | RemoteErr;
  } catch {
    throw new LocationFsError(
      "Invalid SSH directory listing response",
      "fs_ssh_failed",
      502,
    );
  }

  if (!parsed.ok) {
    const status =
      parsed.status === 403 || parsed.status === 404 || parsed.status === 502
        ? parsed.status
        : 400;
    throw new LocationFsError(parsed.message, parsed.code, status);
  }
  return parsed;
}

export async function listLocationFs(
  target: LocationFsTarget,
  pathInput?: string,
  deps: LocationFsDeps = {},
  scope: LocationFsScope = {},
): Promise<LocationFsListResult> {
  const base = resolveLocationFsBase(target, deps, scope);
  if (target === "local") {
    // Default into Codebase/; Up still reaches the project root (base).
    const resolvedPath =
      pathInput?.trim() || defaultLocalCodebasePath(base);
    await mkdir(defaultLocalCodebasePath(base), { recursive: true });
    return listLocal(base, resolvedPath);
  }
  const remote = (await runRemote(
    target,
    "list",
    base,
    pathInput?.trim() ?? "",
    "",
    deps,
  )) as RemoteOkList;
  return {
    target,
    base: remote.base,
    path: remote.path,
    exists: remote.exists,
    writable: remote.writable,
    entries: remote.entries ?? [],
  };
}

export async function createLocationFsFolder(
  target: LocationFsTarget,
  parentPath: string,
  name: string,
  deps: LocationFsDeps = {},
  scope: LocationFsScope = {},
): Promise<LocationFsCreateResult> {
  const base = resolveLocationFsBase(target, deps, scope);
  if (target === "local") {
    return createLocalFolder(base, parentPath, name);
  }
  const remote = (await runRemote(
    target,
    "mkdir",
    base,
    parentPath,
    name,
    deps,
  )) as RemoteOkCreate;
  return { target, path: remote.path };
}
