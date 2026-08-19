import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    clerkId: text("clerk_id").notNull().unique(),
    email: text("email"),
    /** Preferred display name from Clerk (full name / first+last). */
    displayName: text("display_name"),
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("users_clerk_id_idx").on(table.clerkId)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    ownerUserId: text("owner_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("workspaces_owner_user_id_idx").on(table.ownerUserId)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "workspace_members_workspace_user_pk",
      columns: [table.workspaceId, table.userId],
    }),
    index("workspace_members_user_id_idx").on(table.userId),
  ],
);

export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Integration secrets — not published to PowerSync. */
export const workspaceIntegrationSecrets = pgTable(
  "workspace_integration_secrets",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    cursorApiKey: text("cursor_api_key"),
    moneybirdApiToken: text("moneybird_api_token"),
    moneybirdAdministrationId: text("moneybird_administration_id"),
    agentmailApiKey: text("agentmail_api_key"),
    agentmailInboxId: text("agentmail_inbox_id"),
    agentmailInboxIds: jsonb("agentmail_inbox_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    agentmailInboxContacts: jsonb("agentmail_inbox_contacts")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    agentmailReplyGreetingTemplate: text("agentmail_reply_greeting_template"),
    agentmailReplySignOffTemplate: text("agentmail_reply_sign_off_template"),
    agentmailReplySignOffTemplateEn: text("agentmail_reply_sign_off_template_en"),
    agentmailReplySignOffTemplateNl: text("agentmail_reply_sign_off_template_nl"),
    agentmailReplySignOffName: text("agentmail_reply_sign_off_name"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    number: integer("number"),
    key: text("key").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    avatarStorageKey: text("avatar_storage_key"),
    avatarContentType: text("avatar_content_type"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    notes: text("notes"),
    moneybirdContactId: text("moneybird_contact_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("organizations_workspace_id_idx").on(table.workspaceId),
    index("organizations_workspace_key_idx").on(table.workspaceId, table.key),
    index("organizations_workspace_number_idx").on(table.workspaceId, table.number),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    number: integer("number"),
    key: text("key").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    title: text("title"),
    summary: text("summary"),
    avatarStorageKey: text("avatar_storage_key"),
    avatarContentType: text("avatar_content_type"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    phone: text("phone"),
    role: text("role"),
    notes: text("notes"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    socialAccounts: jsonb("social_accounts")
      .$type<{ platform: string; url: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("contacts_workspace_id_idx").on(table.workspaceId),
    index("contacts_workspace_key_idx").on(table.workspaceId, table.key),
    index("contacts_workspace_number_idx").on(table.workspaceId, table.number),
    index("contacts_organization_id_idx").on(table.organizationId),
    index("contacts_email_idx").on(table.workspaceId, table.email),
  ],
);

export const areas = pgTable(
  "areas",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Top-level PARA bucket: personal | business | clients. */
    parent: text("parent"),
    icon: text("icon"),
    color: text("color"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("areas_workspace_id_idx").on(table.workspaceId),
    index("areas_workspace_parent_idx").on(table.workspaceId, table.parent),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: text("scopes").array().notNull(),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("api_keys_prefix_idx").on(table.prefix),
    index("api_keys_workspace_id_idx").on(table.workspaceId),
    index("api_keys_user_id_idx").on(table.userId),
    index("api_keys_contact_id_idx").on(table.contactId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    description: text("description"),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    areaId: text("area_id").references(() => areas.id, { onDelete: "set null" }),
    area: text("area"),
    startDate: timestamp("start_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    icon: text("icon"),
    color: text("color"),
    type: text("type").notNull().default("general"),
    /** `owner/repo` when linked; only meaningful for `type = codebase`. */
    githubRepository: text("github_repository"),
    /**
     * Absolute path on the developer's machine for agent/PTY cwd.
     * Not multi-device; stored so the Development console persists across reloads.
     */
    localWorkingDirectory: text("local_working_directory"),
    status: text("status").notNull().default("backlog"),
    priority: integer("priority").notNull().default(0),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("projects_workspace_key_unique").on(table.workspaceId, table.key),
    index("projects_workspace_id_idx").on(table.workspaceId),
    index("projects_organization_id_idx").on(table.organizationId),
    index("projects_area_id_idx").on(table.areaId),
    index("projects_type_idx").on(table.type),
    index("projects_deleted_at_idx").on(table.deletedAt),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    assigneeId: text("assignee_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("ready_to_start"),
    priority: integer("priority").notNull().default(0),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    inbox: boolean("inbox").notNull().default(false),
    links: jsonb("links")
      .$type<{ id: string; url: string; createdAt: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Cursor Agent chat id (`agent --resume <id>`); one active session per task. */
    agentChatId: text("agent_chat_id"),
    /** Habit definition this daily instance belongs to, if any. */
    habitId: text("habit_id").references(() => habits.id, {
      onDelete: "set null",
    }),
    legacySource: text("legacy_source"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Set when created via API key or agent actor — inbox Agents subgroup. */
    agentCreatedAt: timestamp("agent_created_at", { withTimezone: true }),
    /** User sign-off removes the task from the Agents inbox subgroup. */
    agentInboxApprovedAt: timestamp("agent_inbox_approved_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("tasks_project_id_idx").on(table.projectId),
    index("tasks_workspace_id_idx").on(table.workspaceId),
    index("tasks_contact_id_idx").on(table.contactId),
    index("tasks_assignee_id_idx").on(table.assigneeId),
    index("tasks_workspace_due_date_idx").on(table.workspaceId, table.dueDate),
    index("tasks_status_idx").on(table.status),
    index("tasks_habit_id_idx").on(table.habitId),
    uniqueIndex("tasks_habit_due_unique")
      .on(table.habitId, table.dueDate)
      .where(
        sql`${table.habitId} is not null and ${table.deletedAt} is null and ${table.dueDate} is not null`,
      ),
    index("tasks_deleted_at_idx").on(table.deletedAt),
    uniqueIndex("tasks_workspace_scope_number_unique").on(
      table.workspaceId,
      sql`coalesce('project:' || ${table.projectId}, 'contact:' || ${table.contactId}, '__inbox__')`,
      table.number,
    ).where(sql`${table.legacySource} is null`),
    index("tasks_workspace_scope_number_idx").on(
      table.workspaceId,
      sql`coalesce('project:' || ${table.projectId}, 'contact:' || ${table.contactId}, '__inbox__')`,
      table.number,
    ),
  ],
);

/** Habit definitions that spawn daily Health-project tasks. */
export const habits = pgTable(
  "habits",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    icon: text("icon"),
    /** Optional plain-text description (same idea as task.description). */
    description: text("description"),
    /** Project habit day tasks are filed under (defaults to Health). */
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    cadence: text("cadence").notNull().default("daily"),
    cadenceAnchorYmd: text("cadence_anchor_ymd").notNull(),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("habits_workspace_id_idx").on(table.workspaceId),
    index("habits_project_id_idx").on(table.projectId),
    index("habits_deleted_at_idx").on(table.deletedAt),
  ],
);

/** Human (and later agent) comments on a task — Multica/Linear-style activity. */
export const taskComments = pgTable(
  "task_comments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** When set, this row is a reply to another comment on the same task. */
    parentCommentId: text("parent_comment_id"),
    authorUserId: text("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorContactId: text("author_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /** Denormalized for display without joining users. */
    authorEmail: text("author_email"),
    body: text("body").notNull(),
    /** When set on a root comment, the thread is resolved. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("task_comments_task_id_idx").on(table.taskId),
    index("task_comments_workspace_id_idx").on(table.workspaceId),
    index("task_comments_created_at_idx").on(table.createdAt),
    index("task_comments_deleted_at_idx").on(table.deletedAt),
    index("task_comments_parent_comment_id_idx").on(table.parentCommentId),
    index("task_comments_resolved_at_idx").on(table.resolvedAt),
    index("task_comments_author_contact_id_idx").on(table.authorContactId),
    foreignKey({
      columns: [table.parentCommentId],
      foreignColumns: [table.id],
      name: "task_comments_parent_comment_id_fk",
    }).onDelete("cascade"),
  ],
);

/**
 * System activity on a task (status changes, assignment, creation).
 * Shared across apps via GET /api/v1/tasks/:id/activities.
 */
export const taskActivities = pgTable(
  "task_activities",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** created | status_changed | assignee_changed */
    type: text("type").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorContactId: text("actor_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email"),
    /** Denormalized Clerk/user display name at write time. */
    actorName: text("actor_name"),
    data: jsonb("data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("task_activities_task_id_idx").on(table.taskId),
    index("task_activities_workspace_id_idx").on(table.workspaceId),
    index("task_activities_created_at_idx").on(table.createdAt),
    index("task_activities_type_idx").on(table.type),
    index("task_activities_actor_contact_id_idx").on(table.actorContactId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    parentId: text("parent_id"),
    kind: text("kind").notNull().default("document"),
    icon: text("icon"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    journalDate: date("journal_date"),
    path: text("path").notNull(),
    title: text("title").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull().default("text/markdown"),
    byteSize: integer("byte_size").notNull().default(0),
    checksum: text("checksum"),
    snippet: text("snippet"),
    contentVersion: integer("content_version").notNull().default(1),
    contentEtag: text("content_etag"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("documents_type_idx").on(table.type),
    index("documents_workspace_id_idx").on(table.workspaceId),
    index("documents_project_id_idx").on(table.projectId),
    index("documents_parent_id_idx").on(table.parentId),
    index("documents_workspace_journal_date_idx").on(
      table.workspaceId,
      table.journalDate,
    ),
    index("documents_path_idx").on(table.path),
    index("documents_deleted_at_idx").on(table.deletedAt),
    index("documents_type_project_path_idx").on(
      table.workspaceId,
      table.type,
      table.projectId,
      table.path,
    ),
  ],
);

export const letters = pgTable(
  "letters",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    number: integer("number"),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    icon: text("icon"),
    context: text("context"),
    status: text("status").notNull().default("ready_to_start"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    receivedDate: timestamp("received_date", { withTimezone: true }),
    direction: text("direction").notNull().default("incoming"),
    storageKey: text("storage_key").notNull().default(""),
    originalFilename: text("original_filename").notNull().default(""),
    contentType: text("content_type").notNull().default("application/pdf"),
    byteSize: integer("byte_size").notNull().default(0),
    checksum: text("checksum"),
    contentEtag: text("content_etag"),
    extractedText: text("extracted_text"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("letters_workspace_id_idx").on(table.workspaceId),
    index("letters_workspace_number_idx").on(table.workspaceId, table.number),
    index("letters_project_id_idx").on(table.projectId),
    index("letters_status_idx").on(table.workspaceId, table.status),
    index("letters_organization_id_idx").on(table.organizationId),
    index("letters_contact_id_idx").on(table.contactId),
    index("letters_received_date_idx").on(table.workspaceId, table.receivedDate),
  ],
);

export const letterAttachments = pgTable(
  "letter_attachments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    letterId: text("letter_id")
      .notNull()
      .references(() => letters.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull().default(""),
    contentType: text("content_type").notNull().default("application/pdf"),
    byteSize: integer("byte_size").notNull().default(0),
    checksum: text("checksum"),
    contentEtag: text("content_etag"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("letter_attachments_workspace_id_idx").on(table.workspaceId),
    index("letter_attachments_letter_id_idx").on(table.letterId),
    index("letter_attachments_letter_sort_idx").on(table.letterId, table.sortOrder),
  ],
);

/** Inline images pasted into task descriptions (Tier B metadata + Tier D blob). */
export const taskImages = pgTable(
  "task_images",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull().default(""),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull().default(0),
    checksum: text("checksum"),
    contentEtag: text("content_etag"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("task_images_workspace_id_idx").on(table.workspaceId),
    index("task_images_task_id_idx").on(table.taskId),
  ],
);

export const avatars = pgTable(
  "avatars",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: text("checksum").notNull(),
    contentEtag: text("content_etag"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("avatars_workspace_entity_unique").on(
      table.workspaceId,
      table.entityType,
      table.entityId,
    ),
    index("avatars_workspace_id_idx").on(table.workspaceId),
  ],
);

export const mentions = pgTable(
  "mentions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    excerpt: text("excerpt"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("mentions_workspace_user_idx").on(table.workspaceId, table.userId),
    index("mentions_source_idx").on(table.workspaceId, table.sourceType, table.sourceId),
  ],
);

export const syncEvents = pgTable(
  "sync_events",
  {
    cursor: serial("cursor").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    mutationId: text("mutation_id").notNull(),
    deviceId: text("device_id"),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    operation: text("operation").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sync_events_workspace_mutation_unique").on(
      table.workspaceId,
      table.mutationId,
    ),
    index("sync_events_workspace_cursor_idx").on(table.workspaceId, table.cursor),
    index("sync_events_device_id_idx").on(table.deviceId),
    index("sync_events_created_at_idx").on(table.createdAt),
  ],
);

/**
 * Owner-managed templates that spawn tasks on a UTC cron schedule.
 * Managed from backsteros-admin; runner ticks inside the API process.
 */
export const recurringTasks = pgTable(
  "recurring_tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    inbox: boolean("inbox").notNull().default(true),
    /** 5-field UTC cron: minute hour day-of-month month day-of-week */
    cronExpression: text("cron_expression").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastTaskId: text("last_task_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("recurring_tasks_workspace_id_idx").on(table.workspaceId),
    index("recurring_tasks_due_idx").on(table.enabled, table.nextRunAt),
    index("recurring_tasks_deleted_at_idx").on(table.deletedAt),
  ],
);

export const entityCounters = pgTable(
  "entity_counters",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entity: text("entity").notNull(),
    scopeId: text("scope_id").notNull(),
    nextValue: integer("next_value").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "entity_counters_workspace_entity_scope_pk",
      columns: [table.workspaceId, table.entity, table.scopeId],
    }),
  ],
);

export const mutationReceipts = pgTable(
  "mutation_receipts",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    mutationId: text("mutation_id").notNull(),
    deviceId: text("device_id"),
    result: jsonb("result").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "mutation_receipts_workspace_mutation_pk",
      columns: [table.workspaceId, table.mutationId],
    }),
    index("mutation_receipts_created_at_idx").on(table.createdAt),
  ],
);

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    ibanOrMask: text("iban_or_mask"),
    currency: text("currency").notNull().default("EUR"),
    type: text("type").notNull().default("bank_account"),
    avatarStorageKey: text("avatar_storage_key"),
    avatarContentType: text("avatar_content_type"),
    /** Optional chart / accent color (#RRGGBB). */
    color: text("color"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("bank_accounts_workspace_key_unique").on(
      table.workspaceId,
      table.key,
    ),
    index("bank_accounts_workspace_id_idx").on(table.workspaceId),
    index("bank_accounts_deleted_at_idx").on(table.deletedAt),
  ],
);

export const financialCategories = pgTable(
  "financial_categories",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    kind: text("kind").notNull().default("expense"),
    listing: text("listing").notNull().default("regular"),
    icon: text("icon"),
    budgetCents: bigint("budget_cents", { mode: "number" }),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("financial_categories_workspace_id_idx").on(table.workspaceId),
    index("financial_categories_parent_id_idx").on(table.parentId),
    index("financial_categories_deleted_at_idx").on(table.deletedAt),
    foreignKey({
      name: "financial_categories_parent_id_fk",
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
  ],
);

export const financialGoals = pgTable(
  "financial_goals",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    listing: text("listing").notNull().default("active"),
    icon: text("icon"),
    goalAmountCents: bigint("goal_amount_cents", { mode: "number" }),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    contributionCents: bigint("contribution_cents", { mode: "number" }),
    savingMode: text("saving_mode").notNull().default("monthly"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("financial_goals_workspace_id_idx").on(table.workspaceId),
    index("financial_goals_deleted_at_idx").on(table.deletedAt),
  ],
);

export const financialRecurrings = pgTable(
  "financial_recurrings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    categoryId: text("category_id").references(() => financialCategories.id, {
      onDelete: "set null",
    }),
    amountCents: bigint("amount_cents", { mode: "number" }),
    nextDate: date("next_date", { mode: "string" }),
    archived: boolean("archived").notNull().default(false),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("financial_recurrings_workspace_id_idx").on(table.workspaceId),
    index("financial_recurrings_category_id_idx").on(table.categoryId),
    index("financial_recurrings_deleted_at_idx").on(table.deletedAt),
  ],
);

export const financialImportBatches = pgTable(
  "financial_import_batches",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    originalFilename: text("original_filename").notNull().default(""),
    storageKey: text("storage_key").notNull().default(""),
    dialect: text("dialect").notNull().default("unknown"),
    rowCount: integer("row_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("financial_import_batches_workspace_id_idx").on(table.workspaceId),
    index("financial_import_batches_bank_account_id_idx").on(table.bankAccountId),
  ],
);

export const financialTransactions = pgTable(
  "financial_transactions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    importBatchId: text("import_batch_id").references(
      () => financialImportBatches.id,
      { onDelete: "set null" },
    ),
    bookedOn: date("booked_on", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    payee: text("payee").notNull().default(""),
    counterparty: text("counterparty"),
    memo: text("memo"),
    /**
     * Optional user-facing label. Original payee/memo/raw stay untouched for
     * bank matching; when set, clients prefer this for list/detail titles.
     */
    displayName: text("display_name"),
    balanceAfterCents: integer("balance_after_cents"),
    externalId: text("external_id"),
    fingerprint: text("fingerprint").notNull(),
    sourceCode: text("source_code"),
    sourceType: text("source_type"),
    raw: jsonb("raw").notNull().default(sql`'{}'::jsonb`),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    categoryId: text("category_id").references(() => financialCategories.id, {
      onDelete: "set null",
    }),
    goalId: text("goal_id").references(() => financialGoals.id, {
      onDelete: "set null",
    }),
    recurringId: text("recurring_id").references(() => financialRecurrings.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("financial_transactions_account_booked_idx").on(
      table.workspaceId,
      table.bankAccountId,
      table.bookedOn,
    ),
    uniqueIndex("financial_transactions_account_fingerprint_unique").on(
      table.bankAccountId,
      table.fingerprint,
    ),
    uniqueIndex("financial_transactions_account_external_id_unique")
      .on(table.bankAccountId, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    index("financial_transactions_organization_id_idx").on(table.organizationId),
    index("financial_transactions_project_id_idx").on(table.projectId),
    index("financial_transactions_category_id_idx").on(table.categoryId),
    index("financial_transactions_goal_id_idx").on(table.goalId),
    index("financial_transactions_recurring_id_idx").on(table.recurringId),
  ],
);

export const emailThreads = pgTable(
  "email_threads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    inboxId: text("inbox_id").notNull(),
    threadKey: text("thread_key").notNull(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    assigneeId: text("assignee_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("triage"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("email_threads_workspace_inbox_thread_key_idx").on(
      table.workspaceId,
      table.inboxId,
      table.threadKey,
    ),
    index("email_threads_workspace_id_idx").on(table.workspaceId),
    index("email_threads_organization_id_idx").on(table.organizationId),
    index("email_threads_contact_id_idx").on(table.contactId),
    index("email_threads_assignee_id_idx").on(table.assigneeId),
  ],
);

export type DbUser = typeof users.$inferSelect;
export type DbApiKey = typeof apiKeys.$inferSelect;
export type DbProject = typeof projects.$inferSelect;
export type DbRecurringTask = typeof recurringTasks.$inferSelect;
export type DbTask = typeof tasks.$inferSelect;
export type DbHabit = typeof habits.$inferSelect;
export type DbTaskComment = typeof taskComments.$inferSelect;
export type DbTaskActivity = typeof taskActivities.$inferSelect;
export type DbDocument = typeof documents.$inferSelect;
export type DbWorkspace = typeof workspaces.$inferSelect;
export type DbOrganization = typeof organizations.$inferSelect;
export type DbContact = typeof contacts.$inferSelect;
export type DbArea = typeof areas.$inferSelect;
export type DbLetter = typeof letters.$inferSelect;
export type DbAvatar = typeof avatars.$inferSelect;
export type DbTaskImage = typeof taskImages.$inferSelect;
export type DbBankAccount = typeof bankAccounts.$inferSelect;
export type DbFinancialCategory = typeof financialCategories.$inferSelect;
export type DbFinancialGoal = typeof financialGoals.$inferSelect;
export type DbFinancialRecurring = typeof financialRecurrings.$inferSelect;
export type DbFinancialImportBatch = typeof financialImportBatches.$inferSelect;
export type DbFinancialTransaction = typeof financialTransactions.$inferSelect;
export type DbEmailThread = typeof emailThreads.$inferSelect;
