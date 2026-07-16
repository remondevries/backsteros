import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
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

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
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
    index("api_keys_user_id_idx").on(table.userId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    description: text("description"),
    status: text("status").notNull().default("backlog"),
    priority: integer("priority").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
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
    index("projects_key_idx").on(table.key),
    index("projects_deleted_at_idx").on(table.deletedAt),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("ready_to_start"),
    priority: integer("priority").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
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
    index("tasks_status_idx").on(table.status),
    index("tasks_deleted_at_idx").on(table.deletedAt),
    index("tasks_project_number_idx").on(table.projectId, table.number),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
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
    index("documents_project_id_idx").on(table.projectId),
    index("documents_path_idx").on(table.path),
    index("documents_deleted_at_idx").on(table.deletedAt),
    index("documents_type_project_path_idx").on(
      table.type,
      table.projectId,
      table.path,
    ),
  ],
);

export type DbUser = typeof users.$inferSelect;
export type DbApiKey = typeof apiKeys.$inferSelect;
export type DbProject = typeof projects.$inferSelect;
export type DbTask = typeof tasks.$inferSelect;
export type DbDocument = typeof documents.$inferSelect;
