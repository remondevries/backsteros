import { column, Schema, Table } from "@powersync/web";

/**
 * Shared PowerSync client schema (Tier A/B metadata only).
 * No document bodies or PDF bytes — those are Tier D, fetched on demand.
 * See docs/03-data-model.md and docs/07-performance.md.
 */

const commonDates = {
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
};

const projects = new Table(
  {
    key: column.text,
    name: column.text,
    summary: column.text,
    description: column.text,
    organization_id: column.text,
    area_id: column.text,
    area: column.text,
    start_date: column.text,
    due_date: column.text,
    icon: column.text,
    color: column.text,
    type: column.text,
    github_repository: column.text,
    local_working_directory: column.text,
    status: column.text,
    priority: column.integer,
    sort_order: column.integer,
    ...commonDates,
  },
  { indexes: { status: ["status"], organization: ["organization_id"], type: ["type"] } },
);

const tasks = new Table(
  {
    project_id: column.text,
    contact_id: column.text,
    assignee_id: column.text,
    number: column.integer,
    title: column.text,
    description: column.text,
    status: column.text,
    priority: column.integer,
    sort_order: column.integer,
    due_date: column.text,
    due_end_date: column.text,
    triaged_at: column.text,
    inbox: column.integer,
    links: column.text,
    agent_chat_id: column.text,
    habit_id: column.text,
    completed_at: column.text,
    agent_created_at: column.text,
    agent_inbox_approved_at: column.text,
    tracked_minutes: column.integer,
    tracked_duration_seconds: column.integer,
    ...commonDates,
  },
  {
    indexes: {
      status: ["status"],
      project: ["project_id"],
      contact: ["contact_id"],
      habit: ["habit_id"],
    },
  },
);

const documents = new Table(
  {
    type: column.text,
    project_id: column.text,
    parent_id: column.text,
    kind: column.text,
    icon: column.text,
    sort_order: column.integer,
    journal_date: column.text,
    path: column.text,
    title: column.text,
    storage_key: column.text,
    content_type: column.text,
    byte_size: column.integer,
    checksum: column.text,
    snippet: column.text,
    content_version: column.integer,
    content_etag: column.text,
    ...commonDates,
  },
  {
    indexes: {
      type: ["type"],
      project: ["project_id"],
      parent: ["parent_id"],
    },
  },
);

const organizations = new Table({
  number: column.integer,
  key: column.text,
  name: column.text,
  summary: column.text,
  phone: column.text,
  email: column.text,
  website: column.text,
  address: column.text,
  city: column.text,
  postal_code: column.text,
  country: column.text,
  avatar_storage_key: column.text,
  avatar_content_type: column.text,
  sort_order: column.integer,
  notes: column.text,
  moneybird_contact_id: column.text,
  ...commonDates,
});

const contacts = new Table(
  {
    number: column.integer,
    key: column.text,
    organization_id: column.text,
    name: column.text,
    email: column.text,
    title: column.text,
    summary: column.text,
    avatar_storage_key: column.text,
    avatar_content_type: column.text,
    sort_order: column.integer,
    phone: column.text,
    role: column.text,
    notes: column.text,
    address: column.text,
    city: column.text,
    postal_code: column.text,
    country: column.text,
    social_accounts: column.text,
    ...commonDates,
  },
  { indexes: { organization: ["organization_id"] } },
);

const letters = new Table(
  {
    number: column.integer,
    project_id: column.text,
    organization_id: column.text,
    contact_id: column.text,
    title: column.text,
    icon: column.text,
    context: column.text,
    status: column.text,
    due_date: column.text,
    received_date: column.text,
    direction: column.text,
    storage_key: column.text,
    original_filename: column.text,
    content_type: column.text,
    byte_size: column.integer,
    checksum: column.text,
    content_etag: column.text,
    sort_order: column.integer,
    ...commonDates,
  },
  {
    indexes: {
      project: ["project_id"],
      organization: ["organization_id"],
      contact: ["contact_id"],
    },
  },
);

const workspace_settings = new Table({
  settings: column.text,
  updated_at: column.text,
});

const areas = new Table({
  name: column.text,
  parent: column.text,
  icon: column.text,
  color: column.text,
  sort_order: column.integer,
  ...commonDates,
});

const avatars = new Table({
  entity_type: column.text,
  entity_id: column.text,
  content_type: column.text,
  byte_size: column.integer,
  checksum: column.text,
  content_etag: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const mentions = new Table({
  user_id: column.text,
  source_type: column.text,
  source_id: column.text,
  excerpt: column.text,
  read_at: column.text,
  created_at: column.text,
});

const bank_accounts = new Table({
  key: column.text,
  name: column.text,
  iban_or_mask: column.text,
  currency: column.text,
  type: column.text,
  avatar_storage_key: column.text,
  avatar_content_type: column.text,
  color: column.text,
  sort_order: column.integer,
  ...commonDates,
});

const financial_categories = new Table(
  {
    name: column.text,
    parent_id: column.text,
    kind: column.text,
    listing: column.text,
    icon: column.text,
    budget_cents: column.integer,
    sort_order: column.integer,
    ...commonDates,
  },
  { indexes: { parent: ["parent_id"] } },
);

const financial_goals = new Table({
  name: column.text,
  listing: column.text,
  icon: column.text,
  goal_amount_cents: column.integer,
  start_date: column.text,
  end_date: column.text,
  contribution_cents: column.integer,
  saving_mode: column.text,
  sort_order: column.integer,
  ...commonDates,
});

const financial_recurrings = new Table({
  name: column.text,
  icon: column.text,
  category_id: column.text,
  amount_cents: column.integer,
  next_date: column.text,
  archived: column.integer,
  sort_order: column.integer,
  ...commonDates,
});

const cashflow_planner_entries = new Table({
  entry_type: column.text,
  name: column.text,
  amount_cents: column.integer,
  due_date: column.text,
  group_label: column.text,
  sort_order: column.integer,
  ...commonDates,
});

const habits = new Table({
  title: column.text,
  icon: column.text,
  description: column.text,
  project_id: column.text,
  cadence: column.text,
  cadence_anchor_ymd: column.text,
  sort_order: column.integer,
  ...commonDates,
});

const meetings = new Table({
  number: column.integer,
  title: column.text,
  summary: column.text,
  notes: column.text,
  transcription: column.text,
  status: column.text,
  project_id: column.text,
  organization_id: column.text,
  attendee_contact_ids: column.text,
  start_at: column.text,
  end_at: column.text,
  tracked_minutes: column.integer,
  tracked_duration_seconds: column.integer,
  sort_order: column.integer,
  ...commonDates,
});

const task_comments = new Table(
  {
    task_id: column.text,
    parent_comment_id: column.text,
    author_user_id: column.text,
    author_contact_id: column.text,
    author_email: column.text,
    body: column.text,
    resolved_at: column.text,
    ...commonDates,
  },
  { indexes: { task: ["task_id"], parent: ["parent_comment_id"] } },
);

export const appSchema = new Schema({
  projects,
  tasks,
  documents,
  organizations,
  contacts,
  letters,
  workspace_settings,
  areas,
  avatars,
  mentions,
  bank_accounts,
  financial_categories,
  financial_goals,
  financial_recurrings,
  cashflow_planner_entries,
  habits,
  meetings,
  task_comments,
});

export type UploadEntry = {
  table: string;
  op: "PUT" | "PATCH" | "DELETE";
  id: string;
  data?: Record<string, unknown>;
};

export function mapCrudBatch(
  crud: Array<{
    table: string;
    op: "PUT" | "PATCH" | "DELETE";
    id: string;
    opData?: Record<string, unknown>;
  }>,
): UploadEntry[] {
  return crud.map((entry) => ({
    table: entry.table,
    op: entry.op,
    id: entry.id,
    ...(entry.opData ? { data: entry.opData } : {}),
  }));
}

export function powerSyncMutationId(
  deviceId: string,
  crud: Array<{ clientId: number }>,
) {
  return `ps:${deviceId}:${crud[0]?.clientId ?? 0}:${crud.at(-1)?.clientId ?? 0}`;
}
