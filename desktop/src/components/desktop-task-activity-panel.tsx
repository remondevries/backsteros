import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import type {
  CursorSettings,
  ResearchResponse,
  SpellcheckResponse,
} from "@backsteros/contracts";
import {
  TaskActivityPanel,
  type TaskActivityCommentMutations,
} from "@backsteros/ui";

import { isTaskAgentWorkingForUi } from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatus } from "../lib/agent/agent-status-context";
import { useDesktopApi } from "../lib/api-context";
import { useDesktopPowerSync } from "../lib/powersync-context";
import { useTaskActivityLocalFeed } from "../lib/task-activity-feed";
import {
  createTaskCommentViaPowerSyncOrApi,
  deleteTaskCommentViaPowerSyncOrApi,
  patchTaskCommentViaPowerSyncOrApi,
} from "../lib/workspace/task-comment-mutations";

type ContactLike = {
  id: string;
  email?: string | null;
};

export type TaskSpellcheckAppliedPayload = {
  beforeTitle: string;
  beforeDescription: string;
  afterTitle: string;
  afterDescription: string;
};

export type DesktopTaskActivityPanelProps = {
  taskId: string;
  taskUpdatedAt?: string | number | null;
  contacts: readonly ContactLike[];
  contactAvatarSrc: Record<string, string>;
  /** Prefer workspace.patchTask so PowerSync + API cache stay in sync. */
  patchTaskValues?: (values: Record<string, unknown>) => Promise<void>;
  /** Called after spellcheck/research rewrite is applied so the detail view can highlight diffs. */
  onSpellcheckApplied?: (payload: TaskSpellcheckAppliedPayload) => void;
  /** True while orange rewrite highlights are waiting for confirm. */
  spellcheckPending?: boolean;
  /** Clears highlights / accepts the applied rewrite. */
  onSpellcheckConfirm?: () => void;
  /** Reverts title/description to pre-rewrite text. */
  onSpellcheckReset?: () => void;
  /** When false, hide Spellcheck / Research / Reset / Confirm (e.g. description edit mode). */
  spellcheckControlsVisible?: boolean;
  /** Increment to force-refresh comments + activities (e.g. after posting a timer row). */
  activityFeedBump?: number;
  taskSummary: {
    number: number;
    title: string;
    description: string | null;
    status?: string | null;
    projectKey?: string | null;
    projectId?: string | null;
    projectName?: string | null;
    displayId?: string | null;
    workingDirectory?: string | null;
  };
};

export function DesktopTaskActivityPanel({
  taskId,
  taskUpdatedAt,
  contacts,
  contactAvatarSrc,
  patchTaskValues,
  onSpellcheckApplied,
  spellcheckPending = false,
  onSpellcheckConfirm,
  onSpellcheckReset,
  spellcheckControlsVisible = true,
  activityFeedBump = 0,
  taskSummary,
}: DesktopTaskActivityPanelProps) {
  const { client } = useDesktopApi();
  const { user } = useUser();
  const powerSync = useDesktopPowerSync();
  const agentStatus = useDesktopAgentStatus();
  const { setTaskResearchWorking } = agentStatus;
  const localFeed = useTaskActivityLocalFeed(taskId);

  const [cursorSettings, setCursorSettings] = useState<CursorSettings | null>(
    null,
  );
  const [spellchecking, setSpellchecking] = useState(false);
  const [spellcheckError, setSpellcheckError] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [feedRevision, setFeedRevision] = useState(0);

  useEffect(() => {
    if (!activityFeedBump) return;
    setFeedRevision((n) => n + 1);
  }, [activityFeedBump]);

  const working =
    isTaskAgentWorkingForUi(
      { id: taskId, status: taskSummary.status },
      agentStatus,
    ) || researching;
  // Research owns setTaskResearchWorking while in flight. Do not clear on
  // unmount — that raced agent Start marks when leaving the task detail.
  useEffect(() => {
    if (!researching) return;
    return () => {
      setTaskResearchWorking(taskId, false);
    };
  }, [researching, setTaskResearchWorking, taskId]);

  const requestJson = useCallback(
    <T,>(path: string, init?: RequestInit) => client.requestJson<T>(path, init),
    [client],
  );

  const currentUser = useMemo(
    () => ({
      email:
        user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() || null,
      imageUrl: user?.imageUrl?.trim() || null,
    }),
    [user?.imageUrl, user?.primaryEmailAddress?.emailAddress],
  );

  const assigneeAvatarById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of contacts) {
      map.set(contact.id, contactAvatarSrc[contact.id] ?? null);
    }
    return map;
  }, [contactAvatarSrc, contacts]);

  const avatarByEmail = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of contacts) {
      const email = contact.email?.trim().toLowerCase();
      if (!email) continue;
      const src = contactAvatarSrc[contact.id] ?? null;
      if (src) map.set(email, src);
    }
    return map;
  }, [contactAvatarSrc, contacts]);

  const commentMutations = useMemo((): TaskActivityCommentMutations => {
    const author = {
      userId: user?.id ?? null,
      email: currentUser.email,
    };
    return {
      create: (body, parentCommentId) =>
        createTaskCommentViaPowerSyncOrApi(client, powerSync, {
          taskId,
          body,
          parentCommentId,
          author,
        }),
      patch: (commentId, patch, existing) =>
        patchTaskCommentViaPowerSyncOrApi(client, powerSync, {
          taskId,
          commentId,
          existing,
          ...patch,
        }),
      delete: (comment, replyIds) =>
        deleteTaskCommentViaPowerSyncOrApi(client, powerSync, {
          taskId,
          comment,
          replyIds,
        }),
    };
  }, [client, currentUser.email, powerSync, taskId, user?.id]);

  const patchTask = useCallback(
    async (values: Record<string, unknown>) => {
      if (patchTaskValues) {
        await patchTaskValues(values);
        return;
      }
      await client.requestJson(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
    },
    [client, patchTaskValues, taskId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await client.requestJson<CursorSettings>(
          "/api/v1/settings/cursor",
        );
        if (!cancelled) setCursorSettings(body);
      } catch {
        if (!cancelled) setCursorSettings(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const onSpellcheckClick = useCallback(async () => {
    if (spellchecking || researching) return;
    setSpellchecking(true);
    setSpellcheckError(null);
    setResearchError(null);
    const beforeTitle = taskSummary.title;
    const beforeDescription = taskSummary.description ?? "";
    try {
      const body = await client.requestJson<SpellcheckResponse>(
        "/api/v1/ai/spellcheck",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: beforeTitle,
            description: beforeDescription,
          }),
        },
      );
      await patchTask({
        title: body.title,
        description: body.description,
      });
      onSpellcheckApplied?.({
        beforeTitle,
        beforeDescription,
        afterTitle: body.title,
        afterDescription: body.description,
      });
    } catch (err) {
      setSpellcheckError(
        err instanceof Error ? err.message : "Spellcheck failed.",
      );
    } finally {
      setSpellchecking(false);
    }
  }, [
    client,
    onSpellcheckApplied,
    patchTask,
    researching,
    spellchecking,
    taskSummary.description,
    taskSummary.title,
  ]);

  const onResearchClick = useCallback(async () => {
    if (researching || spellchecking) return;
    setResearching(true);
    setResearchError(null);
    setSpellcheckError(null);
    setTaskResearchWorking(taskId, true);
    const beforeTitle = taskSummary.title;
    const beforeDescription = taskSummary.description ?? "";
    try {
      try {
        await client.requestJson(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              body: "Agent is researching the details of this task…",
              activityActor: "agent",
            }),
          },
        );
        setFeedRevision((n) => n + 1);
      } catch {
        // Research can still proceed if the status comment fails.
      }

      const body = await client.requestJson<ResearchResponse>(
        "/api/v1/ai/research",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: beforeTitle,
            description: beforeDescription,
          }),
        },
      );
      await patchTask({
        title: body.title,
        description: body.description,
      });
      onSpellcheckApplied?.({
        beforeTitle,
        beforeDescription,
        afterTitle: body.title,
        afterDescription: body.description,
      });
      setFeedRevision((n) => n + 1);
    } catch (err) {
      setResearchError(
        err instanceof Error ? err.message : "Research failed.",
      );
    } finally {
      setTaskResearchWorking(taskId, false);
      setResearching(false);
    }
  }, [
    client,
    onSpellcheckApplied,
    patchTask,
    researching,
    setTaskResearchWorking,
    spellchecking,
    taskId,
    taskSummary.description,
    taskSummary.title,
  ]);

  const rewriteBusy = spellchecking || researching;
  const apiReady = Boolean(cursorSettings?.apiKeyConfigured);
  const spellcheckEnabled =
    spellcheckControlsVisible && cursorSettings?.spellcheckEnabled === true;
  const researchEnabled =
    spellcheckControlsVisible && cursorSettings?.researchEnabled === true;

  const headerActions = (
    <>
      {spellcheckControlsVisible && spellcheckPending ? (
        <button
          type="button"
          className="task-activity__agent-btn task-activity__spellcheck-btn"
          disabled={rewriteBusy}
          aria-label="Reset rewrite"
          title="Undo changes and restore the previous title and description"
          onClick={() => onSpellcheckReset?.()}
        >
          <span className="task-activity__agent-btn-label">Reset</span>
        </button>
      ) : null}
      {spellcheckControlsVisible && spellcheckPending ? (
        <button
          type="button"
          className="task-activity__agent-btn task-activity__spellcheck-btn is-bound"
          disabled={rewriteBusy}
          aria-label="Confirm rewrite"
          title="Accept changes and clear highlights"
          onClick={() => onSpellcheckConfirm?.()}
        >
          <span className="task-activity__agent-btn-label">Confirm</span>
        </button>
      ) : null}
      {spellcheckEnabled && !spellcheckPending ? (
        <button
          type="button"
          className={[
            "task-activity__agent-btn",
            "task-activity__spellcheck-btn",
            spellchecking ? "is-creating" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={rewriteBusy || !apiReady}
          aria-busy={spellchecking || undefined}
          aria-label={spellchecking ? "Running spellcheck" : "Spellcheck"}
          title={
            !apiReady
              ? "Add a Cursor API key in Settings → Cursor"
              : "Fix spelling and light formatting"
          }
          onClick={() => void onSpellcheckClick()}
        >
          <span className="task-activity__agent-btn-label">
            {spellchecking ? "Checking…" : "Spellcheck"}
          </span>
        </button>
      ) : null}
      {researchEnabled && !spellcheckPending ? (
        <button
          type="button"
          className={[
            "task-activity__agent-btn",
            "task-activity__spellcheck-btn",
            researching ? "is-creating" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={rewriteBusy || !apiReady}
          aria-busy={researching || undefined}
          aria-label={researching ? "Running research" : "Research"}
          title={
            !apiReady
              ? "Add a Cursor API key in Settings → Cursor"
              : "Research the topic and enrich the description"
          }
          onClick={() => void onResearchClick()}
        >
          <span className="task-activity__agent-btn-label">
            {researching ? "Researching…" : "Research"}
          </span>
        </button>
      ) : null}
    </>
  );

  return (
    <>
      <TaskActivityPanel
        taskId={taskId}
        taskUpdatedAt={taskUpdatedAt}
        feedRevision={feedRevision}
        working={working}
        requestJson={requestJson}
        currentUser={currentUser}
        assigneeAvatarById={assigneeAvatarById}
        avatarByEmail={avatarByEmail}
        localFeedActive={localFeed.active}
        localActivities={localFeed.activities}
        localComments={localFeed.comments}
        localFeedLoading={localFeed.loading}
        headerActions={headerActions}
        commentMutations={commentMutations}
      />
      {spellcheckError ? (
        <p className="task-activity__error" role="alert">
          {spellcheckError}
        </p>
      ) : null}
      {researchError ? (
        <p className="task-activity__error" role="alert">
          {researchError}
        </p>
      ) : null}
    </>
  );
}
