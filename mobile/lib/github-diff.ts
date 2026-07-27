import type { GithubPullRequestFileStatus } from "@backsteros/contracts";

/**
 * GitHub's `patch` field is hunk-only (`@@ ...`). Diff viewers expect a
 * unified diff with `---` / `+++` headers.
 */
export function toUnifiedDiff(
  filename: string,
  previousFilename: string | null,
  patch: string,
  status: GithubPullRequestFileStatus,
): string {
  const trimmed = patch.replace(/^\uFEFF/, "").trimStart();
  if (
    trimmed.startsWith("diff ") ||
    trimmed.startsWith("--- ") ||
    trimmed.startsWith("+++ ")
  ) {
    return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  }

  const oldPath =
    status === "added" ? "/dev/null" : `a/${previousFilename ?? filename}`;
  const newPath = status === "removed" ? "/dev/null" : `b/${filename}`;

  const body = trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
  return `--- ${oldPath}\n+++ ${newPath}\n${body}`;
}

export type DiffLineKind =
  | "meta"
  | "hunk"
  | "add"
  | "del"
  | "context"
  | "empty";

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
};

export function parseUnifiedDiffLines(unified: string): DiffLine[] {
  const lines = unified.replace(/\r\n/g, "\n").split("\n");
  // Drop trailing empty split from final newline.
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.map((text) => {
    if (
      text.startsWith("diff ") ||
      text.startsWith("index ") ||
      text.startsWith("--- ") ||
      text.startsWith("+++ ")
    ) {
      return { kind: "meta" as const, text };
    }
    if (text.startsWith("@@")) {
      return { kind: "hunk" as const, text };
    }
    if (text.startsWith("+")) {
      return { kind: "add" as const, text };
    }
    if (text.startsWith("-")) {
      return { kind: "del" as const, text };
    }
    if (text === "") {
      return { kind: "empty" as const, text: " " };
    }
    return { kind: "context" as const, text };
  });
}

export function githubFileStatusLabel(
  status: GithubPullRequestFileStatus,
): string {
  switch (status) {
    case "added":
      return "Added";
    case "removed":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "copied":
      return "Copied";
    case "changed":
    case "modified":
      return "Modified";
    default:
      return status;
  }
}
