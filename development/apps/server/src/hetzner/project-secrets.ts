/**
 * Local per-BacksterOS-project secrets under ~/.config/secrets/environments/<projectId>/.
 * Plaintext files only (FileVault + 0600). Never upload to BacksterOS cloud / PowerSync.
 * Optional Infisical push is backup only — local files stay the daily source of truth.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_ENV_FILE = ".env";
const INFISICAL_CONFIG_NAME = "infisical.json";
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

export type ProjectSecretsFileInfo = {
  readonly name: string;
  readonly size: number;
  readonly updatedAt: string | null;
};

export type ProjectInfisicalConfig = {
  readonly infisicalProjectId: string;
  readonly path: string;
  readonly env: string;
};

export type ProjectSecretsFolder = {
  readonly projectId: string;
  readonly folderPath: string;
  readonly files: readonly ProjectSecretsFileInfo[];
  readonly infisical: ProjectInfisicalConfig | null;
  readonly infisicalConfigured: boolean;
};

export type ProjectSecretsReadResult = ProjectSecretsFolder & {
  readonly fileName: string;
  readonly content: string;
};

function secretsRoot(): string {
  return path.join(os.homedir(), ".config", "secrets", "environments");
}

/**
 * Reject path traversal / odd ids. BacksterOS ids are opaque (nanoid-like).
 */
export function assertSafeProjectId(projectId: string): string {
  const id = projectId.trim();
  if (!id || id.length > 128) {
    throw new Error("projectId is required");
  }
  if (id.includes("/") || id.includes("\\") || id.includes("..") || id.includes("\0")) {
    throw new Error("Invalid projectId");
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) {
    throw new Error("Invalid projectId");
  }
  return id;
}

/**
 * Allow `.env` and named `*.env` files (no path segments).
 */
export function assertSafeEnvFileName(fileName: string): string {
  const name = fileName.trim();
  if (!name || name.length > 128) {
    throw new Error("fileName is required");
  }
  if (name.includes("/") || name.includes("\\") || name.includes("..") || name.includes("\0")) {
    throw new Error("Invalid fileName");
  }
  if (name === INFISICAL_CONFIG_NAME) {
    throw new Error("infisical.json is not an editable env file");
  }
  if (name === ".env") return name;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.env$/u.test(name)) {
    throw new Error("fileName must be .env or a *.env basename");
  }
  return name;
}

export function projectSecretsFolderPath(projectIdInput: string): string {
  const projectId = assertSafeProjectId(projectIdInput);
  return path.join(secretsRoot(), projectId);
}

function isEnvFileName(name: string): boolean {
  try {
    assertSafeEnvFileName(name);
    return true;
  } catch {
    return false;
  }
}

function chmodSafe(filePath: string, mode: number): void {
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Best-effort on platforms that ignore modes.
  }
}

function readInfisicalConfig(folderPath: string): ProjectInfisicalConfig | null {
  const configPath = path.join(folderPath, INFISICAL_CONFIG_NAME);
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const infisicalProjectId =
      typeof parsed.infisicalProjectId === "string"
        ? parsed.infisicalProjectId.trim()
        : typeof parsed.projectId === "string"
          ? parsed.projectId.trim()
          : "";
    if (!infisicalProjectId) return null;
    const folderPathValue =
      typeof parsed.path === "string" && parsed.path.trim() ? parsed.path.trim() : "/";
    const env = typeof parsed.env === "string" && parsed.env.trim() ? parsed.env.trim() : "dev";
    return {
      infisicalProjectId,
      path: folderPathValue.startsWith("/") ? folderPathValue : `/${folderPathValue}`,
      env,
    };
  } catch {
    return null;
  }
}

function listEnvFiles(folderPath: string): ProjectSecretsFileInfo[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: ProjectSecretsFileInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isEnvFileName(entry.name)) continue;
    const full = path.join(folderPath, entry.name);
    let size = 0;
    let updatedAt: string | null = null;
    try {
      const stat = fs.statSync(full);
      size = stat.size;
      updatedAt = stat.mtime.toISOString();
    } catch {
      // skip unreadable
    }
    files.push({ name: entry.name, size, updatedAt });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

/**
 * Ensure `environments/<projectId>/` exists (0700) and create empty `.env` (0600) if missing.
 */
export function ensureProjectSecretsFolder(projectIdInput: string): ProjectSecretsFolder {
  const projectId = assertSafeProjectId(projectIdInput);
  const folderPath = projectSecretsFolderPath(projectId);
  fs.mkdirSync(folderPath, { recursive: true, mode: DIR_MODE });
  chmodSafe(folderPath, DIR_MODE);

  const envPath = path.join(folderPath, DEFAULT_ENV_FILE);
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, "", { encoding: "utf8", mode: FILE_MODE });
    chmodSafe(envPath, FILE_MODE);
  }

  const infisical = readInfisicalConfig(folderPath);
  return {
    projectId,
    folderPath,
    files: listEnvFiles(folderPath),
    infisical,
    infisicalConfigured: infisical != null,
  };
}

export function listProjectSecrets(projectIdInput: string): ProjectSecretsFolder {
  return ensureProjectSecretsFolder(projectIdInput);
}

export function readProjectSecretFile(
  projectIdInput: string,
  fileNameInput: string = DEFAULT_ENV_FILE,
): ProjectSecretsReadResult {
  const folder = ensureProjectSecretsFolder(projectIdInput);
  const fileName = assertSafeEnvFileName(fileNameInput);
  const full = path.join(folder.folderPath, fileName);
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, "", { encoding: "utf8", mode: FILE_MODE });
    chmodSafe(full, FILE_MODE);
  }
  const content = fs.readFileSync(full, "utf8");
  return {
    ...ensureProjectSecretsFolder(projectIdInput),
    fileName,
    content,
  };
}

export function writeProjectSecretFile(input: {
  readonly projectId: string;
  readonly fileName?: string;
  readonly content: string;
}): ProjectSecretsReadResult {
  const folder = ensureProjectSecretsFolder(input.projectId);
  const fileName = assertSafeEnvFileName(input.fileName ?? DEFAULT_ENV_FILE);
  const full = path.join(folder.folderPath, fileName);
  const content =
    input.content.endsWith("\n") || input.content === "" ? input.content : `${input.content}\n`;
  fs.writeFileSync(full, content, { encoding: "utf8", mode: FILE_MODE });
  chmodSafe(full, FILE_MODE);
  return readProjectSecretFile(input.projectId, fileName);
}

function parseMachineEnv(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
  } catch {
    // missing file
  }
  return out;
}

async function runCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function resolveInfisicalToken(env: NodeJS.ProcessEnv): Promise<string | null> {
  const machinePath = path.join(os.homedir(), ".config", "secrets", "infisical-machine.env");
  const machine = parseMachineEnv(machinePath);
  const clientId = machine.INFISICAL_CLIENT_ID?.trim() || env.INFISICAL_CLIENT_ID?.trim() || "";
  const clientSecret =
    machine.INFISICAL_CLIENT_SECRET?.trim() || env.INFISICAL_CLIENT_SECRET?.trim() || "";
  if (clientId && clientSecret) {
    const login = await runCommand(
      "infisical",
      [
        "login",
        "--method=universal-auth",
        `--client-id=${clientId}`,
        `--client-secret=${clientSecret}`,
        "--silent",
        "--plain",
      ],
      { ...env, ...machine },
    );
    const token = login.stdout.trim();
    if (login.code === 0 && token) return token;
  }
  return null;
}

export type ProjectSecretsPushResult = {
  readonly ok: boolean;
  readonly projectId: string;
  readonly fileName: string;
  readonly infisical: ProjectInfisicalConfig | null;
  readonly message: string;
};

/**
 * Push one local env file to Infisical as backup.
 * Requires `infisical.json` in the project folder with `infisicalProjectId` (+ optional path/env).
 */
export async function pushProjectSecretToInfisical(input: {
  readonly projectId: string;
  readonly fileName?: string;
}): Promise<ProjectSecretsPushResult> {
  const folder = ensureProjectSecretsFolder(input.projectId);
  const fileName = assertSafeEnvFileName(input.fileName ?? DEFAULT_ENV_FILE);
  const infisical = folder.infisical;

  if (!infisical) {
    return {
      ok: false,
      projectId: folder.projectId,
      fileName,
      infisical: null,
      message:
        "Infisical is not configured for this project. Add environments/<projectId>/infisical.json with infisicalProjectId (and optional path, env).",
    };
  }

  const full = path.join(folder.folderPath, fileName);
  if (!fs.existsSync(full)) {
    return {
      ok: false,
      projectId: folder.projectId,
      fileName,
      infisical,
      message: `Missing local file ${fileName}`,
    };
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    INFISICAL_DOMAIN: process.env.INFISICAL_DOMAIN ?? "https://app.infisical.com/api",
    PATH: process.env.PATH ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
  };

  let token: string | null = null;
  try {
    token = await resolveInfisicalToken(env);
  } catch {
    token = null;
  }

  const args = [
    "secrets",
    "set",
    "--file",
    full,
    "--projectId",
    infisical.infisicalProjectId,
    "--path",
    infisical.path,
    "--env",
    infisical.env,
    "--silent",
  ];
  if (token) {
    args.push("--token", token);
  }

  let result: { readonly code: number; readonly stdout: string; readonly stderr: string };
  try {
    result = await runCommand("infisical", args, env);
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.includes("ENOENT")
        ? "infisical CLI not found on PATH"
        : cause instanceof Error
          ? cause.message
          : "Failed to run infisical";
    return {
      ok: false,
      projectId: folder.projectId,
      fileName,
      infisical,
      message,
    };
  }

  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim().slice(0, 400);
    return {
      ok: false,
      projectId: folder.projectId,
      fileName,
      infisical,
      message: detail || "Infisical push failed",
    };
  }

  return {
    ok: true,
    projectId: folder.projectId,
    fileName,
    infisical,
    message: `Pushed ${fileName} → Infisical ${infisical.infisicalProjectId.slice(0, 8)}… path=${infisical.path} env=${infisical.env}`,
  };
}

/**
 * Documented pull path (no secret bytes). Used by API empty-state / help text.
 */
export function projectSecretsPullHint(config: ProjectInfisicalConfig | null): string {
  if (!config) {
    return "Pull: add infisical.json then run `infisical export --projectId <id> --env <env> --path <path> --format=dotenv` into the local .env (or refresh-secrets for machine-wide caches).";
  }
  return `Pull: infisical export --projectId ${config.infisicalProjectId} --env ${config.env} --path ${config.path} --format=dotenv > ~/.config/secrets/environments/<projectId>/.env`;
}
