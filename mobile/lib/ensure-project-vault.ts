/**
 * Ensure a project's vault folder + `.cursor` skills exist (and assign a
 * default working directory when missing). Safe to call on every project open.
 */
export type ProjectVaultEnsureResponse = {
  projectId: string;
  projectKey: string;
  projectVaultPath: string;
  localWorkingDirectory: string | null;
  assignedWorkingDirectory: boolean;
  createdSkill: boolean;
  configured: boolean;
};

type RequestJsonClient = {
  requestJson: <T>(path: string, init?: RequestInit) => Promise<T>;
};

export async function ensureProjectVault(
  client: RequestJsonClient,
  projectId: string,
): Promise<ProjectVaultEnsureResponse | null> {
  const id = projectId.trim();
  if (!id) return null;
  try {
    return await client.requestJson<ProjectVaultEnsureResponse>(
      `/api/v1/projects/${encodeURIComponent(id)}/ensure-vault`,
      { method: "POST" },
    );
  } catch {
    return null;
  }
}
