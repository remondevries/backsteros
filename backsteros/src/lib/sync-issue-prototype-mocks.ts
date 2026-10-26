/**
 * Static Syncing layout mocks — kept for visual review of unwired issue types.
 * Live triage uses `sync-issue-model` + `use-syncing-issues`.
 */

import type { SyncIssueLayoutId, SyncIssueTone } from "./sync-issue-model";

export type { SyncIssueLayoutId, SyncIssueTone };

export type SyncIssuePrototype = {
  id: SyncIssueLayoutId;
  tone: SyncIssueTone;
  badge: string;
  title: string;
  detail: string;
  /** Short line for the triage list. */
  summary: string;
};

/** Demo queue order: severity-ish, conflict first for the main flow. */
export const SYNC_ISSUE_PROTOTYPE_MOCKS: SyncIssuePrototype[] = [
  {
    id: "conflict",
    tone: "error",
    badge: "Syncing conflict",
    title: "Field conflicts need a merge",
    detail:
      "Local and cloud both changed the same rows. Pick a side per field, then merge.",
    summary: "8 open · Meeting MTG-184 and more",
  },
  {
    id: "powersync-error",
    tone: "error",
    badge: "Sync unavailable",
    title: "PowerSync could not start",
    detail: "Fix credentials or service health, then retry the channel.",
    summary: "token_exchange_failed",
  },
  {
    id: "dead-letter",
    tone: "error",
    badge: "Dead letter",
    title: "Replication apply blocked",
    detail: "Retry the payload or acknowledge to unblock sync-event pull.",
    summary: "tasks · fk_parent_missing · attempt 3",
  },
  {
    id: "vault-failed",
    tone: "error",
    badge: "Vault",
    title: "Markdown vault sync failed",
    detail: "Retry the file transfer or open the path locally.",
    summary: "Projects/OS/vault-sync.md · peer timeout",
  },
  {
    id: "validation-rejected",
    tone: "error",
    badge: "Write rejected",
    title: "Server rejected a local change",
    detail: "Compare what you tried to write with the rolled-back server row.",
    summary: "Contact CON-441 · email already in use",
  },
  {
    id: "offline",
    tone: "warning",
    badge: "Offline",
    title: "This Mac is offline",
    detail:
      "Writes stay queued locally. Resolve by reconnecting — nothing to merge.",
    summary: "Last synced · Today · 09:12 · 3 queued",
  },
  {
    id: "upload-stuck",
    tone: "warning",
    badge: "Upload queue",
    title: "Local changes waiting to upload",
    detail: "Review the queue, retry failed items, or wait for the network.",
    summary: "3 waiting · oldest Task BSH-42",
  },
  {
    id: "peer-down",
    tone: "warning",
    badge: "Peer down",
    title: "Cannot reach cloud-core",
    detail: "Test the Tailscale peer link, then wait for the next tick.",
    summary: "Last ok · Yesterday · 22:04",
  },
  {
    id: "missing-blob",
    tone: "warning",
    badge: "Missing file",
    title: "Attachment bytes not available",
    detail: "Metadata is here; retry the blob download from R2 or peer.",
    summary: "Letter PDF · 404 on private object",
  },
  {
    id: "version-drift",
    tone: "warning",
    badge: "Version drift",
    title: "Local-core build does not match peer",
    detail: "Update or redeploy so both cores report the same commit.",
    summary: "abc1234-dirty ≠ def5678",
  },
  {
    id: "connecting",
    tone: "info",
    badge: "Connecting",
    title: "Connecting PowerSync",
    detail: "Handshake in progress. Workspace is read-mostly until ready.",
    summary: "Opening sync channel…",
  },
  {
    id: "twin-lag",
    tone: "info",
    badge: "Lagging",
    title: "Twin tables are behind",
    detail: "Usually clears on the next replication tick — monitor lag only.",
    summary: "~45s · meeting_scheduling_settings",
  },
  {
    id: "draft-protected",
    tone: "info",
    badge: "Draft protected",
    title: "Remote edit held while you type",
    detail: "Keep your draft, open remote, or take remote when ready.",
    summary: "DOC-55 · remote · Today · 11:02",
  },
];

export const UPLOAD_QUEUE_MOCK = [
  {
    id: "q1",
    label: "Task BSH-42",
    op: "PATCH",
    age: "4 min ago",
    status: "retrying" as const,
  },
  {
    id: "q2",
    label: "Meeting MTG-191",
    op: "PATCH",
    age: "2 min ago",
    status: "pending" as const,
  },
  {
    id: "q3",
    label: "Contact CON-441",
    op: "PUT",
    age: "40 sec ago",
    status: "pending" as const,
  },
];

export const DEAD_LETTER_MOCK = {
  table: "tasks",
  rowId: "tsk_01JBPLACEHOLDER",
  direction: "cloud → local",
  errorCode: "fk_parent_missing",
  errorMessage: "project_id references missing projects row",
  attempts: 3,
  nextRetry: "in 5 min",
  payloadPreview: '{ "id": "tsk_01JB…", "projectId": "prj_missing", … }',
};

export const DRAFT_PROTECTED_MOCK = {
  path: "Projects/OS/vault-sync.md",
  localExcerpt:
    "Local working copy prefers ~/Documents/BacksterOS for the vault root.",
  remoteExcerpt:
    "Cloud copy prefers private R2 with a desktop working copy on sync.",
  remoteAt: "Today · 11:02",
};

export const VERSION_DRIFT_MOCK = {
  local: { commit: "abc1234", dirty: true, builtAt: "Today · 08:10" },
  cloud: { commit: "def5678", dirty: false, builtAt: "Yesterday · 19:40" },
};
