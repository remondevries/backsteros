import {
  type CreateProjectInput,
  type CreateTaskInput,
  normalizeMeetingAttendeePortalEmails,
  type Project,
  type Task,
  type UpdateProjectInput,
  type UpdateTaskInput,
} from "@backsteros/contracts";
export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Distinguish missing field (`undefined`) from clear (`null`).
 * PowerSync clients send `assignee_id: null` to unassign; `asString` would drop that.
 */
export function asNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value === "string") return value;
  return undefined;
}

/**
 * Prefer snake_case, then camelCase — but keep explicit `null` clears.
 * `payload.snake ?? payload.camel` is wrong: `null ?? x` skips the clear.
 */
function payloadValue(
  payload: Record<string, unknown>,
  snake: string,
  camel: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(payload, snake)) {
    return payload[snake];
  }
  if (Object.prototype.hasOwnProperty.call(payload, camel)) {
    return payload[camel];
  }
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Distinguish missing field (`undefined`) from clear (`null`). */
export function asNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  // PowerSync SQLite stores booleans as 0/1 integers.
  if (value === 0) return false;
  if (value === 1) return true;
  return undefined;
}

function asAutoReviewDeliveryStatus(
  value: unknown,
): UpdateTaskInput["autoReviewDeliveryStatus"] {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === "pending" || value === "delivered" || value === "failed") {
    return value;
  }
  return undefined;
}

export function parseOptionalDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" || value.length === 0) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseOptionalNullableDate(value: unknown): Date | null | undefined {
  if (value === null) return null;
  return parseOptionalDate(value);
}

export function isSoftDeletePayload(payload: Record<string, unknown>): boolean {
  const deletedAt = payload.deleted_at ?? payload.deletedAt;
  return deletedAt != null && deletedAt !== "";
}

/** Permanent client/data errors — acknowledge with 2xx so the upload queue is not blocked. */
export const POWERSYNC_SKIPPABLE_ERRORS = new Set([
  "TASK_TITLE_REQUIRED",
  "PROJECT_FIELDS_REQUIRED",
  "DOCUMENT_FIELDS_REQUIRED",
  "INVALID_ORGANIZATION",
  "INVALID_CONTACT",
  "INVALID_LETTER",
  "INVALID_WORKSPACE_SETTINGS",
  // Stale local assignee / contact ids should not block the upload queue.
  "ASSIGNEE_NOT_FOUND",
  "RELATED_CONTACT_NOT_FOUND",
  "TASK_LABEL_NOT_FOUND",
  "TASK_LABEL_NAME_TAKEN",
  "INVALID_TASK_LABEL",
  "CONTACT_NOT_FOUND",
  "PROJECT_NOT_FOUND",
  "HABIT_NOT_FOUND",
  "INVALID_HABIT",
  "INVALID_MEETING",
  "INVALID_MEETING_DATES",
  "MEETING_END_BEFORE_START",
  "INVALID_BANK_ACCOUNT",
  "INVALID_FINANCIAL_CATEGORY",
  "INVALID_FINANCIAL_GOAL",
  "INVALID_FINANCIAL_RECURRING",
  "INVALID_CASHFLOW_PLANNER_ENTRY",
  "INVALID_FINANCIAL_TRANSACTION",
  "INVALID_EMAIL_THREAD",
  "INVALID_EMAIL_THREAD_COMMENT",
  "INVALID_RECURRING_TASK",
  "INVALID_TASK_COMMENT",
  "INVALID_TASK_ACTIVITY",
  "INVALID_CONTACT_RELATIONSHIP",
  "INVALID_CRM_RELATIONSHIP_LABEL",
  "INVALID_CRM_GROUP",
  "INVALID_CRM_GROUP_MEMBER",
  "INVALID_CRM_ACTIVITY",
  "INVALID_NOTE_BODY",
  "INVALID_OCCURRED_AT",
  "SELF_RELATIONSHIP",
  "RELATIONSHIP_EXISTS",
]);

/** Permanent client/data errors must not 500 the upload queue. */
export function isPowerSyncSkippableError(error: unknown): error is Error {
  return (
    error instanceof Error && POWERSYNC_SKIPPABLE_ERRORS.has(error.message)
  );
}

export function camelizePayload(
  payload: Record<string, unknown>,
  keys: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [source, target] of Object.entries(keys)) {
    if (Object.prototype.hasOwnProperty.call(payload, source)) {
      result[target] = payload[source];
    } else if (Object.prototype.hasOwnProperty.call(payload, target)) {
      result[target] = payload[target];
    }
  }
  return result;
}

export const areaKeys = {
  name: "name",
  parent: "parent",
  icon: "icon",
  color: "color",
  sort_order: "sortOrder",
};

export const organizationKeys = {
  number: "number",
  key: "key",
  name: "name",
  summary: "summary",
  phone: "phone",
  email: "email",
  emails: "emails",
  phones: "phones",
  website: "website",
  address: "address",
  city: "city",
  postal_code: "postalCode",
  country: "country",
  region: "region",
  latitude: "latitude",
  longitude: "longitude",
  size: "size",
  social_accounts: "socialAccounts",
  chamber_of_commerce: "chamberOfCommerce",
  tax_number: "taxNumber",
  avatar_storage_key: "avatarStorageKey",
  avatar_content_type: "avatarContentType",
  sort_order: "sortOrder",
  notes: "notes",
  moneybird_contact_id: "moneybirdContactId",
};

export const contactKeys = {
  number: "number",
  key: "key",
  organization_id: "organizationId",
  name: "name",
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  emails: "emails",
  title: "title",
  summary: "summary",
  sort_order: "sortOrder",
  phone: "phone",
  phones: "phones",
  role: "role",
  notes: "notes",
  address: "address",
  city: "city",
  postal_code: "postalCode",
  country: "country",
  region: "region",
  timezone: "timezone",
  latitude: "latitude",
  longitude: "longitude",
  social_accounts: "socialAccounts",
  birthday: "birthday",
  languages: "languages",
  portal_username: "portalUsername",
  portal_password_hash: "portalPasswordHash",
  portal_settings: "portalSettings",
  avatar_storage_key: "avatarStorageKey",
  avatar_content_type: "avatarContentType",
  portal_avatar_storage_key: "portalAvatarStorageKey",
  portal_avatar_content_type: "portalAvatarContentType",
};

export function normalizeOrganizationSyncPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  if (typeof next.socialAccounts === "string") {
    try {
      next.socialAccounts = JSON.parse(next.socialAccounts);
    } catch {
      next.socialAccounts = [];
    }
  }
  if (typeof next.emails === "string") {
    try {
      next.emails = JSON.parse(next.emails);
    } catch {
      next.emails = [];
    }
  }
  if (typeof next.phones === "string") {
    try {
      next.phones = JSON.parse(next.phones);
    } catch {
      next.phones = [];
    }
  }
  return next;
}

export function normalizeContactSyncPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  if (typeof next.socialAccounts === "string") {
    try {
      next.socialAccounts = JSON.parse(next.socialAccounts);
    } catch {
      next.socialAccounts = [];
    }
  }
  if (typeof next.emails === "string") {
    try {
      next.emails = JSON.parse(next.emails);
    } catch {
      next.emails = [];
    }
  }
  if (typeof next.phones === "string") {
    try {
      next.phones = JSON.parse(next.phones);
    } catch {
      next.phones = [];
    }
  }
  if (typeof next.languages === "string") {
    try {
      next.languages = JSON.parse(next.languages);
    } catch {
      next.languages = [];
    }
  }
  if (typeof next.portalSettings === "string") {
    try {
      next.portalSettings = JSON.parse(next.portalSettings);
    } catch {
      next.portalSettings = {};
    }
  }
  return next;
}

export const letterKeys = {
  number: "number", project_id: "projectId", organization_id: "organizationId",
  contact_id: "contactId", title: "title", icon: "icon", context: "context",
  status: "status", due_date: "dueDate", received_date: "receivedDate",
  direction: "direction", original_filename: "originalFilename",
  storage_key: "storageKey", content_type: "contentType", byte_size: "byteSize",
  checksum: "checksum", content_etag: "contentEtag",
  sort_order: "sortOrder",
};

export const bankAccountKeys = {
  key: "key",
  name: "name",
  iban_or_mask: "ibanOrMask",
  currency: "currency",
  type: "type",
  color: "color",
  sort_order: "sortOrder",
  moneybird_financial_account_id: "moneybirdFinancialAccountId",
  moneybird_last_synced_at: "moneybirdLastSyncedAt",
  avatar_storage_key: "avatarStorageKey",
  avatar_content_type: "avatarContentType",
};

export const financialCategoryKeys = {
  name: "name",
  parent_id: "parentId",
  kind: "kind",
  listing: "listing",
  icon: "icon",
  budget_cents: "budgetCents",
  sort_order: "sortOrder",
};

export const financialGoalKeys = {
  name: "name",
  listing: "listing",
  icon: "icon",
  goal_amount_cents: "goalAmountCents",
  start_date: "startDate",
  end_date: "endDate",
  contribution_cents: "contributionCents",
  saving_mode: "savingMode",
  sort_order: "sortOrder",
};

export const habitKeys = {
  title: "title",
  icon: "icon",
  description: "description",
  project_id: "projectId",
  cadence: "cadence",
  cadence_anchor_ymd: "cadenceAnchorYmd",
  sort_order: "sortOrder",
};

export const meetingKeys = {
  title: "title",
  summary: "summary",
  notes: "notes",
  transcription: "transcription",
  status: "status",
  format: "format",
  location: "location",
  location_organization_id: "locationOrganizationId",
  project_id: "projectId",
  organization_id: "organizationId",
  attendee_contact_ids: "attendeeContactIds",
  attendee_portal_emails: "attendeePortalEmails",
  start_at: "startAt",
  end_at: "endAt",
  tracked_minutes: "trackedMinutes",
  tracked_duration_seconds: "trackedDurationSeconds",
  external_calendar_event_id: "externalCalendarEventId",
  calendar_id: "calendarId",
  sort_order: "sortOrder",
  acknowledge_inbox_update: "acknowledgeInboxUpdate",
  inbox_updated_at: "inboxUpdatedAt",
};

export const taskCommentKeys = {
  task_id: "taskId",
  parent_comment_id: "parentCommentId",
  author_user_id: "authorUserId",
  author_contact_id: "authorContactId",
  author_email: "authorEmail",
  body: "body",
  resolved_at: "resolvedAt",
};

export const taskActivityKeys = {
  task_id: "taskId",
  type: "type",
  actor_user_id: "actorUserId",
  actor_contact_id: "actorContactId",
  actor_email: "actorEmail",
  actor_name: "actorName",
  data: "data",
  body: "body",
  parent_id: "parentId",
  resolved_at: "resolvedAt",
  updated_at: "updatedAt",
  deleted_at: "deletedAt",
};

export const contactRelationshipKeys = {
  type: "type",
  note: "note",
};

export const crmRelationshipLabelKeys = {
  side_a_label: "sideALabel",
  side_a_slug: "sideASlug",
  side_b_label: "sideBLabel",
  side_b_slug: "sideBSlug",
  color: "color",
  sort_order: "sortOrder",
};

export const crmGroupKeys = {
  name: "name",
  description: "description",
  color: "color",
  icon: "icon",
  sort_order: "sortOrder",
};

export const financialRecurringKeys = {
  name: "name",
  icon: "icon",
  category_id: "categoryId",
  amount_cents: "amountCents",
  next_date: "nextDate",
  archived: "archived",
  sort_order: "sortOrder",
};

export const cashflowPlannerEntryKeys = {
  entry_type: "entryType",
  name: "name",
  amount_cents: "amountCents",
  due_date: "dueDate",
  group_label: "groupLabel",
  sort_order: "sortOrder",
};

export const financialTransactionKeys = {
  bank_account_id: "bankAccountId",
  organization_id: "organizationId",
  project_id: "projectId",
  category_id: "categoryId",
  goal_id: "goalId",
  recurring_id: "recurringId",
  notes: "notes",
  display_name: "displayName",
  booked_on: "bookedOn",
  amount_cents: "amountCents",
  currency: "currency",
  payee: "payee",
  counterparty: "counterparty",
  memo: "memo",
  balance_after_cents: "balanceAfterCents",
  external_id: "externalId",
  fingerprint: "fingerprint",
  source_code: "sourceCode",
  source_type: "sourceType",
  settlement_state: "settlementState",
  raw: "raw",
  import_batch_id: "importBatchId",
  moneybird_ledger_refresh: "moneybirdLedgerRefresh",
};

export const emailThreadKeys = {
  inbox_id: "inboxId",
  thread_key: "threadKey",
  number: "number",
  organization_id: "organizationId",
  contact_id: "contactId",
  assignee_id: "assigneeId",
  project_id: "projectId",
  message_parties: "messageParties",
  message_party: "messageParty",
  status: "status",
  priority: "priority",
  due_date: "dueDate",
  acknowledge_inbox_update: "acknowledgeInboxUpdate",
  inbox_updated_at: "inboxUpdatedAt",
};

export const emailThreadCommentKeys = {
  inbox_id: "inboxId",
  thread_key: "threadKey",
  email_thread_id: "emailThreadId",
  body: "body",
  author: "author",
};

export const recurringTaskKeys = {
  title: "title",
  description: "description",
  project_id: "projectId",
  inbox: "inbox",
  cron_expression: "cronExpression",
  enabled: "enabled",
  next_run_at: "nextRunAt",
  last_run_at: "lastRunAt",
  last_task_id: "lastTaskId",
};

export const mentionKeys = {
  user_id: "userId",
  source_type: "sourceType",
  source_id: "sourceId",
  excerpt: "excerpt",
  read_at: "readAt",
  created_at: "createdAt",
};

export function normalizeMeetingPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  if (next.attendeeContactIds !== undefined) {
    let raw = next.attendeeContactIds;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    if (!Array.isArray(raw)) {
      next.attendeeContactIds = [];
    } else {
      next.attendeeContactIds = raw.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      );
    }
  }
  if (next.attendeePortalEmails !== undefined) {
    next.attendeePortalEmails = normalizeMeetingAttendeePortalEmails(
      next.attendeePortalEmails,
    );
  }
  return next;
}

/**
 * Map a sync/REST project upsert payload into create/update input.
 * Exported for unit tests — production callers use {@link applySyncChange}.
 *
 * Nullable columns use {@link payloadValue} + {@link asNullableString}/
 * {@link asNullableNumber} so explicit `null` clears are not dropped by `??`
 * or by {@link asString} (which treats null as absent).
 */
export function mapProjectUpsert(
  payload: Record<string, unknown>,
): CreateProjectInput | UpdateProjectInput {
  return {
    // Required / non-null columns: null must not clear — asString/asNumber
    // map null → undefined so updateProject leaves the existing value.
    key: asString(payload.key),
    name: asString(payload.name),
    type: asString(payload.type) as Project["type"] | undefined,
    status: asString(payload.status) as Project["status"] | undefined,
    priority: asNumber(payload.priority),
    sortOrder: asNumber(
      payloadValue(payload, "sort_order", "sortOrder"),
    ),
    // budgets is NOT NULL jsonb (default []); parseProjectBudgets(null) → [].
    budgets: parseProjectBudgets(
      Object.prototype.hasOwnProperty.call(payload, "budgets")
        ? payload.budgets
        : undefined,
    ),
    // Nullable columns — explicit null clears.
    summary: asNullableString(payloadValue(payload, "summary", "summary")),
    description: asNullableString(
      payloadValue(payload, "description", "description"),
    ),
    organizationId: asNullableString(
      payloadValue(payload, "organization_id", "organizationId"),
    ),
    areaId: asNullableString(payloadValue(payload, "area_id", "areaId")),
    area: asNullableString(payloadValue(payload, "area", "area")) as
      | Project["area"]
      | null
      | undefined,
    startDate: asNullableString(
      payloadValue(payload, "start_date", "startDate"),
    ),
    dueDate: asNullableString(payloadValue(payload, "due_date", "dueDate")),
    icon: asNullableString(payloadValue(payload, "icon", "icon")),
    color: asNullableString(payloadValue(payload, "color", "color")),
    provider: asNullableString(
      payloadValue(payload, "provider", "provider"),
    ) as Project["provider"] | null | undefined,
    category: asNullableString(
      payloadValue(payload, "category", "category"),
    ) as Project["category"] | null | undefined,
    githubRepository: asNullableString(
      payloadValue(payload, "github_repository", "githubRepository"),
    ),
    cloudflareZoneId: asNullableString(
      payloadValue(payload, "cloudflare_zone_id", "cloudflareZoneId"),
    ),
    penpotProjectId: asNullableString(
      payloadValue(payload, "penpot_project_id", "penpotProjectId"),
    ),
    localWorkingDirectory: asNullableString(
      payloadValue(
        payload,
        "local_working_directory",
        "localWorkingDirectory",
      ),
    ),
    developmentLocation: asNullableString(
      payloadValue(payload, "development_location", "developmentLocation"),
    ),
    productionLocation: asNullableString(
      payloadValue(payload, "production_location", "productionLocation"),
    ),
    localLocation: asNullableString(
      payloadValue(payload, "local_location", "localLocation"),
    ),
    developmentSetupStatus: (() => {
      const raw = asNullableString(
        payloadValue(
          payload,
          "development_setup_status",
          "developmentSetupStatus",
        ),
      );
      if (raw === undefined) return undefined;
      if (raw === "pending" || raw === "ready" || raw === "failed") return raw;
      return null;
    })(),
    developmentSetupError: asNullableString(
      payloadValue(
        payload,
        "development_setup_error",
        "developmentSetupError",
      ),
    ),
    developmentSetupUpdatedAt: asNullableString(
      payloadValue(
        payload,
        "development_setup_updated_at",
        "developmentSetupUpdatedAt",
      ),
    ),
    healthCheckMode: asNullableString(
      payloadValue(payload, "health_check_mode", "healthCheckMode"),
    ) as Project["healthCheckMode"] | null | undefined,
    healthCheckDomain: asNullableString(
      payloadValue(payload, "health_check_domain", "healthCheckDomain"),
    ),
    hourlyRateCents: asNullableNumber(
      payloadValue(payload, "hourly_rate_cents", "hourlyRateCents"),
    ),
  };
}

function parseProjectBudgets(
  value: unknown,
): CreateProjectInput["budgets"] | undefined {
  if (value === undefined) return undefined;
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<CreateProjectInput["budgets"]> = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const period = (item as { period?: unknown }).period;
    const amountCents = (item as { amountCents?: unknown }).amountCents;
    if (
      (period === "monthly" ||
        period === "weekly" ||
        period === "quarterly") &&
      typeof amountCents === "number" &&
      Number.isFinite(amountCents) &&
      amountCents > 0
    ) {
      out.push({ period, amountCents: Math.round(amountCents) });
    }
  }
  return out;
}

function parseTaskLinks(
  value: unknown,
): CreateTaskInput["links"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is { id: string; url: string; createdAt: string } =>
      item != null &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { url?: unknown }).url === "string" &&
      typeof (item as { createdAt?: unknown }).createdAt === "string",
  );
}

function parseStringIdArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
}

export function mapTaskUpsert(
  payload: Record<string, unknown>,
): CreateTaskInput | UpdateTaskInput {
  return {
    projectId: asNullableString(
      payloadValue(payload, "project_id", "projectId"),
    ),
    contactId: asNullableString(
      payloadValue(payload, "contact_id", "contactId"),
    ),
    assigneeId: asNullableString(
      payloadValue(payload, "assignee_id", "assigneeId"),
    ),
    relatedContactIds: parseStringIdArray(
      payloadValue(payload, "related_contact_ids", "relatedContactIds"),
    ),
    relatedOrganizationIds: parseStringIdArray(
      payloadValue(payload, "related_organization_ids", "relatedOrganizationIds"),
    ),
    linkedEmailIds: parseStringIdArray(
      payloadValue(payload, "linked_email_ids", "linkedEmailIds"),
    ),
    labelIds: parseStringIdArray(
      payloadValue(payload, "label_ids", "labelIds"),
    ),
    title: asString(payload.title),
    description: asString(payload.description),
    status: asString(payload.status) as Task["status"] | undefined,
    priority: asNumber(payload.priority),
    sortOrder: asNumber(payloadValue(payload, "sort_order", "sortOrder")),
    dueDate: asNullableString(payloadValue(payload, "due_date", "dueDate")),
    dueEndDate: asNullableString(
      payloadValue(payload, "due_end_date", "dueEndDate"),
    ),
    followUpDate: asNullableString(
      payloadValue(payload, "follow_up_date", "followUpDate"),
    ),
    triagedAt: asNullableString(
      payloadValue(payload, "triaged_at", "triagedAt"),
    ),
    inbox: asBoolean(payload.inbox),
    support: asBoolean(payload.support),
    notification: asBoolean(payload.notification),
    links: parseTaskLinks(payload.links),
    penpotFileId: asNullableString(
      payloadValue(payload, "penpot_file_id", "penpotFileId"),
    ),
    penpotPageId: asNullableString(
      payloadValue(payload, "penpot_page_id", "penpotPageId"),
    ),
    penpotObjectId: asNullableString(
      payloadValue(payload, "penpot_object_id", "penpotObjectId"),
    ),
    agentChatId: asNullableString(
      payloadValue(payload, "agent_chat_id", "agentChatId"),
    ),
    executionLocation: (() => {
      const raw = asNullableString(
        payloadValue(payload, "execution_location", "executionLocation"),
      );
      if (raw === undefined) return undefined;
      if (raw === "development" || raw === "production" || raw === "local") {
        return raw;
      }
      return null;
    })(),
    executionLocationLockedAt: asNullableString(
      payloadValue(
        payload,
        "execution_location_locked_at",
        "executionLocationLockedAt",
      ),
    ),
    agentWorkingContactId: asNullableString(
      payloadValue(payload, "agent_working_contact_id", "agentWorkingContactId"),
    ),
    agentWorkingLabel: asNullableString(
      payloadValue(payload, "agent_working_label", "agentWorkingLabel"),
    ),
    agentWorkingKind: (() => {
      const raw = asNullableString(
        payloadValue(payload, "agent_working_kind", "agentWorkingKind"),
      );
      if (raw === undefined) return undefined;
      if (raw === "working" || raw === "reviewing") return raw;
      return null;
    })(),
    linkedCommitShas: parseStringIdArray(
      payloadValue(payload, "linked_commit_shas", "linkedCommitShas"),
    ),
    automateCompletion: asBoolean(
      payloadValue(payload, "automate_completion", "automateCompletion"),
    ),
    autoReviewDeliveryStatus: asAutoReviewDeliveryStatus(
      payloadValue(
        payload,
        "auto_review_delivery_status",
        "autoReviewDeliveryStatus",
      ),
    ),
    addLinkedCommitShas: parseStringIdArray(
      payloadValue(payload, "add_linked_commit_shas", "addLinkedCommitShas"),
    ),
    removeLinkedCommitShas: parseStringIdArray(
      payloadValue(
        payload,
        "remove_linked_commit_shas",
        "removeLinkedCommitShas",
      ),
    ),
    habitId: asNullableString(payloadValue(payload, "habit_id", "habitId")),
    trackedMinutes: asNullableNumber(
      payloadValue(payload, "tracked_minutes", "trackedMinutes"),
    ),
    trackedDurationSeconds: asNullableNumber(
      payloadValue(payload, "tracked_duration_seconds", "trackedDurationSeconds"),
    ),
    agentInboxApprovedAt: asNullableString(
      payloadValue(payload, "agent_inbox_approved_at", "agentInboxApprovedAt"),
    ),
    acknowledgeInboxUpdate: asBoolean(
      payloadValue(payload, "acknowledge_inbox_update", "acknowledgeInboxUpdate"),
    ),
    agentCreatedAt: asNullableString(
      payloadValue(payload, "agent_created_at", "agentCreatedAt"),
    ),
    inboxUpdatedAt: asNullableString(
      payloadValue(payload, "inbox_updated_at", "inboxUpdatedAt"),
    ),
  };
}
