import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
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
    agentmailReplyGreetingTemplateEn: text(
      "agentmail_reply_greeting_template_en",
    ),
    agentmailReplyGreetingTemplateNl: text(
      "agentmail_reply_greeting_template_nl",
    ),
    agentmailReplySignOffTemplate: text("agentmail_reply_sign_off_template"),
    agentmailReplySignOffTemplateEn: text("agentmail_reply_sign_off_template_en"),
    agentmailReplySignOffTemplateNl: text("agentmail_reply_sign_off_template_nl"),
    agentmailReplySignOffName: text("agentmail_reply_sign_off_name"),
    agentmailWebhookId: text("agentmail_webhook_id"),
    agentmailWebhookSecret: text("agentmail_webhook_secret"),
    agentmailWebhookUrl: text("agentmail_webhook_url"),
    mapboxAccessToken: text("mapbox_access_token"),
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
    /** Labeled addresses (`{ label, address }[]`) — general | support | other. */
    emails: jsonb("emails")
      .$type<{ label: "general" | "support" | "other"; address: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Labeled numbers (`{ label, number }[]`) — general | support | other. */
    phones: jsonb("phones")
      .$type<{ label: "general" | "support" | "other"; number: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    website: text("website"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    /** State / province / region (Mapbox `region`); optional. */
    region: text("region"),
    /** Geocoded from address fields (Mapbox); null until resolved. */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    /** Company size label (free text). */
    size: text("size"),
    socialAccounts: jsonb("social_accounts")
      .$type<{ platform: string; url: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Chamber of Commerce / KvK (often from Moneybird). */
    chamberOfCommerce: text("chamber_of_commerce"),
    /** VAT / tax number (often from Moneybird). */
    taxNumber: text("tax_number"),
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
    uniqueIndex("organizations_workspace_number_unique")
      .on(table.workspaceId, table.number)
      .where(sql`${table.deletedAt} is null and ${table.number} is not null`),
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
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    email: text("email"),
    /** Labeled addresses (`{ label, address }[]`), including primary for its type. */
    emails: jsonb("emails")
      .$type<{ label: "personal" | "work" | "other"; address: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    title: text("title"),
    summary: text("summary"),
    avatarStorageKey: text("avatar_storage_key"),
    avatarContentType: text("avatar_content_type"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    phone: text("phone"),
    /** Labeled numbers (`{ label, number }[]`), including primary for its type. */
    phones: jsonb("phones")
      .$type<{ label: "personal" | "work" | "other"; number: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    role: text("role"),
    notes: text("notes"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    /** State / province / region (Mapbox `region`); optional. */
    region: text("region"),
    /** Geocoded from address fields (Mapbox); null until resolved. */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    socialAccounts: jsonb("social_accounts")
      .$type<{ platform: string; url: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Full calendar date YYYY-MM-DD; year required (yearless deferred). */
    birthday: date("birthday", { mode: "string" }),
    /** Preferred languages (`nl` | `en` | `de` | `es` | `fr` | `pl`). */
    languages: jsonb("languages")
      .$type<Array<"nl" | "en" | "de" | "es" | "fr" | "pl">>()
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
    uniqueIndex("contacts_workspace_number_unique")
      .on(table.workspaceId, table.number)
      .where(sql`${table.deletedAt} is null and ${table.number} is not null`),
    index("contacts_organization_id_idx").on(table.organizationId),
    index("contacts_email_idx").on(table.workspaceId, table.email),
    index("contacts_birthday_idx").on(table.workspaceId, table.birthday),
    index("contacts_first_name_idx").on(table.workspaceId, table.firstName),
    index("contacts_last_name_idx").on(table.workspaceId, table.lastName),
  ],
);

/** Directed contact↔contact edges (Spouse, Child, etc.). Inverse shown in UI without duplicating rows. */
export const contactRelationships = pgTable(
  "contact_relationships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fromContactId: text("from_contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    toContactId: text("to_contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("contact_relationships_workspace_id_idx").on(table.workspaceId),
    index("contact_relationships_from_contact_id_idx").on(table.fromContactId),
    index("contact_relationships_to_contact_id_idx").on(table.toContactId),
    index("contact_relationships_deleted_at_idx").on(table.deletedAt),
  ],
);

/** Bidirectional contact relationship label pairs (Parent ↔ Child, etc.). */
export const crmRelationshipLabels = pgTable(
  "crm_relationship_labels",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sideALabel: text("side_a_label").notNull(),
    sideASlug: text("side_a_slug").notNull(),
    sideBLabel: text("side_b_label").notNull(),
    sideBSlug: text("side_b_slug").notNull(),
    color: text("color"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("crm_relationship_labels_workspace_id_idx").on(table.workspaceId),
    index("crm_relationship_labels_deleted_at_idx").on(table.deletedAt),
    index("crm_relationship_labels_side_a_slug_idx").on(
      table.workspaceId,
      table.sideASlug,
    ),
    index("crm_relationship_labels_side_b_slug_idx").on(
      table.workspaceId,
      table.sideBSlug,
    ),
  ],
);

/** User-curated CRM groups (contacts and/or organizations). */
export const crmGroups = pgTable(
  "crm_groups",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    icon: text("icon"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("crm_groups_workspace_id_idx").on(table.workspaceId),
    index("crm_groups_deleted_at_idx").on(table.deletedAt),
  ],
);

export const crmGroupMembers = pgTable(
  "crm_group_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => crmGroups.id, { onDelete: "cascade" }),
    /** contact | organization */
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("crm_group_members_workspace_id_idx").on(table.workspaceId),
    index("crm_group_members_group_id_idx").on(table.groupId),
    index("crm_group_members_subject_idx").on(
      table.workspaceId,
      table.subjectType,
      table.subjectId,
    ),
    index("crm_group_members_deleted_at_idx").on(table.deletedAt),
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("api_keys_prefix_idx").on(table.prefix),
    index("api_keys_workspace_id_idx").on(table.workspaceId),
    index("api_keys_user_id_idx").on(table.userId),
    index("api_keys_contact_id_idx").on(table.contactId),
    index("api_keys_updated_at_id_idx").on(table.updatedAt, table.id),
  ],
);

/**
 * Per-table cursors for local-core ↔ cloud-core replication.
 * Pull and push watermarks are independent so advancing the peer tip on pull
 * cannot skip local rows that still need to be pushed (Linear-shaped: no shared
 * bidirectional clock).
 * Legacy `updated_at` / `row_id` columns remain for older rows; new code uses
 * pull_* / push_* exclusively.
 */
export const coreReplicationCursors = pgTable("core_replication_cursors", {
  tableName: text("table_name").primaryKey(),
  /** @deprecated Prefer pullUpdatedAt / pushUpdatedAt. */
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  /** @deprecated Prefer pullRowId / pushRowId. */
  rowId: text("row_id").notNull().default(""),
  pullUpdatedAt: timestamp("pull_updated_at", { withTimezone: true }),
  pullRowId: text("pull_row_id").notNull().default(""),
  pushUpdatedAt: timestamp("push_updated_at", { withTimezone: true }),
  pushRowId: text("push_row_id").notNull().default(""),
});

/**
 * Per-workspace watermark for peer sync_events delta pull (Linear-shaped).
 * Replica advances `after_cursor` only after applying peer events in order.
 * Does not invent a second LWW path — peer `sync_events.cursor` is authority.
 */
export const coreSyncEventReplicationState = pgTable(
  "core_sync_event_replication_state",
  {
    workspaceId: text("workspace_id").primaryKey(),
    afterCursor: integer("after_cursor").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
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
    /** Contacts this task is about / for (CRM Related; not the assignee). */
    relatedContactIds: jsonb("related_contact_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Organizations this task is about / for (CRM Related; same UI field as contacts). */
    relatedOrganizationIds: jsonb("related_organization_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("ready_to_start"),
    priority: integer("priority").notNull().default(0),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
    /** Optional end of a timed calendar block; null = all-day due date. */
    dueEndDate: timestamp("due_end_date", { withTimezone: true }),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    inbox: boolean("inbox").notNull().default(false),
    links: jsonb("links")
      .$type<{ id: string; url: string; createdAt: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Cursor Agent chat id (`agent --resume <id>`); one active session per task. */
    agentChatId: text("agent_chat_id"),
    /**
     * GitHub commit SHA linked as this task’s change record (desktop Diff view).
     * Full or abbreviated SHA as returned by the project’s GitHub API.
     */
    linkedCommitSha: text("linked_commit_sha"),
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
    /** Manual / timer tracked duration (whole minutes; legacy). */
    trackedMinutes: integer("tracked_minutes"),
    /** Manual / timer tracked duration (whole seconds). */
    trackedDurationSeconds: integer("tracked_duration_seconds"),
    /** Inbox “Updated” flag — external/agent edits while status qualifies. */
    inboxUpdatedAt: timestamp("inbox_updated_at", { withTimezone: true }),
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

export type MeetingWorkingHours = {
  weekdays: number[];
  start: string;
  end: string;
};

/** Public booking / calendar availability settings (one row per workspace). */
export const meetingSchedulingSettings = pgTable(
  "meeting_scheduling_settings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("Book a meeting"),
    timezone: text("timezone").notNull().default("Europe/Amsterdam"),
    workingHours: jsonb("working_hours")
      .$type<MeetingWorkingHours>()
      .notNull()
      .default(
        sql`'{"weekdays":[1,2,3,4,5],"start":"09:00","end":"17:00"}'::jsonb`,
      ),
    weekdayHours: jsonb("weekday_hours").notNull(),
    durationsMinutes: jsonb("durations_minutes")
      .$type<number[]>()
      .notNull()
      .default(sql`'[30,60]'::jsonb`),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(120),
    bufferMinutes: integer("buffer_minutes").notNull().default(15),
    horizonDays: integer("horizon_days").notNull().default(28),
    defaultProjectId: text("default_project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    defaultOrganizationId: text("default_organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("meeting_scheduling_settings_workspace_id_uidx").on(
      table.workspaceId,
    ),
  ],
);

export type DbMeetingSchedulingSettings =
  typeof meetingSchedulingSettings.$inferSelect;

/** Calendar meetings (workspace-scoped, M-1 display ids). */
export const meetings = pgTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    number: integer("number"),
    title: text("title").notNull(),
    summary: text("summary"),
    notes: text("notes"),
    transcription: text("transcription"),
    status: text("status").notNull().default("ready_to_start"),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    attendeeContactIds: jsonb("attendee_contact_ids")
      .notNull()
      .default(sql`'[]'::jsonb`),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    /** video_call | in_person | phone_call */
    format: text("format").notNull().default("video_call"),
    /** Free-text place snapshot (optional; prefer locationOrganizationId). */
    location: text("location"),
    /** Venue organization for in-person meetings (independent of organizationId). */
    locationOrganizationId: text("location_organization_id").references(
      () => organizations.id,
      { onDelete: "set null" },
    ),
    /** Manual / timer tracked duration (whole minutes; legacy). */
    trackedMinutes: integer("tracked_minutes"),
    /** Manual / timer tracked duration (whole seconds). */
    trackedDurationSeconds: integer("tracked_duration_seconds"),
    inboxUpdatedAt: timestamp("inbox_updated_at", { withTimezone: true }),
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
    index("meetings_workspace_id_idx").on(table.workspaceId),
    index("meetings_workspace_number_idx").on(table.workspaceId, table.number),
    index("meetings_workspace_start_at_idx").on(table.workspaceId, table.startAt),
  ],
);

/**
 * Unified CRM activity feed items (notes + meeting pointers).
 * Note bodies are capped (Tier A); meeting rows are projections onto meetings.
 */
export const crmActivities = pgTable(
  "crm_activities",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** contact | organization */
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    /** note | meeting */
    kind: text("kind").notNull(),
    body: text("body"),
    bodyPreview: text("body_preview"),
    meetingId: text("meeting_id").references(() => meetings.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("crm_activities_workspace_id_idx").on(table.workspaceId),
    index("crm_activities_subject_idx").on(
      table.workspaceId,
      table.subjectType,
      table.subjectId,
    ),
    index("crm_activities_occurred_at_idx").on(table.occurredAt),
    index("crm_activities_meeting_id_idx").on(table.meetingId),
    index("crm_activities_deleted_at_idx").on(table.deletedAt),
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

/**
 * Ephemeral live agent-working presence per task. Not replicated — clients
 * heartbeat against the core API; stale rows expire by last_heartbeat_at TTL.
 */
export const taskAgentPresence = pgTable(
  "task_agent_presence",
  {
    taskId: text("task_id")
      .primaryKey()
      .references(() => tasks.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Client that owns the live run: t3 | desktop | … */
    source: text("source").notNull().default("unknown"),
    sessionId: text("session_id"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("task_agent_presence_workspace_id_idx").on(table.workspaceId),
    index("task_agent_presence_workspace_heartbeat_idx").on(
      table.workspaceId,
      table.lastHeartbeatAt,
    ),
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

/** Task PDF file attachments (Tier B metadata + Tier D blob; REST list, not PowerSync). */
export const taskAttachments = pgTable(
  "task_attachments",
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
    index("task_attachments_workspace_id_idx").on(table.workspaceId),
    index("task_attachments_task_id_idx").on(table.taskId),
    index("task_attachments_task_sort_idx").on(table.taskId, table.sortOrder),
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
    /** Moneybird financial account id when this ledger is synced from Moneybird. */
    moneybirdFinancialAccountId: text("moneybird_financial_account_id"),
    moneybirdLastSyncedAt: timestamp("moneybird_last_synced_at", {
      withTimezone: true,
    }),
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
    uniqueIndex("bank_accounts_workspace_moneybird_financial_account_uidx")
      .on(table.workspaceId, table.moneybirdFinancialAccountId)
      .where(
        sql`${table.moneybirdFinancialAccountId} IS NOT NULL AND ${table.deletedAt} IS NULL`,
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

/** Hand-typed Cash Flow planning scratchpad — not linked to imports/recurrings. */
export const cashflowPlannerEntries = pgTable(
  "cashflow_planner_entries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entryType: text("entry_type").notNull().default("expense"),
    name: text("name").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    groupLabel: text("group_label"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("cashflow_planner_entries_workspace_id_idx").on(table.workspaceId),
    index("cashflow_planner_entries_deleted_at_idx").on(table.deletedAt),
    index("cashflow_planner_entries_due_date_idx").on(table.dueDate),
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
    number: integer("number").notNull(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    assigneeId: text("assignee_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("backlog"),
    priority: integer("priority").notNull().default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
    inboxUpdatedAt: timestamp("inbox_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("email_threads_workspace_inbox_thread_key_idx").on(
      table.workspaceId,
      table.inboxId,
      table.threadKey,
    ),
    uniqueIndex("email_threads_workspace_number_idx").on(
      table.workspaceId,
      table.number,
    ),
    index("email_threads_workspace_id_idx").on(table.workspaceId),
    index("email_threads_organization_id_idx").on(table.organizationId),
    index("email_threads_contact_id_idx").on(table.contactId),
    index("email_threads_assignee_id_idx").on(table.assigneeId),
    index("email_threads_project_id_idx").on(table.projectId),
    index("email_threads_workspace_due_date_idx").on(table.workspaceId, table.dueDate),
  ],
);

export const emailThreadComments = pgTable(
  "email_thread_comments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    emailThreadId: text("email_thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    author: text("author").notNull().default("user"),
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
    index("email_thread_comments_email_thread_id_idx").on(table.emailThreadId),
    index("email_thread_comments_workspace_id_idx").on(table.workspaceId),
    index("email_thread_comments_created_at_idx").on(table.createdAt),
    index("email_thread_comments_deleted_at_idx").on(table.deletedAt),
  ],
);

export type DbUser = typeof users.$inferSelect;
export type DbApiKey = typeof apiKeys.$inferSelect;
export type DbProject = typeof projects.$inferSelect;
export type DbRecurringTask = typeof recurringTasks.$inferSelect;
export type DbTask = typeof tasks.$inferSelect;
export type DbHabit = typeof habits.$inferSelect;
export type DbMeeting = typeof meetings.$inferSelect;
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
export type DbTaskAttachment = typeof taskAttachments.$inferSelect;
export type DbBankAccount = typeof bankAccounts.$inferSelect;
export type DbFinancialCategory = typeof financialCategories.$inferSelect;
export type DbFinancialGoal = typeof financialGoals.$inferSelect;
export type DbFinancialRecurring = typeof financialRecurrings.$inferSelect;
export type DbCashflowPlannerEntry = typeof cashflowPlannerEntries.$inferSelect;
export type DbFinancialImportBatch = typeof financialImportBatches.$inferSelect;
export type DbFinancialTransaction = typeof financialTransactions.$inferSelect;
export type DbEmailThread = typeof emailThreads.$inferSelect;
export type DbEmailThreadComment = typeof emailThreadComments.$inferSelect;

/** Expo / APNs device tokens for inbox triage push (mobile). */
export const devicePushTokens = pgTable(
  "device_push_tokens",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    token: text("token").notNull(),
    deviceName: text("device_name"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("device_push_tokens_workspace_token_uidx").on(
      table.workspaceId,
      table.token,
    ),
    index("device_push_tokens_workspace_id_idx").on(table.workspaceId),
  ],
);

export type DbDevicePushToken = typeof devicePushTokens.$inferSelect;
