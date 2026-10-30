import type { ParsedMentionToken } from "./mention-tokens.js";

export type DeletedMentionDisplay = {
  ariaLabel: string;
  identifier: string | null;
  title: string;
  subtitle: string | null;
};

function documentTitleFromRelativePath(relativePath: string): string {
  const basename = relativePath.split("/").pop() ?? relativePath;
  return basename.endsWith(".md") ? basename.slice(0, -3) : basename;
}

export function getDeletedMentionDisplay(
  parsed: ParsedMentionToken,
): DeletedMentionDisplay {
  switch (parsed.kind) {
    case "task":
    case "letter":
    case "email":
    case "meeting":
      return {
        ariaLabel: parsed.displayId,
        identifier: parsed.displayId,
        title: parsed.displayId,
        subtitle: null,
      };
    case "project":
    case "contact":
    case "organization":
      return {
        ariaLabel: parsed.key,
        identifier: parsed.key,
        title: parsed.key,
        subtitle: null,
      };
    case "document": {
      const path = `${parsed.projectKey}/${parsed.relativePath}`;
      return {
        ariaLabel: path,
        identifier: null,
        title: documentTitleFromRelativePath(parsed.relativePath),
        subtitle: path,
      };
    }
    case "journal":
      return {
        ariaLabel: parsed.date,
        identifier: parsed.date,
        title: parsed.date,
        subtitle: null,
      };
    case "habit": {
      const label = parsed.date
        ? `${parsed.habitId}/${parsed.date}`
        : parsed.habitId;
      return {
        ariaLabel: label,
        identifier: parsed.date,
        title: parsed.habitId,
        subtitle: parsed.date,
      };
    }
    case "message":
    case "post":
    case "transaction":
    case "invoice":
    case "estimate":
      return {
        ariaLabel: parsed.id,
        identifier: parsed.id,
        title: parsed.id,
        subtitle: null,
      };
  }
}
