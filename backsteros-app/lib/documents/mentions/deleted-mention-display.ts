import type { ParsedMentionToken } from "./mention-menu-types";

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
      return {
        ariaLabel: parsed.displayId,
        identifier: parsed.displayId,
        title: parsed.displayId,
        subtitle: null,
      };
    case "project":
      return {
        ariaLabel: parsed.key,
        identifier: parsed.key,
        title: parsed.key,
        subtitle: null,
      };
    case "contact":
      return {
        ariaLabel: parsed.key,
        identifier: parsed.key,
        title: parsed.key,
        subtitle: null,
      };
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
  }
}
