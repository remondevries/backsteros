/**
 * Agent comment authorship profile for BacksterOS CLI / agent writes.
 * Persisted at ~/.config/backsteros/agent-profile.json so the CLI can attribute
 * comments to a chosen contact instead of the anonymous "Agent" label.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type BacksterosAgentProfile = {
  readonly contactId: string | null;
  readonly updatedAt: string;
};

function profilePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "agent-profile.json");
}

export function readBacksterosAgentProfile(): BacksterosAgentProfile {
  try {
    const raw = fs.readFileSync(profilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<BacksterosAgentProfile>;
    const contactId =
      typeof parsed.contactId === "string" && parsed.contactId.trim()
        ? parsed.contactId.trim()
        : null;
    return {
      contactId,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return { contactId: null, updatedAt: new Date(0).toISOString() };
  }
}

export function writeBacksterosAgentProfile(input: {
  readonly contactId: string | null;
}): BacksterosAgentProfile {
  const contactId = input.contactId?.trim() || null;
  const next: BacksterosAgentProfile = {
    contactId,
    updatedAt: new Date().toISOString(),
  };
  const filePath = profilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
