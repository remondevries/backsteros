import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { DocumentMarkdownPreview } from "@backsteros/ui";
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  activityIsCollapsible,
  defaultActivityExpanded,
  formatDiffStat,
  segmentsFromActivitiesAndText,
  type AgentChatActivityDiff,
  type AgentChatActivityItem,
  type AgentChatTurnSegment,
} from "../lib/agent/agent-acp-activity";
import {
  activityLucideIcon,
  activityStatusLucide,
} from "../lib/agent/agent-chat-icons";
import {
  ANCHOR_SCROLL_SETTLE_FALLBACK_MS,
  CHAT_LIST_ANCHOR_OFFSET,
  createShowDebouncer,
  type AgentChatScrollMode,
} from "../lib/agent/agent-chat-scroll";
import {
  collectChangedFilesFromActivities,
  turnWorkedLabel,
} from "../lib/agent/agent-chat-timeline";
import {
  agentChatTimelineRowAnchorId,
  agentChatTimelineRowKey,
  agentChatTimelineRowType,
  deriveAgentChatTimelineRows,
  type AgentChatTimelineRow,
} from "../lib/agent/agent-chat-timeline-rows";
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
import { toolActivityHeading } from "../lib/agent/t3-port/work-entry-labels";
import {
  resolveChatListAnchoredEndSpace,
} from "../lib/agent/t3-port/chat-list";
import type { AgentChatPlanStep } from "../lib/agent/t3-port/cursor-todos";
import {
  deriveTimelineMinimapItems,
  resolveTimelineMinimapHasPersistentGutter,
  resolveTimelineMinimapHitStripWidth,
  resolveTimelineRowHeight,
  resolveTimelineRowTop,
} from "../lib/agent/t3-port/timeline-minimap";
import {
  aggregateToolActivities,
  type AggregatedActivityGroup,
} from "../lib/agent/tool-activity-aggregate";
import { PlanTodoList } from "./agent-chat/plan-todo-list";
import { ProposedPlanCard } from "./agent-chat/proposed-plan-card";
import { AgentChatTimelineMinimap } from "./agent-chat/timeline-minimap";
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
  working?: boolean;
  /**
   * When set and `working`, the matching settled assistant row is suppressed
   * so we do not double-render the durable in-progress timeline + live overlay.
   */
  liveTurnMessageId?: string | null;
  /** Epoch ms when the current turn started (T3 WorkingTimer). */
  turnStartedAt?: number | null;
  /** Footer height so anchored turns clear the composer (T3 composerOverlayHeight). */
  composerOverlayHeight?: number;
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
  if (!trimmed) return null;

  return (
    <div className="desktop-agent-chat__bubble-wrap desktop-agent-chat__bubble-wrap--assistant">
      <div
        className={`desktop-agent-chat__bubble desktop-agent-chat__bubble--assistant${
          streaming ? " desktop-agent-chat__bubble--draft" : ""
        }`}
      >
        <div className="desktop-agent-chat__bubble-md">
          <DocumentMarkdownPreview body={trimmed} />
        </div>
      </div>
      {!streaming ? (
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

function WorkingRow({ startedAt }: { startedAt?: number | null }) {
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
  const preview = activityCompactPreview(item);
  const flag = activityTrailingIndicator(item, live);
  const heading =
    item.kind === "tool"
      ? toolActivityHeading({ title: item.title, toolKind: item.toolKind })
      : item.title;
  const title = (
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
          <ChevronDown size={12} strokeWidth={2} />
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
            <ChevronDown size={12} strokeWidth={2} />
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
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={
                showEarlier
                  ? "desktop-agent-chat__chevron-icon is-open"
                  : "desktop-agent-chat__chevron-icon"
              }
            />
          </span>
          {showEarlier
            ? "Show fewer tool calls"
            : `+${hiddenCount} previous tool call${hiddenCount === 1 ? "" : "s"}`}
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
                className="desktop-agent-chat__fold-chevron"
                aria-hidden
              >
                {expanded ? (
                  <ChevronDown size={14} strokeWidth={2} />
                ) : (
                  <ChevronRight size={14} strokeWidth={2} />
                )}
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
  working = false,
  liveTurnMessageId = null,
  turnStartedAt = null,
  composerOverlayHeight = 0,
  onOpenTurnDiff,
  onRevertToMessage,
}: DesktopAgentChatTranscriptProps) {
  const listRef = useRef<LegendListRef | null>(null);
  const scrollModeRef = useRef<AgentChatScrollMode>("following-end");
  const userScrollGenRef = useRef(0);
  const liveFollowGenRef = useRef<number | null>(0);
  const pendingAnchorIdRef = useRef<string | null>(null);
  const positionedAnchorIdRef = useRef<string | null>(null);
  const settledAnchorIdRef = useRef<string | null>(null);
  const settleCleanupRef = useRef<(() => void) | null>(null);
  const previousMessageIdsRef = useRef<string[] | null>(null);
  const [minimapStripMap] = useState(() => new Map<string, HTMLSpanElement>());
  const [timelineViewportElement, setTimelineViewportElement] =
    useState<HTMLDivElement | null>(null);
  const [minimapHasPersistentGutter, setMinimapHasPersistentGutter] =
    useState(false);
  const [minimapHitStripWidth, setMinimapHitStripWidth] = useState(0);
  const [freshMessageIds, setFreshMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [liveEnter, setLiveEnter] = useState(false);
  const wasShowingLiveRef = useRef(false);
  const [anchorMessageId, setAnchorMessageId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const showScrollDebouncerRef = useRef(
    createShowDebouncer(() => setShowScrollToBottom(true)),
  );

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
  // T3 only appends the working/live row while the turn is unsettled. Do not
  // keep chrome up from leftover turnUi after settle (looks "still busy").
  const showTurnChrome = Boolean(working);
  const liveChangedFiles = collectChangedFilesFromActivities(activities);

  const rows = useMemo(
    () =>
      deriveAgentChatTimelineRows({
        messages,
        showTurnChrome,
        working: Boolean(working),
        liveTurnMessageId,
      }),
    [liveTurnMessageId, messages, showTurnChrome, working],
  );

  const minimapItems = useMemo(
    () => deriveTimelineMinimapItems(rows),
    [rows],
  );

  const latestUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") return messages[i]!.id;
    }
    return null;
  }, [messages]);

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

  // Keep the timeline stuck to the end so each new user/agent row appears
  // under the previous turn. T3 pins the prompt to the viewport top; that
  // scrolled prior agent replies out of view and felt like messages jumped up.
  useEffect(() => {
    if (!working || !latestUserMessageId) return;
    scrollModeRef.current = "following-end";
    liveFollowGenRef.current = userScrollGenRef.current;
    pendingAnchorIdRef.current = null;
    if (anchorMessageId != null) {
      setAnchorMessageId(null);
    }
    settleCleanupRef.current?.();
    settleCleanupRef.current = null;
    showScrollDebouncerRef.current.cancel();
    setShowScrollToBottom(false);
  }, [anchorMessageId, latestUserMessageId, working]);

  useEffect(() => {
    if (working) return;
    if (scrollModeRef.current === "anchoring-new-turn") {
      scrollModeRef.current = "following-end";
      liveFollowGenRef.current = userScrollGenRef.current;
    }
    if (anchorMessageId != null) {
      setAnchorMessageId(null);
    }
  }, [anchorMessageId, working]);

  const cancelLiveFollowForUserNavigation = useCallback(() => {
    userScrollGenRef.current += 1;
    scrollModeRef.current = "free-scrolling";
    liveFollowGenRef.current = null;
    pendingAnchorIdRef.current = null;
    if (
      positionedAnchorIdRef.current != null &&
      settledAnchorIdRef.current !== positionedAnchorIdRef.current
    ) {
      settledAnchorIdRef.current = positionedAnchorIdRef.current;
    }
    settleCleanupRef.current?.();
    settleCleanupRef.current = null;
  }, []);

  const finishAnimatedPositioning = useCallback((messageId: string) => {
    if (positionedAnchorIdRef.current !== messageId) return;
    settledAnchorIdRef.current = messageId;
    settleCleanupRef.current = null;
  }, []);

  const positionAnchorAtIndex = useCallback(
    (messageId: string, anchorIndex: number, remainingAttempts: number) => {
      requestAnimationFrame(() => {
        if (positionedAnchorIdRef.current !== messageId) return;
        const list = listRef.current;
        if (!list) {
          if (remainingAttempts > 0) {
            positionAnchorAtIndex(messageId, anchorIndex, remainingAttempts - 1);
          }
          return;
        }

        let finished = false;
        const scrollNode = list.getScrollableNode();
        const onDone = () => {
          if (finished) return;
          finished = true;
          window.clearTimeout(fallbackTimer);
          scrollNode.removeEventListener("scrollend", onDone);
          finishAnimatedPositioning(messageId);
        };
        const fallbackTimer = window.setTimeout(
          onDone,
          ANCHOR_SCROLL_SETTLE_FALLBACK_MS,
        );
        scrollNode.addEventListener("scrollend", onDone, { once: true });
        settleCleanupRef.current = () => {
          finished = true;
          window.clearTimeout(fallbackTimer);
          scrollNode.removeEventListener("scrollend", onDone);
        };

        void list.scrollToIndex({
          index: anchorIndex,
          animated: true,
          // T3 pins the user turn at the top of the viewport.
          viewPosition: 0,
          viewOffset: CHAT_LIST_ANCHOR_OFFSET,
        });
      });
    },
    [finishAnimatedPositioning],
  );

  const handleAnchorReady = useCallback(
    (info: { anchorIndex: number | undefined }) => {
      if (anchorMessageId == null || info.anchorIndex === undefined) return;
      if (pendingAnchorIdRef.current === anchorMessageId) {
        pendingAnchorIdRef.current = null;
      }
      if (positionedAnchorIdRef.current === anchorMessageId) return;
      positionedAnchorIdRef.current = anchorMessageId;
      settledAnchorIdRef.current = null;
      settleCleanupRef.current?.();
      positionAnchorAtIndex(anchorMessageId, info.anchorIndex, 12);
    },
    [anchorMessageId, positionAnchorAtIndex],
  );

  const anchoredEndSpace = useMemo(() => {
    const config = resolveChatListAnchoredEndSpace(
      rows,
      anchorMessageId,
      agentChatTimelineRowAnchorId,
    );
    if (!config) return undefined;
    return {
      ...config,
      onReady: handleAnchorReady,
    };
  }, [anchorMessageId, handleAnchorReady, rows]);

  // Attach manual-navigation listeners to LegendList's scroll node (T3 ChatView).
  useEffect(() => {
    let removeListeners: (() => void) | null = null;
    const frame = requestAnimationFrame(() => {
      const scrollNode = listRef.current?.getScrollableNode();
      if (!scrollNode) return;
      const handleManualNavigation = () => {
        cancelLiveFollowForUserNavigation();
      };
      scrollNode.addEventListener("wheel", handleManualNavigation, {
        passive: true,
      });
      scrollNode.addEventListener("touchmove", handleManualNavigation, {
        passive: true,
      });
      scrollNode.addEventListener("pointerdown", handleManualNavigation, {
        passive: true,
      });
      removeListeners = () => {
        scrollNode.removeEventListener("wheel", handleManualNavigation);
        scrollNode.removeEventListener("touchmove", handleManualNavigation);
        scrollNode.removeEventListener("pointerdown", handleManualNavigation);
      };
    });
    return () => {
      cancelAnimationFrame(frame);
      removeListeners?.();
    };
  }, [cancelLiveFollowForUserNavigation, rows.length]);

  const updateMinimapInView = useCallback(() => {
    const state = listRef.current?.getState();
    if (!state || minimapItems.length === 0) return;

    const scrollTop = state.scroll ?? 0;
    const scrollBottom = scrollTop + (state.scrollLength ?? 0);

    for (const item of minimapItems) {
      const strip = minimapStripMap.get(item.id);
      if (!strip) continue;

      const rowTop = resolveTimelineRowTop(state, item.rowIndex);
      const rowHeight = resolveTimelineRowHeight(state, item.rowIndex);
      const inView =
        rowTop !== null &&
        rowTop < scrollBottom &&
        rowTop + Math.max(1, rowHeight ?? 1) > scrollTop;

      strip.dataset.inView = inView ? "true" : "false";
    }
  }, [minimapItems, minimapStripMap]);

  const handleListScroll = useCallback(() => {
    updateMinimapInView();
    const state = listRef.current?.getState();
    const atEnd = state?.isAtEnd === true || state?.isNearEnd === true;
    if (atEnd) {
      if (scrollModeRef.current !== "anchoring-new-turn") {
        scrollModeRef.current = "following-end";
        liveFollowGenRef.current = userScrollGenRef.current;
      }
      showScrollDebouncerRef.current.cancel();
      setShowScrollToBottom(false);
      return;
    }
    if (
      liveFollowGenRef.current === userScrollGenRef.current &&
      scrollModeRef.current !== "free-scrolling"
    ) {
      showScrollDebouncerRef.current.cancel();
      setShowScrollToBottom(false);
      return;
    }
    scrollModeRef.current = "free-scrolling";
    liveFollowGenRef.current = null;
    showScrollDebouncerRef.current.maybeExecute();
  }, [updateMinimapInView]);

  useEffect(() => {
    const frame = requestAnimationFrame(updateMinimapInView);
    return () => cancelAnimationFrame(frame);
  }, [rows.length, updateMinimapInView]);

  useEffect(() => {
    if (!timelineViewportElement) return;

    const measure = () => {
      const viewportWidth =
        timelineViewportElement.getBoundingClientRect().width;
      const nextHasPersistentGutter =
        resolveTimelineMinimapHasPersistentGutter(viewportWidth);
      setMinimapHasPersistentGutter((current) =>
        current === nextHasPersistentGutter
          ? current
          : nextHasPersistentGutter,
      );
      setMinimapHitStripWidth(
        resolveTimelineMinimapHitStripWidth(viewportWidth),
      );
    };

    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(timelineViewportElement);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [rows.length, timelineViewportElement]);

  // T3 double-rAF live follow while anchoring / following-end.
  useEffect(() => {
    if (liveFollowGenRef.current !== userScrollGenRef.current) return;
    if (pendingAnchorIdRef.current != null) return;

    let secondFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (liveFollowGenRef.current !== userScrollGenRef.current) return;
        if (pendingAnchorIdRef.current != null) return;
        const list = listRef.current;
        if (!list) return;

        if (
          positionedAnchorIdRef.current != null &&
          settledAnchorIdRef.current !== positionedAnchorIdRef.current &&
          scrollModeRef.current === "anchoring-new-turn"
        ) {
          return;
        }

        if (scrollModeRef.current === "anchoring-new-turn") {
          const state = list.getState();
          const anchorIndex = anchoredEndSpace?.anchorIndex;
          if (anchorIndex == null) return;
          const anchorTop = state.positionAtIndex(anchorIndex);
          const lastIndex = rows.length - 1;
          if (lastIndex < 0) return;
          const lastTop = state.positionAtIndex(lastIndex);
          const lastSize = state.sizeAtIndex(lastIndex);
          if (
            !Number.isFinite(anchorTop) ||
            !Number.isFinite(lastTop) ||
            !Number.isFinite(lastSize)
          ) {
            return;
          }
          const lastBottom = lastTop + Math.max(1, lastSize);
          const usable =
            state.scrollLength -
            composerOverlayHeight -
            CHAT_LIST_ANCHOR_OFFSET;
          const target = Math.max(0, lastBottom - Math.max(0, usable));
          const delta = target - state.scroll;
          if (delta > 1) {
            void list.scrollToOffset({
              offset: state.scroll + delta,
              animated: false,
            });
          }
          return;
        }

        if (scrollModeRef.current !== "following-end") return;
        // Stick to the latest row. Short threads dock via alignItemsAtEnd;
        // overflowing threads need an explicit scrollToEnd.
        void list.scrollToEnd?.({ animated: false });
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      if (secondFrame != null) cancelAnimationFrame(secondFrame);
    };
  }, [
    anchoredEndSpace?.anchorIndex,
    composerOverlayHeight,
    rows,
    showTurnChrome,
    working,
    activities.length,
    draft.length,
    liveSegments.length,
  ]);

  useEffect(() => {
    return () => {
      settleCleanupRef.current?.();
      showScrollDebouncerRef.current.cancel();
    };
  }, []);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<AgentChatTimelineRow>) => {
      let body: ReactNode;
      if (item.kind === "user") {
        const canRevert =
          onRevertToMessage &&
          (item.turnEndIndex < messages.length - 1 || showTurnChrome);
        body = (
          <div
            data-chat-anchor={
              item.message.id === anchorMessageId ? "true" : undefined
            }
            data-chat-turn-id={item.message.id}
            className={`desktop-agent-chat__turn desktop-agent-chat__turn--user${
              freshMessageIds.has(item.message.id)
                ? " desktop-agent-chat__turn--enter"
                : ""
            }`}
          >
            <UserMessageBubble
              text={item.message.text}
              createdAt={item.message.createdAt}
              images={item.message.images}
              onRevert={
                canRevert
                  ? () => onRevertToMessage(item.message.id)
                  : undefined
              }
            />
          </div>
        );
      } else if (item.kind === "assistant") {
        body = (
          <SettledAssistantTurn
            message={item.message}
            startedAt={item.startedAt}
            enterClass={
              freshMessageIds.has(item.message.id)
                ? " desktop-agent-chat__turn--enter"
                : ""
            }
            isLatestTurn={item.isLatestTurn}
            onOpenTurnDiff={onOpenTurnDiff}
          />
        );
      } else {
        body = (
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
            {working ? <WorkingRow startedAt={turnStartedAt} /> : null}
          </div>
        );
      }

      return (
        <div
          className="desktop-agent-chat__timeline-row"
          data-timeline-root="true"
        >
          {body}
        </div>
      );
    },
    [
      activities,
      anchorMessageId,
      draft,
      freshMessageIds,
      liveChangedFiles,
      liveEnter,
      messages.length,
      onOpenTurnDiff,
      onRevertToMessage,
      planSteps,
      proposedPlanMarkdown,
      resolvedLiveSegments,
      showActivities,
      showDraft,
      showLiveSegments,
      showPlanTodos,
      showProposedPlan,
      showTurnChrome,
      turnStartedAt,
      working,
    ],
  );

  return (
    <div
      ref={setTimelineViewportElement}
      className="desktop-agent-chat__transcript-shell"
    >
      <LegendList
        ref={listRef}
        data={rows}
        keyExtractor={agentChatTimelineRowKey}
        getItemType={(item) => agentChatTimelineRowType(item)}
        renderItem={renderItem}
        estimatedItemSize={90}
        initialScrollAtEnd
        alignItemsAtEnd
        contentInsetEndAdjustment={composerOverlayHeight}
        {...(anchoredEndSpace ? { anchoredEndSpace } : {})}
        maintainScrollAtEnd={
          anchoredEndSpace
            ? false
            : {
                animated: false,
                on: {
                  dataChange: true,
                  itemLayout: true,
                  layout: true,
                },
              }
        }
        maintainVisibleContentPosition={{
          data: true,
          size: false,
        }}
        onScroll={handleListScroll}
        className="desktop-agent-chat__transcript desktop-agent-chat__transcript--top-fade"
        style={
          {
            height: "100%",
            minHeight: 0,
            /* Match fade height to the composer overlay so text dissolves
               behind the message box (same mask technique as the top edge). */
            ...(composerOverlayHeight > 0
              ? {
                  ["--desktop-agent-chat-bottom-fade"]: `${composerOverlayHeight}px`,
                }
              : null),
          } as CSSProperties
        }
      />
      <AgentChatTimelineMinimap
        items={minimapItems}
        bottomInset={composerOverlayHeight}
        hasPersistentGutter={minimapHasPersistentGutter}
        hitStripWidth={minimapHitStripWidth}
        stripMap={minimapStripMap}
        onSelect={(item) => {
          cancelLiveFollowForUserNavigation();
          void listRef.current?.scrollToIndex({
            index: item.rowIndex,
            animated: true,
            viewOffset: 24,
          });
        }}
      />
      {showScrollToBottom ? (
        <button
          type="button"
          className="desktop-agent-chat__scroll-end"
          style={{ bottom: composerOverlayHeight + 4 }}
          onClick={() => {
            scrollModeRef.current = "following-end";
            liveFollowGenRef.current = userScrollGenRef.current;
            showScrollDebouncerRef.current.cancel();
            void listRef.current?.scrollToEnd?.({ animated: true });
            setShowScrollToBottom(false);
          }}
        >
          Scroll to end
        </button>
      ) : null}
    </div>
  );
}
