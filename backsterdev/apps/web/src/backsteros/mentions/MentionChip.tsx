import { useCallback, type MouseEvent as ReactMouseEvent } from "react";

import "../markdown-editor/markdown-editor.css";
import { BacksterosTaskStatusIcon } from "../TaskStatusIcon";
import { getBacksterosTaskStatusLabel, migrateBacksterosTaskStatus } from "../taskStatus";
import { useBacksterosCodebaseProjects } from "../useBacksterosCodebaseProjects";
import { useBacksterosTaskDetailUiStore } from "../taskDetailUiStore";
import type { ParsedMentionToken } from "./mention-tokens";
import { mentionTokenLabel } from "./mention-tokens";
import { openBacksterosDesktopHref } from "./openDesktopHref";
import type { ResolvedMention } from "./resolveMention";

function MentionKindGlyph({ kind }: { kind: ParsedMentionToken["kind"] }) {
  if (kind === "task") return null;
  return (
    <span className="mention-chip-lite__kind" aria-hidden="true">
      @
    </span>
  );
}

export function BacksterosMentionChip(props: {
  readonly token: ParsedMentionToken;
  readonly resolved?: ResolvedMention | null | undefined;
  readonly layout?: "inline" | "block";
}) {
  const { token, resolved, layout = "inline" } = props;
  const openTaskDetail = useBacksterosTaskDetailUiStore((state) => state.openTaskDetail);
  const { state: projectsState } = useBacksterosCodebaseProjects(true);
  const projects = projectsState.status === "ready" ? projectsState.projects : [];

  const deleted = resolved?.deleted === true;
  const displayId = resolved?.displayId ?? mentionTokenLabel(token);
  const title = resolved?.title?.trim() || null;
  const status = resolved?.status ?? null;
  const statusLabel = status
    ? getBacksterosTaskStatusLabel(migrateBacksterosTaskStatus(status))
    : null;

  const chipLayout =
    token.kind === "task" || token.kind === "project" || token.kind === "letter"
      ? layout
      : "inline";
  const isBlock = chipLayout === "block";
  const label = title || displayId;

  const onOpen = useCallback(
    async (event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (deleted || !resolved) return;

      const target = resolved.openTarget;
      if (target.kind === "backsterdev") {
        const project =
          resolved.codebaseProject ??
          projects.find((entry) => entry.id === target.projectId) ??
          null;
        if (!project) return;
        openTaskDetail({ taskId: target.taskId, project });
        return;
      }
      if (target.kind === "desktop") {
        await openBacksterosDesktopHref(target.href);
      }
    },
    [deleted, openTaskDetail, projects, resolved],
  );

  const clickable = !deleted && resolved != null && resolved.openTarget.kind !== "none";

  const className = [
    "mention-chip-lite",
    `mention-chip-lite--${token.kind}`,
    isBlock ? "mention-chip-lite--block" : "",
    deleted ? "mention-chip-lite--deleted" : "",
    clickable ? "mention-chip-lite--link" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      <span className="mention-chip-lite__icon" aria-hidden="true">
        {token.kind === "task" ? (
          <BacksterosTaskStatusIcon status={status ?? "backlog"} size={14} />
        ) : (
          <MentionKindGlyph kind={token.kind} />
        )}
      </span>
      {isBlock || token.kind === "task" ? (
        <span className="mention-chip-lite__id">{displayId}</span>
      ) : null}
      <span
        className={["mention-chip-lite__label", isBlock ? "mention-chip-lite__label--grow" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {isBlock || token.kind === "task" ? label : displayId}
      </span>
      {statusLabel ? <span className="mention-chip-lite__status">{statusLabel}</span> : null}
    </>
  );

  if (!clickable) {
    return (
      <span className={className} title={token.raw}>
        {body}
      </span>
    );
  }

  return (
    <button type="button" className={className} title={token.raw} onClick={onOpen}>
      {body}
    </button>
  );
}
