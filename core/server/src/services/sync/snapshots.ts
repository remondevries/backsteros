import { normalizeMeetingAttendeePortalEmails } from "@backsteros/contracts";

import {
  areas,
  bankAccounts,
  cashflowPlannerEntries,
  contactRelationships,
  contacts,
  crmActivities,
  crmGroupMembers,
  crmGroups,
  crmRelationshipLabels,
  documents,
  emailThreadComments,
  emailThreads,
  financialCategories,
  financialGoals,
  financialRecurrings,
  financialTransactions,
  habits,
  letters,
  meetings,
  mentions,
  organizations,
  projects,
  recurringTasks,
  taskActivities,
  taskComments,
  tasks,
} from "../../db/schema.js";
export function projectSnapshot(row: typeof projects.$inferSelect) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    summary: row.summary,
    description: row.description,
    organization_id: row.organizationId,
    area_id: row.areaId,
    area: row.area,
    start_date: row.startDate?.toISOString() ?? null,
    due_date: row.dueDate?.toISOString() ?? null,
    icon: row.icon,
    color: row.color,
    type: row.type,
    provider: row.provider,
    category: row.category,
    github_repository: row.githubRepository,
    cloudflare_zone_id: row.cloudflareZoneId,
    penpot_project_id: row.penpotProjectId,
    local_working_directory: row.localWorkingDirectory,
    development_location: row.developmentLocation,
    production_location: row.productionLocation,
    local_location: row.localLocation,
    development_setup_status: row.developmentSetupStatus,
    development_setup_error: row.developmentSetupError,
    development_setup_updated_at:
      row.developmentSetupUpdatedAt?.toISOString() ?? null,
    health_check_mode: row.healthCheckMode,
    health_check_domain: row.healthCheckDomain,
    hourly_rate_cents: row.hourlyRateCents,
    budgets: JSON.stringify(row.budgets ?? []),
    status: row.status,
    priority: row.priority,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function taskSnapshot(row: typeof tasks.$inferSelect) {
  const relatedContactIds = Array.isArray(row.relatedContactIds)
    ? row.relatedContactIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  const relatedOrganizationIds = Array.isArray(row.relatedOrganizationIds)
    ? row.relatedOrganizationIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  const linkedEmailIds = Array.isArray(row.linkedEmailIds)
    ? row.linkedEmailIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  return {
    id: row.id,
    project_id: row.projectId,
    contact_id: row.contactId,
    assignee_id: row.assigneeId,
    related_contact_ids: JSON.stringify(relatedContactIds),
    related_organization_ids: JSON.stringify(relatedOrganizationIds),
    linked_email_ids: JSON.stringify(linkedEmailIds),
    label_ids: JSON.stringify(
      Array.isArray(row.labelIds)
        ? row.labelIds.filter(
            (id): id is string => typeof id === "string" && id.trim().length > 0,
          )
        : [],
    ),
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    sort_order: row.sortOrder,
    due_date: row.dueDate?.toISOString() ?? null,
    due_end_date: row.dueEndDate?.toISOString() ?? null,
    follow_up_date: row.followUpDate?.toISOString() ?? null,
    triaged_at: row.triagedAt?.toISOString() ?? null,
    inbox: row.inbox,
    support: row.support,
    notification: row.notification,
    links: JSON.stringify(row.links ?? []),
    penpot_file_id: row.penpotFileId ?? null,
    penpot_page_id: row.penpotPageId ?? null,
    penpot_object_id: row.penpotObjectId ?? null,
    agent_chat_id: row.agentChatId ?? null,
    execution_location: row.executionLocation ?? null,
    execution_location_locked_at:
      row.executionLocationLockedAt?.toISOString() ?? null,
    agent_working_contact_id: row.agentWorkingContactId ?? null,
    agent_working_started_at: row.agentWorkingStartedAt?.toISOString() ?? null,
    agent_working_label: row.agentWorkingLabel ?? null,
    agent_working_kind: row.agentWorkingKind ?? null,
    linked_commit_shas: JSON.stringify(
      Array.isArray(row.linkedCommitShas) ? row.linkedCommitShas : [],
    ),
    automate_completion: row.automateCompletion ?? false,
    auto_review_delivery_status: row.autoReviewDeliveryStatus ?? null,
    habit_id: row.habitId ?? null,
    completed_at: row.completedAt?.toISOString() ?? null,
    agent_created_at: row.agentCreatedAt?.toISOString() ?? null,
    agent_inbox_approved_at: row.agentInboxApprovedAt?.toISOString() ?? null,
    inbox_updated_at: row.inboxUpdatedAt?.toISOString() ?? null,
    tracked_minutes: row.trackedMinutes ?? null,
    tracked_duration_seconds: row.trackedDurationSeconds ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function documentSnapshot(row: typeof documents.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    project_id: row.projectId,
    parent_id: row.parentId,
    kind: row.kind,
    icon: row.icon,
    sort_order: row.sortOrder,
    journal_date: row.journalDate,
    path: row.path,
    title: row.title,
    storage_key: row.storageKey,
    content_type: row.contentType,
    byte_size: row.byteSize,
    checksum: row.checksum,
    snippet: row.snippet,
    content_version: row.contentVersion,
    content_etag: row.contentEtag,
    publish_status: row.publishStatus ?? "concept",
    publish_slug: row.publishSlug ?? null,
    seo_title: row.seoTitle ?? null,
    seo_description: row.seoDescription ?? null,
    audience: row.audience ?? "group",
    contact_ids: JSON.stringify(row.contactIds ?? []),
    placement_folder_id: row.placementFolderId ?? null,
    cover_storage_key: row.coverStorageKey ?? null,
    cover_content_type: row.coverContentType ?? null,
    tracked_minutes: row.trackedMinutes ?? null,
    tracked_duration_seconds: row.trackedDurationSeconds ?? null,
    last_tracked_at: row.lastTrackedAt?.toISOString() ?? null,
    doc_key: row.docKey ?? null,
    properties: row.properties ?? {},
    front_matter_valid: row.frontMatterValid ?? true,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function areaSnapshot(row: typeof areas.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    parent: row.parent,
    icon: row.icon,
    color: row.color,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function organizationSnapshot(row: typeof organizations.$inferSelect) {
  return {
    id: row.id,
    number: row.number,
    key: row.key,
    name: row.name,
    summary: row.summary,
    phone: row.phone,
    email: row.email,
    emails: JSON.stringify(row.emails ?? []),
    phones: JSON.stringify(row.phones ?? []),
    website: row.website,
    address: row.address,
    city: row.city,
    postal_code: row.postalCode,
    country: row.country,
    region: row.region ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    size: row.size ?? null,
    social_accounts: JSON.stringify(row.socialAccounts ?? []),
    chamber_of_commerce: row.chamberOfCommerce ?? null,
    tax_number: row.taxNumber ?? null,
    avatar_storage_key: row.avatarStorageKey,
    avatar_content_type: row.avatarContentType,
    sort_order: row.sortOrder,
    notes: row.notes,
    moneybird_contact_id: row.moneybirdContactId ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function contactSnapshot(row: typeof contacts.$inferSelect) {
  return {
    id: row.id,
    number: row.number,
    key: row.key,
    organization_id: row.organizationId,
    name: row.name,
    first_name: row.firstName,
    last_name: row.lastName,
    email: row.email,
    emails: JSON.stringify(row.emails ?? []),
    title: row.title,
    summary: row.summary,
    avatar_storage_key: row.avatarStorageKey,
    avatar_content_type: row.avatarContentType,
    portal_avatar_storage_key: row.portalAvatarStorageKey ?? null,
    portal_avatar_content_type: row.portalAvatarContentType ?? null,
    sort_order: row.sortOrder,
    phone: row.phone,
    phones: JSON.stringify(row.phones ?? []),
    role: row.role,
    notes: row.notes,
    address: row.address,
    city: row.city,
    postal_code: row.postalCode,
    country: row.country,
    region: row.region ?? null,
    timezone: row.timezone ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    social_accounts: JSON.stringify(row.socialAccounts ?? []),
    facebook_messenger_id: row.facebookMessengerId ?? null,
    x_user_id: row.xUserId ?? null,
    birthday: row.birthday ?? null,
    languages: JSON.stringify(row.languages ?? []),
    portal_username: row.portalUsername ?? null,
    portal_password_hash: row.portalPasswordHash ?? null,
    portal_settings: JSON.stringify(row.portalSettings ?? {}),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function letterSnapshot(row: typeof letters.$inferSelect) {
  return {
    id: row.id, number: row.number, project_id: row.projectId,
    organization_id: row.organizationId, contact_id: row.contactId, title: row.title,
    icon: row.icon, context: row.context, status: row.status,
    due_date: row.dueDate?.toISOString() ?? null,
    received_date: row.receivedDate?.toISOString() ?? null, direction: row.direction,
    storage_key: row.storageKey, original_filename: row.originalFilename,
    content_type: row.contentType, byte_size: row.byteSize, checksum: row.checksum,
    content_etag: row.contentEtag,
    sort_order: row.sortOrder, created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(), deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

/** Full letter metadata payload for REST leader-first / sync_events (no PDF bytes). */
export function buildLetterSyncPayloadFromRow(
  row: typeof letters.$inferSelect,
): Record<string, unknown> {
  return letterSnapshot(row);
}

export function bankAccountSnapshot(row: typeof bankAccounts.$inferSelect) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    iban_or_mask: row.ibanOrMask,
    currency: row.currency,
    type: row.type,
    avatar_storage_key: row.avatarStorageKey,
    avatar_content_type: row.avatarContentType,
    color: row.color ?? null,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function financialCategorySnapshot(row: typeof financialCategories.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parentId,
    kind: row.kind,
    listing: row.listing,
    icon: row.icon,
    budget_cents: row.budgetCents,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function financialGoalSnapshot(row: typeof financialGoals.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    listing: row.listing,
    icon: row.icon,
    goal_amount_cents: row.goalAmountCents,
    start_date: row.startDate,
    end_date: row.endDate,
    contribution_cents: row.contributionCents,
    saving_mode: row.savingMode,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function financialRecurringSnapshot(
  row: typeof financialRecurrings.$inferSelect,
) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    category_id: row.categoryId,
    amount_cents: row.amountCents,
    next_date: row.nextDate,
    archived: row.archived ? 1 : 0,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function cashflowPlannerEntrySnapshot(
  row: typeof cashflowPlannerEntries.$inferSelect,
) {
  return {
    id: row.id,
    entry_type: row.entryType,
    name: row.name,
    amount_cents: row.amountCents,
    due_date: row.dueDate,
    group_label: row.groupLabel,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function financialTransactionSnapshot(
  row: typeof financialTransactions.$inferSelect,
) {
  return {
    id: row.id,
    bank_account_id: row.bankAccountId,
    organization_id: row.organizationId,
    project_id: row.projectId,
    category_id: row.categoryId,
    goal_id: row.goalId,
    recurring_id: row.recurringId,
    notes: row.notes,
    display_name: row.displayName,
    booked_on: row.bookedOn,
    amount_cents: row.amountCents,
    currency: row.currency,
    payee: row.payee,
    counterparty: row.counterparty,
    memo: row.memo,
    balance_after_cents: row.balanceAfterCents,
    external_id: row.externalId,
    fingerprint: row.fingerprint,
    source_code: row.sourceCode,
    source_type: row.sourceType,
    settlement_state: row.settlementState,
    raw: row.raw,
    // Never round-trip import_batch_id: batches are core-to-core only, not synced to clients.
    import_batch_id: null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function emailThreadSnapshot(row: typeof emailThreads.$inferSelect) {
  return {
    id: row.id,
    inbox_id: row.inboxId,
    thread_key: row.threadKey,
    number: row.number,
    organization_id: row.organizationId,
    contact_id: row.contactId,
    assignee_id: row.assigneeId,
    project_id: row.projectId,
    message_parties: row.messageParties ?? {},
    status: row.status,
    priority: row.priority,
    due_date: row.dueDate?.toISOString() ?? null,
    inbox_updated_at: row.inboxUpdatedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function emailThreadCommentSnapshot(
  row: typeof emailThreadComments.$inferSelect,
) {
  return {
    id: row.id,
    email_thread_id: row.emailThreadId,
    body: row.body,
    author: row.author,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function recurringTaskSnapshot(row: typeof recurringTasks.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    project_id: row.projectId,
    inbox: row.inbox,
    cron_expression: row.cronExpression,
    enabled: row.enabled,
    next_run_at: row.nextRunAt.toISOString(),
    last_run_at: row.lastRunAt?.toISOString() ?? null,
    last_task_id: row.lastTaskId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function habitSnapshot(row: typeof habits.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    description: row.description,
    project_id: row.projectId,
    cadence: row.cadence,
    cadence_anchor_ymd: row.cadenceAnchorYmd,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function meetingSnapshot(row: typeof meetings.$inferSelect) {
  const attendeeIds = Array.isArray(row.attendeeContactIds)
    ? row.attendeeContactIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    summary: row.summary,
    notes: row.notes,
    transcription: row.transcription,
    status: row.status,
    format: row.format ?? "video_call",
    location: row.location ?? null,
    location_organization_id: row.locationOrganizationId ?? null,
    project_id: row.projectId,
    organization_id: row.organizationId,
    attendee_contact_ids: JSON.stringify(attendeeIds),
    attendee_portal_emails: JSON.stringify(
      normalizeMeetingAttendeePortalEmails(row.attendeePortalEmails),
    ),
    start_at: row.startAt?.toISOString() ?? null,
    end_at: row.endAt?.toISOString() ?? null,
    tracked_minutes: row.trackedMinutes ?? null,
    tracked_duration_seconds: row.trackedDurationSeconds ?? null,
    external_calendar_event_id: row.externalCalendarEventId ?? null,
    inbox_updated_at: row.inboxUpdatedAt?.toISOString() ?? null,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function taskCommentSnapshot(row: typeof taskComments.$inferSelect) {
  return {
    id: row.id,
    task_id: row.taskId,
    parent_comment_id: row.parentCommentId,
    author_user_id: row.authorUserId,
    author_contact_id: row.authorContactId,
    author_email: row.authorEmail,
    body: row.body,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function taskActivitySnapshot(row: typeof taskActivities.$inferSelect) {
  return {
    id: row.id,
    task_id: row.taskId,
    type: row.type,
    actor_user_id: row.actorUserId,
    actor_contact_id: row.actorContactId,
    actor_email: row.actorEmail,
    actor_name: row.actorName,
    data:
      typeof row.data === "string"
        ? row.data
        : JSON.stringify(row.data ?? {}),
    body: row.body ?? null,
    parent_id: row.parentId ?? null,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: (row.updatedAt ?? row.createdAt).toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function mentionSnapshot(row: typeof mentions.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    source_type: row.sourceType,
    source_id: row.sourceId,
    excerpt: row.excerpt,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

export function contactRelationshipSnapshot(
  row: typeof contactRelationships.$inferSelect,
) {
  return {
    id: row.id,
    from_contact_id: row.fromContactId,
    to_contact_id: row.toContactId,
    type: row.type,
    note: row.note,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function crmRelationshipLabelSnapshot(
  row: typeof crmRelationshipLabels.$inferSelect,
) {
  return {
    id: row.id,
    side_a_label: row.sideALabel,
    side_a_slug: row.sideASlug,
    side_b_label: row.sideBLabel,
    side_b_slug: row.sideBSlug,
    color: row.color,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function crmGroupSnapshot(row: typeof crmGroups.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    sort_order: row.sortOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function crmGroupMemberSnapshot(row: typeof crmGroupMembers.$inferSelect) {
  return {
    id: row.id,
    group_id: row.groupId,
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export function crmActivitySnapshot(row: typeof crmActivities.$inferSelect) {
  return {
    id: row.id,
    subject_type: row.subjectType,
    subject_id: row.subjectId,
    kind: row.kind,
    body: row.body,
    body_preview: row.bodyPreview,
    meeting_id: row.meetingId,
    occurred_at: row.occurredAt.toISOString(),
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}
