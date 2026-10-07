/**
 * Natural-key forks (OS-40 / OS-89).
 *
 * Some replicated tables have no deleted_at but carry a UNIQUE index on a
 * business key besides the primary key. When local and cloud each create
 * "their" row for the same business key (getOrCreate on both cores), the rows
 * get different primary ids. The generic upsert conflicts on id only, so the
 * second unique index raises 23505 on every apply and the row dead-letters.
 *
 * For these tables the business key is the identity: one row per key, newest
 * updated_at wins (whole row, including id), the loser is removed. The tie-break
 * is the larger id so both peers pick the same survivor without coordination.
 * Only register tables here whose primary id is not referenced by other rows.
 */

/** table -> natural key columns (must match a UNIQUE index on that table). */
export const NATURAL_KEY_TABLES: Readonly<Record<string, readonly string[]>> = {
  // space_publish_settings_workspace_space_uidx. space_site_keys reference
  // (workspace_id, space_document_id), not the settings id.
  space_publish_settings: ["workspace_id", "space_document_id"],
  // space_site_keys_space_prefix_uidx. Prefix is the lookup identity; ids are
  // not referenced. Multiple keys per space stay allowed when prefixes differ.
  space_site_keys: ["workspace_id", "space_document_id", "site_key_prefix"],
  // avatars_workspace_entity_unique. One blob row per entity; ids unused as FKs.
  avatars: ["workspace_id", "entity_type", "entity_id"],
  // device_push_tokens_workspace_token_uidx. Register-on-both-cores forks.
  device_push_tokens: ["workspace_id", "token"],
  // financial_transactions_account_fingerprint_unique. Dual CSV/Moneybird
  // import of the same booked line. Transaction ids are not referenced.
  financial_transactions: ["bank_account_id", "fingerprint"],
};

export function naturalKeyColumnsFor(table: string): readonly string[] | null {
  return NATURAL_KEY_TABLES[table] ?? null;
}

export type UniqueForkPolicy =
  | "heal_natural_key"
  | "heal_soft_unique"
  | "renumber"
  | "pk_is_unique"
  | "dead_letter"
  | "not_unique";

/** Inventory of replicated unique indexes that can 23505 across cores (OS-89). */
export const REPLICATED_UNIQUE_FORKS: readonly {
  table: string;
  constraint: string;
  columns: readonly string[];
  policy: UniqueForkPolicy;
  reason: string;
}[] = [
  {
    table: "space_publish_settings",
    constraint: "space_publish_settings_workspace_space_uidx",
    columns: ["workspace_id", "space_document_id"],
    policy: "heal_natural_key",
    reason: "getOrCreate on both cores; settings id is not referenced.",
  },
  {
    table: "space_site_keys",
    constraint: "space_site_keys_space_prefix_uidx",
    columns: ["workspace_id", "space_document_id", "site_key_prefix"],
    policy: "heal_natural_key",
    reason: "Same prefix is one key; ids are not referenced.",
  },
  {
    table: "avatars",
    constraint: "avatars_workspace_entity_unique",
    columns: ["workspace_id", "entity_type", "entity_id"],
    policy: "heal_natural_key",
    reason: "One avatar per entity; ids are not referenced.",
  },
  {
    table: "device_push_tokens",
    constraint: "device_push_tokens_workspace_token_uidx",
    columns: ["workspace_id", "token"],
    policy: "heal_natural_key",
    reason: "One row per device token; ids are not referenced.",
  },
  {
    table: "financial_transactions",
    constraint: "financial_transactions_account_fingerprint_unique",
    columns: ["bank_account_id", "fingerprint"],
    policy: "heal_natural_key",
    reason: "Fingerprint is the booked-line identity; ids are not referenced.",
  },
  {
    table: "tasks",
    constraint: "tasks_habit_due_unique",
    columns: ["habit_id", "due_date"],
    policy: "heal_soft_unique",
    reason: "Partial unique; soft-delete the live loser (existing apply heal).",
  },
  {
    table: "organizations",
    constraint: "organizations_workspace_number_unique",
    columns: ["workspace_id", "number"],
    policy: "heal_soft_unique",
    reason: "Partial unique; soft-delete the live loser (existing apply heal).",
  },
  {
    table: "contacts",
    constraint: "contacts_workspace_number_unique",
    columns: ["workspace_id", "number"],
    policy: "heal_soft_unique",
    reason: "Partial unique; soft-delete the live loser (existing apply heal).",
  },
  {
    table: "client_estimates",
    constraint: "client_estimates_workspace_number_uidx",
    columns: ["workspace_id", "number"],
    policy: "heal_soft_unique",
    reason: "Partial unique ES-{n}; soft-delete the live loser.",
  },
  {
    table: "tasks",
    constraint: "tasks_workspace_scope_number_unique",
    columns: ["workspace_id", "scope", "number"],
    policy: "renumber",
    reason: "OS-70 keeps both tasks and moves the later-created number.",
  },
  {
    table: "meeting_scheduling_settings",
    constraint: "meeting_scheduling_settings_workspace_id_uidx",
    columns: ["workspace_id"],
    policy: "pk_is_unique",
    reason: "Primary key is workspace_id; generic upsert cannot fork ids.",
  },
  {
    table: "workspace_settings",
    constraint: "workspace_settings_pkey",
    columns: ["workspace_id"],
    policy: "pk_is_unique",
    reason: "Primary key is workspace_id.",
  },
  {
    table: "workspace_integration_secrets",
    constraint: "workspace_integration_secrets_pkey",
    columns: ["workspace_id"],
    policy: "pk_is_unique",
    reason: "Primary key is workspace_id.",
  },
  {
    table: "entity_counters",
    constraint: "entity_counters_pkey",
    columns: ["workspace_id", "entity", "scope_id"],
    policy: "pk_is_unique",
    reason: "Composite primary key is the business key.",
  },
  {
    table: "users",
    constraint: "users_clerk_id_unique",
    columns: ["clerk_id"],
    policy: "dead_letter",
    reason: "users.id is referenced widely; merging twins would break FKs.",
  },
  {
    table: "workspaces",
    constraint: "workspaces_slug_unique",
    columns: ["slug"],
    policy: "dead_letter",
    reason: "workspaces.id is the tenant key; do not delete a twin workspace.",
  },
  {
    table: "projects",
    constraint: "projects_workspace_key_unique",
    columns: ["workspace_id", "key"],
    policy: "dead_letter",
    reason: "projects.id is referenced by tasks and others.",
  },
  {
    table: "contacts",
    constraint: "contacts_workspace_portal_username_unique",
    columns: ["workspace_id", "portal_username"],
    policy: "dead_letter",
    reason: "contacts.id is referenced; username collision is not identity.",
  },
  {
    table: "contacts",
    constraint: "contacts_email_idx",
    columns: ["workspace_id", "email"],
    policy: "not_unique",
    reason:
      "OS-72 mentioned contacts email 23505; contacts_email_idx is a plain index, not UNIQUE.",
  },
  {
    table: "organizations",
    constraint: "organizations_workspace_moneybird_contact_uidx",
    columns: ["workspace_id", "moneybird_contact_id"],
    policy: "dead_letter",
    reason: "organizations.id is referenced; Moneybird id is not a safe merge key.",
  },
  {
    table: "bank_accounts",
    constraint: "bank_accounts_workspace_key_unique",
    columns: ["workspace_id", "key"],
    policy: "dead_letter",
    reason: "bank_accounts.id is referenced by financial_transactions.",
  },
  {
    table: "bank_accounts",
    constraint: "bank_accounts_workspace_moneybird_financial_account_uidx",
    columns: ["workspace_id", "moneybird_financial_account_id"],
    policy: "dead_letter",
    reason: "bank_accounts.id is referenced; do not merge ledgers.",
  },
  {
    table: "financial_transactions",
    constraint: "financial_transactions_account_external_id_unique",
    columns: ["bank_account_id", "external_id"],
    policy: "dead_letter",
    reason:
      "Healed on fingerprint instead. Same external_id with a different fingerprint stays a dead letter.",
  },
  {
    table: "email_threads",
    constraint: "email_threads_workspace_inbox_thread_key_idx",
    columns: ["workspace_id", "inbox_id", "thread_key"],
    policy: "dead_letter",
    reason: "email_threads.id is referenced by comments.",
  },
  {
    table: "email_threads",
    constraint: "email_threads_workspace_number_idx",
    columns: ["workspace_id", "number"],
    policy: "dead_letter",
    reason: "Thread numbers identify distinct threads; ids are referenced.",
  },
  {
    table: "documents",
    constraint: "documents_workspace_doc_key_idx",
    columns: ["workspace_id", "doc_key"],
    policy: "dead_letter",
    reason: "documents.id is referenced (spaces, attachments, comments).",
  },
  {
    table: "document_property_types",
    constraint: "document_property_types_workspace_key_live_idx",
    columns: ["workspace_id", "key"],
    policy: "dead_letter",
    reason: "Partial unique on live types; hard-deleting a twin is unsafe.",
  },
];

export type NaturalKeyRowMeta = {
  id: string;
  updatedAt: Date;
};

/**
 * Decide which row survives a natural-key fork. Deterministic and symmetric:
 * naturalKeyForkWinner(a, b) on one peer and naturalKeyForkWinner(b, a) on the
 * other always keep the same row.
 */
export function naturalKeyForkWinner(
  incoming: NaturalKeyRowMeta,
  existing: NaturalKeyRowMeta,
): "incoming" | "existing" {
  const incomingMs = incoming.updatedAt.getTime();
  const existingMs = existing.updatedAt.getTime();
  if (Number.isFinite(incomingMs) && Number.isFinite(existingMs)) {
    if (incomingMs > existingMs) return "incoming";
    if (incomingMs < existingMs) return "existing";
  } else if (Number.isFinite(incomingMs)) {
    return "incoming";
  } else if (Number.isFinite(existingMs)) {
    return "existing";
  }
  return incoming.id > existing.id ? "incoming" : "existing";
}
