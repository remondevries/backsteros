/**
 * Parse `git show` name-status / numstat / patch into Record changelog rows.
 */

export type ChangelogFileKind = "added" | "modified" | "deleted" | "renamed";

export type ChangelogDiffLine = {
  type: "add" | "del" | "ctx" | "hunk";
  text: string;
};

export type ChangelogFileItem = {
  id: string;
  path: string;
  kind: ChangelogFileKind;
  additions: number;
  deletions: number;
  preview: readonly ChangelogDiffLine[];
};

export type GitCommitShowPayload = {
  sha: string;
  subject: string;
  body: string;
  authorName: string;
  authoredAt: string;
  nameStatus: string;
  numstat: string;
  patch: string;
};

export type ParsedGitCommitChangelog = {
  sha: string;
  subject: string;
  body: string;
  authorName: string;
  authoredAt: string;
  additions: number;
  deletions: number;
  files: ChangelogFileItem[];
};

const MAX_PREVIEW_LINES = 120;

function kindFromStatus(status: string): ChangelogFileKind {
  const letter = status.trim().charAt(0).toUpperCase();
  switch (letter) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
    case "C":
      return "renamed";
    default:
      return "modified";
  }
}

function parseNameStatus(text: string): Map<string, ChangelogFileKind> {
  const out = new Map<string, ChangelogFileKind>();
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0]?.trim() ?? "";
    if (!status) continue;
    const path =
      parts.length >= 3
        ? (parts[2] ?? parts[1] ?? "").trim()
        : (parts[1] ?? "").trim();
    if (!path) continue;
    out.set(path, kindFromStatus(status));
  }
  return out;
}

function parseNumstat(
  text: string,
): Map<string, { additions: number; deletions: number }> {
  const out = new Map<string, { additions: number; deletions: number }>();
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const addRaw = parts[0]?.trim() ?? "";
    const delRaw = parts[1]?.trim() ?? "";
    const path =
      parts.length >= 4
        ? (parts[3] ?? parts[2] ?? "").trim()
        : (parts[2] ?? "").trim();
    if (!path) continue;
    const additions = addRaw === "-" ? 0 : Number.parseInt(addRaw, 10) || 0;
    const deletions = delRaw === "-" ? 0 : Number.parseInt(delRaw, 10) || 0;
    out.set(path, { additions, deletions });
  }
  return out;
}

function stripDiffPath(raw: string): string {
  const trimmed = raw.trim().replace(/^"/, "").replace(/"$/, "");
  if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) {
    return trimmed.slice(2);
  }
  return trimmed;
}

function parseFileHeaderPaths(headerLine: string): {
  oldPath: string;
  newPath: string;
} {
  // diff --git a/foo b/bar
  const match = /^diff --git (.+) (.+)$/.exec(headerLine.trim());
  if (!match) {
    return { oldPath: "", newPath: "" };
  }
  return {
    oldPath: stripDiffPath(match[1] ?? ""),
    newPath: stripDiffPath(match[2] ?? ""),
  };
}

function parsePatchPreview(patchBody: string): ChangelogDiffLine[] {
  const lines: ChangelogDiffLine[] = [];
  for (const raw of patchBody.split("\n")) {
    if (lines.length >= MAX_PREVIEW_LINES) break;
    if (
      raw.startsWith("diff --git ") ||
      raw.startsWith("index ") ||
      raw.startsWith("old mode ") ||
      raw.startsWith("new mode ") ||
      raw.startsWith("similarity index ") ||
      raw.startsWith("rename from ") ||
      raw.startsWith("rename to ") ||
      raw.startsWith("copy from ") ||
      raw.startsWith("copy to ") ||
      raw.startsWith("new file mode ") ||
      raw.startsWith("deleted file mode ") ||
      raw.startsWith("Binary files ") ||
      raw.startsWith("GIT binary patch")
    ) {
      continue;
    }
    if (raw.startsWith("--- ") || raw.startsWith("+++ ")) {
      continue;
    }
    if (raw.startsWith("@@")) {
      lines.push({ type: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      lines.push({ type: "add", text: raw.slice(1) });
      continue;
    }
    if (raw.startsWith("-")) {
      lines.push({ type: "del", text: raw.slice(1) });
      continue;
    }
    if (raw.startsWith("\\")) {
      continue;
    }
    lines.push({
      type: "ctx",
      text: raw.startsWith(" ") ? raw.slice(1) : raw,
    });
  }
  return lines;
}

function splitPatchByFile(patch: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!patch.trim()) return out;
  const chunks = patch.split(/(?=^diff --git )/m);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed.startsWith("diff --git ")) continue;
    const firstLine = trimmed.split("\n", 1)[0] ?? "";
    const { oldPath, newPath } = parseFileHeaderPaths(firstLine);
    const path = newPath || oldPath;
    if (!path) continue;
    out.set(path, trimmed);
  }
  return out;
}

export function parseGitCommitShow(
  payload: GitCommitShowPayload,
): ParsedGitCommitChangelog {
  const kinds = parseNameStatus(payload.nameStatus);
  const stats = parseNumstat(payload.numstat);
  const patches = splitPatchByFile(payload.patch);

  const paths = new Set<string>([
    ...kinds.keys(),
    ...stats.keys(),
    ...patches.keys(),
  ]);

  const files: ChangelogFileItem[] = [...paths]
    .sort((a, b) => a.localeCompare(b))
    .map((path) => {
      const stat = stats.get(path) ?? { additions: 0, deletions: 0 };
      const preview = parsePatchPreview(patches.get(path) ?? "");
      return {
        id: path,
        path,
        kind: kinds.get(path) ?? "modified",
        additions: stat.additions,
        deletions: stat.deletions,
        preview,
      };
    });

  const additions = files.reduce((n, file) => n + file.additions, 0);
  const deletions = files.reduce((n, file) => n + file.deletions, 0);

  return {
    sha: payload.sha.trim(),
    subject: payload.subject.trim(),
    body: payload.body.trim(),
    authorName: payload.authorName.trim(),
    authoredAt: payload.authoredAt.trim(),
    additions,
    deletions,
    files,
  };
}
