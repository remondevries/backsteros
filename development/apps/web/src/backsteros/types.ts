/** Subset of BacksterOS `Project` used by the T3 sidebar overlay / workbench. */
export interface BacksterosCodebaseProject {
  readonly id: string;
  readonly key: string | null;
  readonly name: string;
  readonly summary: string | null;
  readonly description?: string | null;
  readonly type: string;
  readonly status: string;
  readonly priority?: number;
  readonly sortOrder?: number;
  /** Serialized entity icon (`octicon` key, emoji JSON, or null for type default). */
  readonly icon?: string | null;
  readonly organizationId?: string | null;
  readonly areaId?: string | null;
  readonly area?: "personal" | "business" | "clients" | string | null;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly githubRepository: string | null;
  readonly localWorkingDirectory: string | null;
  readonly healthCheckMode?: "simple" | "advanced" | null;
  readonly healthCheckDomain?: string | null;
  readonly updatedAt: string;
}

/** Fields accepted by `PATCH /api/v1/projects/:id`. */
export type BacksterosProjectUpdatePatch = {
  readonly name?: string;
  readonly key?: string;
  readonly summary?: string | null;
  readonly description?: string | null;
  readonly status?: string;
  readonly priority?: number;
  readonly sortOrder?: number;
  readonly organizationId?: string | null;
  readonly areaId?: string | null;
  readonly area?: "personal" | "business" | "clients" | null;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly icon?: string | null;
  readonly githubRepository?: string | null;
  readonly localWorkingDirectory?: string | null;
  readonly healthCheckMode?: "simple" | "advanced" | null;
  readonly healthCheckDomain?: string | null;
};

export type BacksterosGithubCommit = {
  readonly sha: string;
  readonly shortSha: string;
  readonly message: string;
  readonly authorName: string | null;
  readonly authorLogin: string | null;
  readonly authoredAt: string | null;
  readonly htmlUrl: string;
};

export type BacksterosGithubPullRequestFileStatus =
  | "added"
  | "removed"
  | "modified"
  | "renamed"
  | "copied"
  | "changed"
  | "unchanged";

export type BacksterosGithubPullRequestFile = {
  readonly filename: string;
  readonly previousFilename: string | null;
  readonly status: BacksterosGithubPullRequestFileStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly changes: number;
  readonly patch: string | null;
  readonly blobUrl: string | null;
  readonly rawUrl: string | null;
};

export type BacksterosGithubPullRequest = {
  readonly number: number;
  readonly title: string;
  readonly state: "open" | "closed" | "merged";
  readonly draft: boolean;
  readonly body?: string | null;
  readonly authorLogin: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt: string | null;
  readonly closedAt?: string | null;
  readonly mergedAt?: string | null;
  readonly htmlUrl: string;
  readonly headRef: string | null;
  readonly baseRef: string | null;
  readonly commitsCount?: number | null;
  readonly commentsCount?: number | null;
  readonly changedFilesCount?: number | null;
  readonly additions?: number | null;
  readonly deletions?: number | null;
};

export type BacksterosProjectUpdate = {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly body: string;
  readonly kind: import("./projectUpdates").BacksterosProjectUpdateKind | string;
  readonly status: import("./projectUpdates").BacksterosProjectUpdateStatus | string;
  readonly severity: import("./projectUpdates").BacksterosProjectUpdateSeverity | string | null;
  readonly relatedTaskIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type BacksterosProjectFsEntry = {
  readonly name: string;
  readonly path: string;
  readonly kind: "file" | "directory";
};

export type BacksterosProjectRepoDocEntry = {
  readonly name: string;
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly pinned: boolean;
};

export interface BacksterosProjectsResponse {
  readonly projects: readonly BacksterosCodebaseProject[];
}

/** Subset of BacksterOS `Task` used by the T3 sidebar overlay list. */
export interface BacksterosTask {
  readonly id: string;
  readonly projectId: string | null;
  readonly number: number;
  readonly title: string;
  readonly status: string;
  readonly sortOrder?: number;
  readonly dueDate: string | null;
  readonly priority?: number;
  readonly updatedAt: string;
}

/** Full task payload from `GET /api/v1/tasks/:id`. */
export interface BacksterosTaskDetail extends BacksterosTask {
  readonly contactId: string | null;
  readonly assigneeId: string | null;
  readonly relatedContactIds: readonly string[];
  readonly relatedOrganizationIds: readonly string[];
  readonly description: string | null;
  readonly dueEndDate?: string | null;
  readonly trackedDurationSeconds?: number | null;
  readonly trackedMinutes?: number | null | undefined;
  readonly createdAt: string;
  readonly deletedAt: string | null;
}

export interface BacksterosTasksResponse {
  readonly tasks: readonly BacksterosTask[];
}

export interface BacksterosTaskComment {
  readonly id: string;
  readonly taskId: string;
  readonly parentCommentId: string | null;
  readonly authorUserId: string | null;
  readonly authorContactId: string | null;
  readonly authorEmail: string | null;
  readonly authorName: string;
  readonly body: string;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface BacksterosTaskCommentsResponse {
  readonly comments: readonly BacksterosTaskComment[];
}

export interface BacksterosTaskActivity {
  readonly id: string;
  readonly taskId: string;
  readonly type: string;
  readonly actorUserId: string | null;
  readonly actorContactId: string | null;
  readonly actorEmail: string | null;
  readonly actorName: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface BacksterosTaskActivitiesResponse {
  readonly activities: readonly BacksterosTaskActivity[];
}

export interface BacksterosContact {
  readonly id: string;
  readonly name: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email: string | null;
  /** Present when the contact has an uploaded avatar on BacksterOS. */
  readonly avatarStorageKey?: string | null;
}

/** Subset of BacksterOS `Organization` used by related-entity chips. */
export interface BacksterosOrganization {
  readonly id: string;
  readonly name: string;
  readonly key?: string | null;
  readonly avatarStorageKey?: string | null;
}

/** Fields accepted by `POST /api/v1/tasks`. */
export type BacksterosCreateTaskInput = {
  readonly title: string;
  readonly projectId?: string | null;
  readonly description?: string | null;
  readonly status?: string;
  readonly priority?: number;
  readonly dueDate?: string | null | undefined;
  readonly assigneeId?: string | null;
  readonly contactId?: string | null;
  readonly relatedContactIds?: readonly string[];
  readonly relatedOrganizationIds?: readonly string[];
  readonly support?: boolean;
  readonly notification?: boolean;
  readonly inbox?: boolean;
  readonly activityActor?: "user" | "agent";
};

/** Fields accepted by `PATCH /api/v1/tasks/:id`. */
export type BacksterosTaskUpdatePatch = {
  readonly title?: string;
  readonly description?: string | null;
  readonly status?: string;
  readonly priority?: number;
  readonly sortOrder?: number;
  readonly dueDate?: string | null | undefined;
  /** End of a timed calendar block; cleared automatically when dueDate is cleared. */
  readonly dueEndDate?: string | null | undefined;
  readonly assigneeId?: string | null;
  readonly projectId?: string | null;
  readonly inbox?: boolean;
  readonly relatedContactIds?: readonly string[];
  readonly relatedOrganizationIds?: readonly string[];
  readonly trackedDurationSeconds?: number | null;
  readonly trackedMinutes?: number | null | undefined;
  /** When set, BacksterOS records the status change as this actor. */
  readonly activityActor?: "user" | "agent";
};

export type BacksterosCreateTaskActivityInput =
  | { readonly type: "timer_started"; readonly data?: Record<string, unknown> }
  | {
      readonly type: "timer_stopped";
      readonly data: { readonly durationSeconds: number };
    };

/** Live agent-working presence from BacksterOS core (TTL-based). */
export type BacksterosTaskAgentPresence = {
  readonly taskId: string;
  readonly source: string;
  readonly sessionId: string | null;
  readonly startedAt: string;
  readonly lastHeartbeatAt: string;
};

/** Inline task-description image from `POST /api/v1/tasks/:id/images`. */
export type BacksterosTaskImage = {
  readonly id: string;
  readonly taskId: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly originalFilename: string;
  /** Relative API path for markdown embeds. */
  readonly url: string;
};

export const BACKSTEROS_SCOPE_KEY = "backsteros" as const;

export function isBacksterosScopeKey(value: string | null | undefined): boolean {
  return value === BACKSTEROS_SCOPE_KEY;
}

export function getBacksterosTaskDisplayId(
  task: { readonly number: number | null | undefined; readonly projectId?: string | null },
  projectKey?: string | null,
): string | null {
  if (!task.number) return null;
  if (projectKey) return `${projectKey}-${task.number}`;
  if (task.projectId) return null;
  return `IN-${task.number}`;
}
