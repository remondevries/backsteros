import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
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
    icon: text("icon"),
    color: text("color"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("areas_workspace_id_idx").on(table.workspaceId)],
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("api_keys_prefix_idx").on(table.prefix),
    index("api_keys_workspace_id_idx").on(table.workspaceId),
    index("api_keys_user_id_idx").on(table.userId),
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
    legacySource: text("legacy_source"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
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

export const migrationRuns = pgTable(
  "migration_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceFingerprint: text("source_fingerprint").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("running"),
    sourceInventory: jsonb("source_inventory").notNull().default(sql`'{}'::jsonb`),
    summary: jsonb("summary").notNull().default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("migration_runs_workspace_started_idx").on(table.workspaceId, table.startedAt),
  ],
);

export const migrationItems = pgTable(
  "migration_items",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceFingerprint: text("source_fingerprint").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => migrationRuns.id, { onDelete: "cascade" }),
    targetTable: text("target_table"),
    targetId: text("target_id"),
    sourceChecksum: text("source_checksum"),
    targetChecksum: text("target_checksum"),
    status: text("status").notNull().default("pending"),
    details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({
      name: "migration_items_source_pk",
      columns: [
        table.workspaceId,
        table.sourceFingerprint,
        table.sourceType,
        table.sourceId,
      ],
    }),
    index("migration_items_run_status_idx").on(table.runId, table.status),
    index("migration_items_target_idx").on(table.targetTable, table.targetId),
  ],
);

export type DbUser = typeof users.$inferSelect;
export type DbApiKey = typeof apiKeys.$inferSelect;
export type DbProject = typeof projects.$inferSelect;
export type DbTask = typeof tasks.$inferSelect;
export type DbDocument = typeof documents.$inferSelect;
export type DbWorkspace = typeof workspaces.$inferSelect;
export type DbOrganization = typeof organizations.$inferSelect;
export type DbContact = typeof contacts.$inferSelect;
export type DbArea = typeof areas.$inferSelect;
export type DbLetter = typeof letters.$inferSelect;
export type DbAvatar = typeof avatars.$inferSelect;
export type DbMigrationRun = typeof migrationRuns.$inferSelect;
export type DbMigrationItem = typeof migrationItems.$inferSelect;
