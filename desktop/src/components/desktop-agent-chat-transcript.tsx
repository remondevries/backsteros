import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DocumentMarkdownPreview, ShimmerText } from "@backsteros/ui";

import {
  activityIsCollapsible,
  defaultActivityExpanded,
  formatDiffStat,
  segmentsFromActivitiesAndText,
  turnPhaseLabel,
  type AgentChatActivityDiff,
  type AgentChatActivityItem,
  type AgentChatTurnPhase,
  type AgentChatTurnSegment,
} from "../lib/agent/agent-acp-activity";
import {
  activityLucideIcon,
  activityStatusLucide,
} from "../lib/agent/agent-chat-icons";
import {
  CHAT_LIST_ANCHOR_OFFSET,
  measureAnchoredTurn,
  scrollAnchorToTop,
  type AgentChatScrollMode,
} from "../lib/agent/agent-chat-scroll";
import {
  collectChangedFilesFromActivities,
  turnWorkedLabel,
} from "../lib/agent/agent-chat-timeline";
import {
  activityCompactPreview,
  activityTrailingIndicator,
  formatChatTimestampTooltip,
  formatShortChatTimestamp,
  formatWorkingTimerNow,
  splitWorkLogEntries,
} from "../lib/agent/agent-chat-work-ui";
import type { AgentChatMessage } from "../lib/agent/agent-chat-transcript";
import { AgentChatUserMessageContent } from "../lib/agent/agent-chat-user-content";
import { pairAgentChatTurns } from "../lib/agent/agent-chat-turns";
import { toolActivityHeading } from "../lib/agent/t3-port/work-entry-labels";
import type { AgentChatPlanStep } from "../lib/agent/t3-port/cursor-todos";
import {
  aggregateToolActivities,
  type AggregatedActivityGroup,
} from "../lib/agent/tool-activity-aggregate";
import { PlanTodoList } from "./agent-chat/plan-todo-list";
import { ProposedPlanCard } from "./agent-chat/proposed-plan-card";
import { DesktopAgentChatChangedFiles } from "./desktop-agent-chat-changed-files";

export type DesktopAgentChatTranscriptProps = {
  messages: readonly AgentChatMessage[];
  activities?: readonly AgentChatActivityItem[];
  /** Live interleaved work/text blocks for the in-flight turn. */
  segments?: readonly AgentChatTurnSegment[];
  /** Live todo checklist from `cursor/update_todos`. */
  planSteps?: readonly AgentChatPlanStep[];
  /** Live proposed plan markdown from `cursor/create_plan`. */
  proposedPlanMarkdown?: string | null;
  /** Streaming assistant text for the in-flight turn (ACP chunks). */
  assistantDraft?: string;
  /** High-level turn phase for the status line. */
  turnPhase?: AgentChatTurnPhase;
  working?: boolean;
  /** Epoch ms when the current turn started (T3 WorkingTimer). */
  turnStartedAt?: number | null;
  /** Footer height so anchored turns clear the composer (T3 composerOverlayHeight). */
  composerOverlayHeight?: number;
  projectLabel?: string;
  taskDisplayId?: string | null;
  emptyHint?: string;
  /** Open the turn Diff panel (T3-style). */
  onOpenTurnDiff?: (turnId: string, filePath?: string) => void;
  /** Truncate transcript after this user message (local revert checkpoint). */
  onRevertToMessage?: (messageId: string) => void;
};

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={`desktop-agent-chat__copy${copied ? " is-copied" : ""}`}
      title={copied ? "Copied" : "Copy message"}
      aria-label={copied ? "Copied" : "Copy message"}
      onClick={() => {
        const value = text.trim();
        if (!value) return;
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function MessageMeta({
  createdAt,
  text,
  align = "start",
  onRevert,
}: {
  createdAt?: number;
  text: string;
  align?: "start" | "end";
  onRevert?: () => void;
}) {
  const stamp = createdAt ? formatShortChatTimestamp(createdAt) : "";
  const tip = createdAt ? formatChatTimestampTooltip(createdAt) : "";
  return (
    <div
      className={`desktop-agent-chat__meta desktop-agent-chat__meta--${align}`}
    >
      {stamp ? (
        <span className="desktop-agent-chat__meta-time" title={tip || undefined}>
          {stamp}
        </span>
      ) : null}
      {onRevert ? (
        <button
          type="button"
          className="desktop-agent-chat__copy"
          title="Revert to this message — keep it and remove later turns"
          aria-label="Revert to this message"
          onClick={onRevert}
        >
          Revert
        </button>
      ) : null}
      <CopyMessageButton text={text} />
    </div>
  );
}

function UserMessageBubble({
  text,
  createdAt,
  images,
  onRevert,
}: {
  text: string;
  createdAt: number;
  images?: AgentChatMessage["images"];
  onRevert?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canCollapse = text.length > 600 || text.split("\n").length > 8;
  const collapsed = canCollapse && !expanded;

  return (
    <div className="desktop-agent-chat__bubble-wrap desktop-agent-chat__bubble-wrap--user">
      <div className="desktop-agent-chat__bubble">
        <div
          className={`desktop-agent-chat__user-content-wrap${
            collapsed ? " is-collapsed" : ""
          }`}
        >
          <AgentChatUserMessageContent text={text} images={images} />
        </div>
        {canCollapse ? (
          <button
            type="button"
            className="desktop-agent-chat__bubble-more"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : "Show full message"}
          </button>
        ) : null}
      </div>
      <MessageMeta
        createdAt={createdAt}
        text={text}
        align="end"
        onRevert={onRevert}
      />
    </div>
  );
}

function AssistantMessageBubble({
  text,
  createdAt,
  streaming = false,
}: {
  text: string;
  createdAt?: number;
  streaming?: boolean;
}) {
  const trimmed = text.trim();
  if (!trimmed && !streaming) return null;

  return (
    <div className="desktop-agent-chat__bubble-wrap desktop-agent-chat__bubble-wrap--assistant">
      <div
        className={`desktop-agent-chat__bubble desktop-agent-chat__bubble--assistant${
          streaming ? " desktop-agent-chat__bubble--draft" : ""
        }`}
      >
        {trimmed ? (
          <div className="desktop-agent-chat__bubble-md">
            <DocumentMarkdownPreview body={trimmed} />
          </div>
        ) : null}
        {streaming ? (
          <span className="desktop-agent-chat__draft-caret" aria-hidden>
            ▍
          </span>
        ) : null}
      </div>
      {!streaming && trimmed ? (
        <MessageMeta createdAt={createdAt} text={trimmed} align="start" />
      ) : null}
    </div>
  );
}

function WorkingTimer({ startedAt }: { startedAt: number }) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const initial = formatWorkingTimerNow(startedAt);

  useEffect(() => {
    const tick = () => {
      if (textRef.current) {
        textRef.current.textContent = formatWorkingTimerNow(startedAt);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return (
    <span ref={textRef} className="desktop-agent-chat__working-timer">
      {initial}
    </span>
  );
}

function WorkingRow({
  startedAt,
  phaseLabel,
}: {
  startedAt?: number | null;
  phaseLabel?: string;
}) {
  return (
    <div className="desktop-agent-chat__working-row">
      <span className="desktop-agent-chat__working-dots" aria-hidden>
        <span className="desktop-agent-chat__working-dot" />
        <span className="desktop-agent-chat__working-dot" />
        <span className="desktop-agent-chat__working-dot" />
      </span>
      <span className="desktop-agent-chat__working-copy">
        {startedAt ? (
          <>
            Working for <WorkingTimer startedAt={startedAt} />
          </>
        ) : phaseLabel ? (
          <ShimmerText>{phaseLabel}</ShimmerText>
        ) : (
          "Working…"
        )}
      </span>
    </div>
  );
}

function TrailingIndicator({
  kind,
}: {
  kind: "success" | "failed" | "pending";
}) {
  return (
    <span
      className={`desktop-agent-chat__activity-flag is-${kind}`}
      aria-label={
        kind === "success" ? "Done" : kind === "failed" ? "Failed" : undefined
      }
      aria-hidden={kind === "pending" ? true : undefined}
    >
      {activityStatusLucide(kind)}
    </span>
  );
}

function DiffPreview({
  diff,
  maxLines = 40,
}: {
  diff: AgentChatActivityDiff;
  maxLines?: number;
}) {
  const truncated =
    diff.lines.length > maxLines
      ? [
          ...diff.lines.slice(0, maxLines - 1),
          {
            type: "ctx" as const,
            text: `… ${diff.lines.length - (maxLines - 1)} more lines`,
          },
        ]
      : diff.lines;

  return (
    <div className="desktop-agent-chat__diff" aria-label="File diff preview">
      <div className="desktop-agent-chat__diff-meta">
        <span className="desktop-agent-chat__diff-path">
          {diff.path ? diff.path.split(/[/\\]/).pop() : "diff"}
        </span>
        <span className="desktop-agent-chat__diff-stat">
          {formatDiffStat(diff)}
        </span>
      </div>
      <pre className="desktop-agent-chat__diff-body">
        {truncated.map((line, index) => (
          <div
            key={`${line.type}-${index}`}
            className={`desktop-agent-chat__diff-line desktop-agent-chat__diff-line--${line.type}`}
          >
            <span className="desktop-agent-chat__diff-prefix" aria-hidden>
              {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
            </span>
            <span className="desktop-agent-chat__diff-text">
              {line.text || " "}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

function ActivityRow({
  item,
  live = false,
  expanded,
  entering = false,
  enterDelayMs = 0,
  onToggle,
}: {
  item: AgentChatActivityItem;
  live?: boolean;
  expanded: boolean;
  entering?: boolean;
  enterDelayMs?: number;
  onToggle: () => void;
}) {
  const collapsible = activityIsCollapsible(item);
  const active =
    live &&
    (item.status === "in_progress" ||
      item.status === "pending" ||
      item.kind === "info");
  const preview = activityCompactPreview(item);
  const flag = activityTrailingIndicator(item, live);
  const heading =
    item.kind === "tool"
      ? toolActivityHeading({ title: item.title, toolKind: item.toolKind })
      : item.title;
  const title = active ? (
    <ShimmerText className="desktop-agent-chat__activity-title">
      {heading}
    </ShimmerText>
  ) : (
    <span className="desktop-agent-chat__activity-title">{heading}</span>
  );

  const body = (
    <div className="desktop-agent-chat__activity-header">
      <span className="desktop-agent-chat__activity-glyph" aria-hidden>
        {activityLucideIcon(item)}
      </span>
      <span className="desktop-agent-chat__activity-line">
        {title}
        {preview &&
        !(expanded && (item.kind === "thought" || item.kind === "info")) ? (
          <span
            className="desktop-agent-chat__activity-detail"
            title={item.detail}
          >
            {preview}
            {item.diff && !expanded ? ` · ${formatDiffStat(item.diff)}` : ""}
          </span>
        ) : item.diff && !expanded ? (
          <span className="desktop-agent-chat__activity-detail">
            {formatDiffStat(item.diff)}
          </span>
        ) : null}
      </span>
      {flag ? <TrailingIndicator kind={flag} /> : null}
      {collapsible ? (
        <span
          className={`desktop-agent-chat__activity-chevron${
            expanded ? " is-open" : ""
          }`}
          aria-hidden
        >
          ▸
        </span>
      ) : null}
    </div>
  );

  return (
    <li
      className={`desktop-agent-chat__activity desktop-agent-chat__activity--${item.kind}${
        item.status ? ` is-${item.status}` : ""
      }${expanded ? " is-expanded" : ""}${
        collapsible ? " is-collapsible" : ""
      }${entering ? " is-entering" : ""}`}
      style={
        entering && enterDelayMs > 0
          ? ({ ["--activity-enter-delay"]: `${enterDelayMs}ms` } as CSSProperties)
          : undefined
      }
    >
      {collapsible ? (
        <button
          type="button"
          className="desktop-agent-chat__activity-toggle"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {body}
        </button>
      ) : (
        <div className="desktop-agent-chat__activity-toggle is-static">{body}</div>
      )}

      {collapsible && (item.kind !== "tool" || item.diff) ? (
        <div className="desktop-agent-chat__activity-body">
          <div className="desktop-agent-chat__activity-body-inner">
            {item.kind !== "tool" && item.detail ? (
              <p className="desktop-agent-chat__activity-detail--thought">
                {item.detail}
              </p>
            ) : null}
            {item.diff ? <DiffPreview diff={item.diff} /> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Compact nested tool line: verb + path/pattern (always visible, not collapsible). */
function NestedToolActivityRow({ item }: { item: AgentChatActivityItem }) {
  const heading = toolActivityHeading({
    title: item.title,
    toolKind: item.toolKind,
  });
  const detail = activityCompactPreview(item);
  const flag = activityTrailingIndicator(item, false);

  return (
    <li
      className={`desktop-agent-chat__activity desktop-agent-chat__activity--tool desktop-agent-chat__activity--nested is-${
        item.status ?? "completed"
      }`}
    >
      <div className="desktop-agent-chat__activity-toggle is-static">
        <div className="desktop-agent-chat__activity-header">
          <span className="desktop-agent-chat__activity-glyph" aria-hidden>
            {activityLucideIcon(item)}
          </span>
          <span className="desktop-agent-chat__activity-line">
            <span className="desktop-agent-chat__activity-title">{heading}</span>
            {detail ? (
              <span
                className="desktop-agent-chat__activity-detail"
                title={item.detail}
              >
                {detail}
              </span>
            ) : null}
          </span>
          {flag ? <TrailingIndicator kind={flag} /> : null}
        </div>
      </div>
    </li>
  );
}

function AggregatedActivityRow({
  group,
  expanded,
  onToggle,
}: {
  group: AggregatedActivityGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const preview = group.items
    .map((item) => item.detail?.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <li
      className={`desktop-agent-chat__activity desktop-agent-chat__activity--tool is-collapsible is-completed${
        expanded ? " is-expanded" : ""
      }`}
    >
      <button
        type="button"
        className="desktop-agent-chat__activity-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <div className="desktop-agent-chat__activity-header">
          <span className="desktop-agent-chat__activity-glyph" aria-hidden>
            {activityLucideIcon(group.items[0]!)}
          </span>
          <span className="desktop-agent-chat__activity-line">
            <span className="desktop-agent-chat__activity-title">
              {group.label}
            </span>
            {preview && !expanded ? (
              <span
                className="desktop-agent-chat__activity-detail"
                title={preview}
              >
                {preview}
              </span>
            ) : null}
          </span>
          <TrailingIndicator kind="success" />
          <span
            className={`desktop-agent-chat__activity-chevron${
              expanded ? " is-open" : ""
            }`}
            aria-hidden
          >
            ▸
          </span>
        </div>
      </button>
      {expanded ? (
        <div className="desktop-agent-chat__activity-body desktop-agent-chat__activity-body--nested">
          <div className="desktop-agent-chat__activity-body-inner desktop-agent-chat__activity-body-inner--nested">
            <ul className="desktop-agent-chat__activity-list desktop-agent-chat__activity-list--nested">
              {group.items.map((item) => (
                <NestedToolActivityRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ActivityList({
  items,
  live = false,
  label = "Agent activity",
}: {
  items: readonly AgentChatActivityItem[];
  live?: boolean;
  label?: string;
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>(
    {},
  );
  const [showEarlier, setShowEarlier] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const { visible, hiddenCount } = splitWorkLogEntries(items, showEarlier);
  const aggregated = useMemo(
    () => aggregateToolActivities(visible, { live }),
    [visible, live],
  );

  useEffect(() => {
    if (items.length === 0) {
      seenIdsRef.current = new Set();
      setOverrides({});
      setGroupExpanded({});
      setEnteringIds(new Set());
      setShowEarlier(false);
      return;
    }

    const fresh: string[] = [];
    for (const item of items) {
      if (!seenIdsRef.current.has(item.id)) {
        seenIdsRef.current.add(item.id);
        fresh.push(item.id);
      }
    }
    if (fresh.length === 0) return;

    setEnteringIds((prev) => {
      const next = new Set(prev);
      for (const id of fresh) next.add(id);
      return next;
    });
    const timer = window.setTimeout(() => {
      setEnteringIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }, 360);
    return () => window.clearTimeout(timer);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="desktop-agent-chat__activity-wrap">
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="desktop-agent-chat__activity-overflow"
          aria-expanded={showEarlier}
          onClick={() => setShowEarlier((value) => !value)}
        >
          <span className="desktop-agent-chat__activity-overflow-chevron" aria-hidden>
            {showEarlier ? "▾" : "▸"}
          </span>
          {showEarlier
            ? "Show fewer tool calls"
            : `… ${hiddenCount} earlier item${hiddenCount === 1 ? "" : "s"} hidden`}
        </button>
      ) : null}
      <ul className="desktop-agent-chat__activity-list" aria-label={label}>
        {aggregated.map((entry, index) => {
          if (entry.kind === "group") {
            const expanded = groupExpanded[entry.id] === true;
            return (
              <AggregatedActivityRow
                key={entry.id}
                group={entry}
                expanded={expanded}
                onToggle={() => {
                  setGroupExpanded((prev) => ({
                    ...prev,
                    [entry.id]: !expanded,
                  }));
                }}
              />
            );
          }

          const item = entry.item;
          const expanded = activityIsCollapsible(item)
            ? (overrides[item.id] ?? defaultActivityExpanded(item, live))
            : false;
          return (
            <ActivityRow
              key={item.id}
              item={item}
              live={live}
              expanded={expanded}
              entering={enteringIds.has(item.id)}
              enterDelayMs={Math.min(index * 28, 140)}
              onToggle={() => {
                setOverrides((prev) => ({
                  ...prev,
                  [item.id]: !expanded,
                }));
              }}
            />
          );
        })}
      </ul>
    </div>
  );
}

function resolveTurnSegments(
  message: AgentChatMessage,
): AgentChatTurnSegment[] {
  if (message.segments && message.segments.length > 0) {
    return message.segments.map((segment) =>
      segment.kind === "text"
        ? { ...segment }
        : {
            ...segment,
            activities: segment.activities.map((item) => ({ ...item })),
          },
    );
  }
  return segmentsFromActivitiesAndText(message.activities, message.text);
}

function TurnSegmentList({
  segments,
  live = false,
  streamingLastText = false,
}: {
  segments: readonly AgentChatTurnSegment[];
  live?: boolean;
  streamingLastText?: boolean;
}) {
  const lastTextIndex = (() => {
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      if (segments[i]?.kind === "text") return i;
    }
    return -1;
  })();

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "work") {
          return (
            <ActivityList
              key={segment.id}
              items={segment.activities}
              live={live}
              label="Turn activity"
            />
          );
        }
        const text = segment.text.trimEnd();
        if (!text) return null;
        return (
          <AssistantMessageBubble
            key={segment.id}
            text={text}
            streaming={
              live && streamingLastText && index === lastTextIndex
            }
          />
        );
      })}
    </>
  );
}

function SettledAssistantTurn({
  message,
  startedAt,
  enterClass = "",
  isLatestTurn = false,
  onOpenTurnDiff,
}: {
  message: AgentChatMessage;
  startedAt: number | null;
  enterClass?: string;
  isLatestTurn?: boolean;
  onOpenTurnDiff?: (turnId: string, filePath?: string) => void;
}) {
  const segments = resolveTurnSegments(message);
  const activities = message.activities?.length
    ? message.activities
    : segments.flatMap((segment) =>
        segment.kind === "work" ? segment.activities : [],
      );
  const hasActivities = activities.length > 0;
  const hasPlanExtras =
    (message.planSteps && message.planSteps.length > 0) ||
    Boolean(message.proposedPlanMarkdown?.trim());
  const [expanded, setExpanded] = useState(true);
  const changedFiles = collectChangedFilesFromActivities(activities);
  const workStartedAt = message.workedStartedAt ?? startedAt;
  const foldLabel = turnWorkedLabel({
    startedAt: workStartedAt,
    endedAt: message.createdAt,
    activityCount: activities.length,
  });
  const hasWorkSummary =
    hasActivities ||
    hasPlanExtras ||
    (workStartedAt != null && message.createdAt >= workStartedAt);

  return (
    <div
      data-chat-turn-id={message.id}
      className={`desktop-agent-chat__turn desktop-agent-chat__turn--assistant${
        hasActivities || hasPlanExtras
          ? " desktop-agent-chat__turn--with-activity"
          : ""
      }${enterClass}`}
    >
      {hasWorkSummary ? (
        <div className="desktop-agent-chat__fold">
          {hasActivities || hasPlanExtras ? (
            <button
              type="button"
              className="desktop-agent-chat__fold-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              <span
                className={`desktop-agent-chat__fold-chevron${
                  expanded ? " is-open" : ""
                }`}
                aria-hidden
              >
                ▸
              </span>
              <span className="desktop-agent-chat__fold-label">{foldLabel}</span>
            </button>
          ) : (
            <div className="desktop-agent-chat__fold-toggle">
              <span className="desktop-agent-chat__fold-label">{foldLabel}</span>
            </div>
          )}
          {hasPlanExtras ? (
            <div
              className={`desktop-agent-chat__fold-panel${
                expanded ? " is-open" : ""
              }`}
            >
              <div className="desktop-agent-chat__fold-panel-inner">
                {message.proposedPlanMarkdown?.trim() ? (
                  <ProposedPlanCard
                    planMarkdown={message.proposedPlanMarkdown}
                  />
                ) : null}
                {message.planSteps && message.planSteps.length > 0 ? (
                  <PlanTodoList steps={message.planSteps} />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Always render the interleaved body outside the CSS-collapsed panel
          so assistant text stays visible when the work fold is closed. */}
      {segments.length > 0 ? (
        <TurnSegmentList
          segments={
            expanded || !hasActivities
              ? segments
              : segments.filter((segment) => segment.kind === "text")
          }
        />
      ) : (
        <AssistantMessageBubble
          text={message.text}
          createdAt={message.createdAt}
        />
      )}

      {onOpenTurnDiff ? (
        <DesktopAgentChatChangedFiles
          turnId={message.id}
          files={changedFiles}
          isLatestTurn={isLatestTurn}
          onOpenTurnDiff={onOpenTurnDiff}
        />
      ) : null}
    </div>
  );
}

export function DesktopAgentChatTranscript({
  messages,
  activities = [],
  segments: liveSegments = [],
  planSteps = [],
  proposedPlanMarkdown = null,
  assistantDraft = "",
  turnPhase = "idle",
  working = false,
  turnStartedAt = null,
  composerOverlayHeight = 0,
  projectLabel = "Task",
  taskDisplayId = null,
  emptyHint = "Send a message to talk to the agent.",
  onOpenTurnDiff,
  onRevertToMessage,
}: DesktopAgentChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const anchorElRef = useRef<HTMLDivElement | null>(null);
  const contentEndRef = useRef<HTMLDivElement | null>(null);
  const endSpaceRef = useRef<HTMLDivElement | null>(null);
  const scrollModeRef = useRef<AgentChatScrollMode>("following-end");
  const userScrollGenRef = useRef(0);
  const liveFollowGenRef = useRef(0);
  const positionedAnchorIdRef = useRef<string | null>(null);
  const [endSpacePx, setEndSpacePx] = useState(0);
  const [anchorMessageId, setAnchorMessageId] = useState<string | null>(null);
  const previousMessageIdsRef = useRef<string[] | null>(null);
  const [freshMessageIds, setFreshMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [liveEnter, setLiveEnter] = useState(false);
  const wasShowingLiveRef = useRef(false);

  const showActivities = activities.length > 0;
  const resolvedLiveSegments =
    liveSegments.length > 0
      ? liveSegments
      : segmentsFromActivitiesAndText(activities, assistantDraft);
  const showLiveSegments = resolvedLiveSegments.length > 0;
  const showPlanTodos = planSteps.length > 0;
  const showProposedPlan = Boolean(proposedPlanMarkdown?.trim());
  const draft = assistantDraft.trimEnd();
  const showDraft = draft.length > 0 && !showLiveSegments;
  const phaseLabel = working ? turnPhaseLabel(turnPhase) : "";
  const showTurnChrome =
    working ||
    showActivities ||
    showLiveSegments ||
    showDraft ||
    showPlanTodos ||
    showProposedPlan;
  const liveChangedFiles = collectChangedFilesFromActivities(activities);
  const showDraftHero = messages.length === 0 && !showTurnChrome;
  const [draftHeroVisible, setDraftHeroVisible] = useState(showDraftHero);
  const [draftHeroExiting, setDraftHeroExiting] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const turns = pairAgentChatTurns(messages);

  useEffect(() => {
    if (showDraftHero) {
      setDraftHeroVisible(true);
      setDraftHeroExiting(false);
      return;
    }
    if (!draftHeroVisible) return;
    setDraftHeroExiting(true);
    const timer = window.setTimeout(() => {
      setDraftHeroVisible(false);
      setDraftHeroExiting(false);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [draftHeroVisible, showDraftHero]);

  const latestUserMessageId = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") return messages[i]!.id;
    }
    return null;
  })();

  // Animate only newly appended turns (skip initial history hydrate).
  // When a live turn settles into a message, skip the enter flash — T3 keeps
  // that handoff quiet so the fold/label just appears in place.
  useEffect(() => {
    const ids = messages.map((message) => message.id);
    const previous = previousMessageIdsRef.current;
    previousMessageIdsRef.current = ids;
    if (previous === null) return;
    const prevSet = new Set(previous);
    const fresh = ids.filter((id) => !prevSet.has(id));
    if (fresh.length === 0) return;

    const settlingFromLive = wasShowingLiveRef.current && !showTurnChrome;
    const animatedFresh = settlingFromLive
      ? fresh.filter((id) => {
          const message = messages.find((entry) => entry.id === id);
          return message?.role !== "assistant";
        })
      : fresh;
    if (animatedFresh.length === 0) return;

    setFreshMessageIds(new Set(animatedFresh));
    const timer = window.setTimeout(() => setFreshMessageIds(new Set()), 380);
    return () => window.clearTimeout(timer);
  }, [messages, showTurnChrome]);

  useEffect(() => {
    if (showTurnChrome && !wasShowingLiveRef.current) {
      setLiveEnter(true);
      const timer = window.setTimeout(() => setLiveEnter(false), 380);
      wasShowingLiveRef.current = true;
      return () => window.clearTimeout(timer);
    }
    if (!showTurnChrome) {
      wasShowingLiveRef.current = false;
      setLiveEnter(false);
    }
  }, [showTurnChrome]);

  // T3: sending pins the new user turn near the top while the reply grows below.
  useEffect(() => {
    if (!working || !latestUserMessageId) return;
    if (anchorMessageId === latestUserMessageId) return;
    setAnchorMessageId(latestUserMessageId);
    scrollModeRef.current = "anchoring-new-turn";
    liveFollowGenRef.current = userScrollGenRef.current;
    positionedAnchorIdRef.current = null;
  }, [anchorMessageId, latestUserMessageId, working]);

  useEffect(() => {
    if (working) return;
    // After the turn settles, keep following the end until the user scrolls away.
    if (scrollModeRef.current === "anchoring-new-turn") {
      scrollModeRef.current = "following-end";
      liveFollowGenRef.current = userScrollGenRef.current;
    }
  }, [working]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const updateScrollChrome = () => {
      const remaining =
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      setShowScrollToBottom(remaining > 96);
    };

    const markManualNavigation = () => {
      userScrollGenRef.current += 1;
      if (scrollModeRef.current !== "free-scrolling") {
        scrollModeRef.current = "free-scrolling";
        liveFollowGenRef.current = -1;
      }
      updateScrollChrome();
    };

    scrollEl.addEventListener("wheel", markManualNavigation, { passive: true });
    scrollEl.addEventListener("touchmove", markManualNavigation, {
      passive: true,
    });
    scrollEl.addEventListener("scroll", updateScrollChrome, { passive: true });
    updateScrollChrome();
    return () => {
      scrollEl.removeEventListener("wheel", markManualNavigation);
      scrollEl.removeEventListener("touchmove", markManualNavigation);
      scrollEl.removeEventListener("scroll", updateScrollChrome);
    };
  }, [messages.length, showTurnChrome, endSpacePx]);

  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    const anchorEl = anchorElRef.current;
    const contentEndEl = contentEndRef.current;
    if (!scrollEl || !anchorEl || !contentEndEl || !anchorMessageId) {
      if (endSpaceRef.current) endSpaceRef.current.style.height = "0px";
      setEndSpacePx(0);
      return;
    }

    const metrics = measureAnchoredTurn({
      scrollEl,
      anchorEl,
      contentEndEl,
      composerOverlayHeight,
      anchorOffset: CHAT_LIST_ANCHOR_OFFSET,
    });
    if (!metrics) return;

    // Apply spacer before scrolling so the user turn can sit at the top.
    if (endSpaceRef.current) {
      endSpaceRef.current.style.height = `${metrics.endSpace}px`;
    }
    setEndSpacePx((prev) =>
      prev === metrics.endSpace ? prev : metrics.endSpace,
    );

    const followingLive =
      liveFollowGenRef.current === userScrollGenRef.current;

    if (
      scrollModeRef.current === "anchoring-new-turn" &&
      positionedAnchorIdRef.current !== anchorMessageId
    ) {
      positionedAnchorIdRef.current = anchorMessageId;
      scrollAnchorToTop({
        scrollEl,
        anchorEl,
        anchorOffset: CHAT_LIST_ANCHOR_OFFSET,
        // Chat always uses smooth scroll — ignore prefers-reduced-motion.
        behavior: "smooth",
      });
      return;
    }

    if (!followingLive) return;

    if (scrollModeRef.current === "anchoring-new-turn") {
      if (metrics.scrollDeltaToRevealEnd > 1) {
        scrollEl.scrollTop += metrics.scrollDeltaToRevealEnd;
      }
      return;
    }

    if (scrollModeRef.current === "following-end") {
      const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (maxScroll > 0 && scrollEl.scrollTop < maxScroll - 2) {
        scrollEl.scrollTop = maxScroll;
      }
    }
  }, [
    anchorMessageId,
    messages.length,
    activities.length,
    draft.length,
    turnPhase,
    working,
    showTurnChrome,
    composerOverlayHeight,
  ]);

  return (
    <div className="desktop-agent-chat__transcript-shell">
      <div
        ref={scrollRef}
        className="desktop-agent-chat__transcript desktop-agent-chat__transcript--top-fade"
        role="log"
        aria-live="polite"
      >
        {draftHeroVisible ? (
          <div
            className={`desktop-agent-chat__draft-hero${
              draftHeroExiting ? " is-exiting" : ""
            }`}
          >
            <p className="desktop-agent-chat__draft-hero-eyebrow">
              {taskDisplayId?.trim() || "Agent"}
            </p>
            <h2 className="desktop-agent-chat__draft-hero-title">
              {projectLabel.trim() || "BacksterOS"}
            </h2>
            <p className="desktop-agent-chat__draft-hero-hint">{emptyHint}</p>
          </div>
        ) : null}
        <div className="desktop-agent-chat__transcript-inner">
          {turns.map((turn) => (
            <div key={turn.turnId}>
              {turn.user ? (
                <div
                  ref={
                    turn.user.id === anchorMessageId ? anchorElRef : undefined
                  }
                  data-chat-anchor={
                    turn.user.id === anchorMessageId ? "true" : undefined
                  }
                  data-chat-turn-id={turn.user.id}
                  className={`desktop-agent-chat__turn desktop-agent-chat__turn--user${
                    freshMessageIds.has(turn.user.id)
                      ? " desktop-agent-chat__turn--enter"
                      : ""
                  }`}
                >
                  <UserMessageBubble
                    text={turn.user.text}
                    createdAt={turn.user.createdAt}
                    images={turn.user.images}
                    onRevert={
                      onRevertToMessage &&
                      (turn.endIndex < messages.length - 1 || showTurnChrome)
                        ? () => onRevertToMessage(turn.user!.id)
                        : undefined
                    }
                  />
                </div>
              ) : null}
              {turn.assistant ? (
                <SettledAssistantTurn
                  message={turn.assistant}
                  startedAt={turn.user?.createdAt ?? null}
                  enterClass={
                    freshMessageIds.has(turn.assistant.id)
                      ? " desktop-agent-chat__turn--enter"
                      : ""
                  }
                  isLatestTurn={
                    !showTurnChrome && turn.endIndex === messages.length - 1
                  }
                  onOpenTurnDiff={onOpenTurnDiff}
                />
              ) : null}
            </div>
          ))}

          {showTurnChrome ? (
            <div
              className={`desktop-agent-chat__turn desktop-agent-chat__turn--assistant desktop-agent-chat__turn--live${
                liveEnter ? " desktop-agent-chat__turn--enter" : ""
              }`}
            >
              {showLiveSegments ? (
                <TurnSegmentList
                  segments={resolvedLiveSegments}
                  live
                  streamingLastText={working}
                />
              ) : (
                <>
                  {showActivities ? (
                    <ActivityList items={activities} live />
                  ) : null}
                  {showDraft ? (
                    <AssistantMessageBubble text={draft} streaming={working} />
                  ) : null}
                </>
              )}
              {showProposedPlan && proposedPlanMarkdown ? (
                <ProposedPlanCard planMarkdown={proposedPlanMarkdown} />
              ) : null}
              {showPlanTodos ? <PlanTodoList steps={planSteps} /> : null}

              {onOpenTurnDiff ? (
                <DesktopAgentChatChangedFiles
                  turnId="live"
                  files={liveChangedFiles}
                  isLatestTurn
                  onOpenTurnDiff={onOpenTurnDiff}
                />
              ) : null}

              {working ? (
                <WorkingRow
                  startedAt={turnStartedAt}
                  phaseLabel={phaseLabel || undefined}
                />
              ) : null}
            </div>
          ) : null}

          <div ref={contentEndRef} className="desktop-agent-chat__content-end" />
          <div
            ref={endSpaceRef}
            className="desktop-agent-chat__end-space"
            style={{ height: endSpacePx }}
            aria-hidden
          />
        </div>
      </div>
      {showScrollToBottom ? (
        <button
          type="button"
          className="desktop-agent-chat__scroll-end"
          onClick={() => {
            const scrollEl = scrollRef.current;
            if (!scrollEl) return;
            scrollModeRef.current = "following-end";
            liveFollowGenRef.current = userScrollGenRef.current;
            scrollEl.scrollTo({
              top: scrollEl.scrollHeight,
              behavior: "smooth",
            });
            setShowScrollToBottom(false);
          }}
        >
          Scroll to end
        </button>
      ) : null}
    </div>
  );
}
