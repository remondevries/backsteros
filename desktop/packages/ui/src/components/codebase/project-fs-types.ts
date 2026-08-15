export type FsTreeEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
};

export type ProjectFsClient = {
  listEntries: (
    path: string,
  ) => Promise<{ path: string; entries: FsTreeEntry[]; error?: string }>;
  createEntry: (args: {
    root: string;
    parent: string;
    name: string;
    kind: "file" | "directory";
  }) => Promise<{
    path: string;
    name: string;
    kind: "file" | "directory";
    parent: string;
  }>;
  readFile: (
    root: string,
    path: string,
  ) => Promise<{
    path: string;
    name: string;
    size: number;
    binary: boolean;
    content: string | null;
    error?: string;
  }>;
  writeFile: (
    root: string,
    path: string,
    content: string,
  ) => Promise<{
    path: string;
    name: string;
    size: number;
    binary: boolean;
    content: string;
  }>;
  deleteEntry: (
    root: string,
    path: string,
  ) => Promise<{
    path: string;
    name: string;
    kind: "file" | "directory";
    deleted: boolean;
  }>;
  pickDirectory: (defaultPath?: string) => Promise<string | null>;
  /** Optional blob URL for images. */
  readRawUrl?: (root: string, path: string) => Promise<string | null>;
};

export type CodebaseGithubListTab =
  | "tasks"
  | "files"
  | "docs"
  | "commits"
  | "pulls";

export type CodebaseRequestJson = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export type CodebaseApiClient = {
  requestJson: CodebaseRequestJson;
};
