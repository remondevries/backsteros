import { parseArgs } from "node:util";

export type GlobalFlags = {
  url?: string;
  token?: string;
  actor?: string;
  json: boolean;
  help: boolean;
};

export type ParsedCli = {
  global: GlobalFlags;
  resource: string | undefined;
  action: string | undefined;
  positionals: string[];
  values: Record<string, string | boolean | undefined>;
};

const GLOBAL_OPTS = {
  url: { type: "string" as const },
  token: { type: "string" as const },
  actor: { type: "string" as const },
  json: { type: "boolean" as const, default: false },
  help: { type: "boolean" as const, short: "h", default: false },
};

const PROJECT_OPTS = {
  ...GLOBAL_OPTS,
  key: { type: "string" as const, short: "k" as const },
  name: { type: "string" as const, short: "n" as const },
  summary: { type: "string" as const },
  description: { type: "string" as const, short: "d" as const },
  status: { type: "string" as const, short: "s" as const },
  area: { type: "string" as const },
  type: { type: "string" as const },
  priority: { type: "string" as const, short: "p" as const },
  "working-dir": { type: "string" as const },
  body: { type: "string" as const, short: "b" as const },
};

const TASK_OPTS = {
  ...GLOBAL_OPTS,
  project: { type: "string" as const },
  title: { type: "string" as const, short: "t" as const },
  description: { type: "string" as const, short: "d" as const },
  status: { type: "string" as const, short: "s" as const },
  priority: { type: "string" as const, short: "p" as const },
  assignee: { type: "string" as const },
  inbox: { type: "boolean" as const },
  body: { type: "string" as const, short: "b" as const },
};

const COMMENT_OPTS = {
  ...GLOBAL_OPTS,
  message: { type: "string" as const, short: "m" as const },
  /** Alias for --message (matches API field name). */
  body: { type: "string" as const, short: "b" as const },
  parent: { type: "string" as const },
  resolve: { type: "boolean" as const, default: false },
  unresolve: { type: "boolean" as const, default: false },
};

function resourceOptions(resource: string | undefined) {
  if (resource === "project") return PROJECT_OPTS;
  if (resource === "task") return TASK_OPTS;
  if (resource === "comment") return COMMENT_OPTS;
  return GLOBAL_OPTS;
}

export function parseCliArgv(argv: string[]): ParsedCli {
  // First pass: discover resource name among positionals (options may appear first).
  const probe = parseArgs({
    args: argv,
    options: GLOBAL_OPTS,
    allowPositionals: true,
    strict: false,
  });
  const resource = probe.positionals[0];

  const parsed = parseArgs({
    args: argv,
    options: resourceOptions(resource),
    allowPositionals: true,
    strict: true,
  });

  const positionals = parsed.positionals;
  const action = positionals[1];
  const rest = positionals.slice(2);
  const values = parsed.values as Record<string, string | boolean | undefined>;

  return {
    global: {
      url: typeof values.url === "string" ? values.url : undefined,
      token: typeof values.token === "string" ? values.token : undefined,
      actor: typeof values.actor === "string" ? values.actor : undefined,
      json: Boolean(values.json),
      help: Boolean(values.help),
    },
    resource,
    action,
    positionals: rest,
    values,
  };
}

export function usageText(): string {
  return `backsteros — BacksterOS CLI (tasks, projects, comments)

Usage:
  backsteros [--json] [--url URL] [--token TOKEN] [--actor user|agent] <resource> <action> [args]

Auth (first match wins for token):
  --token / BACKSTEROS_API_KEY / ~/.config/backsteros/cli.env / LOCAL_SHELL_TOKEN / "local"
  --url  / BACKSTEROS_API_URL / cli.env / http://127.0.0.1:8788

Projects:
  backsteros project list
  backsteros project get <id|KEY>
  backsteros project create --key DOT --name "Dotfiles" [--description ...] [--status active]
  backsteros project update <id|KEY> [--name ...] [--status ...] [--body '{...}']
  backsteros project delete <id|KEY>

Tasks:
  backsteros task list [--project KEY|id] [--status in_progress]
  backsteros task get <id|KEY-number>
  backsteros task create --title "..." [--project KEY|id] [--status ...] [--description ...]
  backsteros task update <id|KEY-number> [--title ...] [--status completed] [--body '{...}']
  backsteros task delete <id|KEY-number>

Comments:
  backsteros comment list <task id|KEY-number>
  backsteros comment get <task id|KEY-number> <comment-id>
  backsteros comment create <task id|KEY-number> --message "..."
  backsteros comment update <task id|KEY-number> <comment-id> --message "..."
  backsteros comment delete <task id|KEY-number> <comment-id>

Notes:
  --body on project/task accepts a JSON object merged into create/update payloads.
  --message / -m (or --body) on comment is the comment text.
  Writes default activityActor=agent (override with --actor user).
`;
}
