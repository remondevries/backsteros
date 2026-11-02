import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type {
  ChatUiMessage,
  TaskAgentRun,
  TaskAgentRunCheck,
  TaskAgentRunPhase,
} from "@backsteros/contracts";
import {
  ChatThread,
  SegmentedPillToggle,
  TaskStatusIcon,
  type SegmentedPillToggleOption,
  type TaskStatus,
} from "@backsteros/ui";
import { Check } from "lucide-react";

import {
  parseGitCommitShow,
  type ChangelogFileKind,
  type ParsedGitCommitChangelog,
} from "../lib/git-commit-changelog";
import { fetchGitCommitShow } from "../lib/task-agent-acp-transcript";
import { useTaskAgentBuildTranscript } from "../lib/use-task-agent-build-transcript";
import { TaskShellTerminal } from "./task-shell-terminal";

export type TaskAgentRunSectionId =
  | "brief"
  | "build"
  | "verify"
  | "record"
  | "ship";

export type TaskAgentRunAccordionProps = {
  active: boolean;
  taskId: string;
  cwd: string | null;
  agentName?: string | null;
  agentAvatarSrc?: string | null;
  /** Task assignee — shown on user lines in Build/Verify Log. */
  assigneeName?: string | null;
  /** Live factory run from core (optional while scaffold / offline). */
  run?: TaskAgentRun | null;
  /** Brief thread messages (Grok conductor chat). */
  briefMessages?: ChatUiMessage[];
  onSendBriefMessage?: (text: string) => void;
  onAnswerBriefChoices?: (
    messageId: string,
    values: readonly string[],
  ) => void | Promise<void>;
  onAnswerBriefApproval?: (
    messageId: string,
    decision: "approved" | "rejected",
    note?: string,
  ) => void | Promise<void>;
  onAnswerBriefForm?: (
    messageId: string,
    values: Record<string, string | number | boolean>,
  ) => void | Promise<void>;
  onAnswerBriefEmailDraft?: (
    messageId: string,
    emailAction: "send" | "discard",
    edits?: {
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      body?: string;
      from?: string;
    },
  ) => void | Promise<void>;
  orchestratorError?: string | null;
  /** Hydrated git HEAD after a Record turn (from desktop orchestrator). */
  recordHeadSha?: string | null;
  /** Remon picks Commit vs PR in Record (skips asking Grok). */
  onChooseRecordIntent?: (intent: "commit" | "pr") => void | Promise<void>;
};

/** Build surfaces: agent live view, console log, or file diff. */
type BuildMode = "live" | "log" | "diff";
type VerifyMode = "results" | "log";
type ReviewCheckStatus = "pass" | "fail" | "running" | "pending";
/** Git receipt — PR for reviewable work, commits for small tasks. */
type RecordKind = "pr" | "commit";

type ReviewCheckItem = {
  id: string;
  label: string;
  status: ReviewCheckStatus;
  detail: string;
  /** Wall time for finished checks, e.g. "1.4s". */
  durationLabel?: string | null;
  /** Epoch ms when a running check started (live counter). */
  startedAtMs?: number | null;
};

const SECTION_ORDER: readonly TaskAgentRunSectionId[] = [
  "brief",
  "build",
  "verify",
  "record",
  "ship",
];

function phaseToSectionId(phase: TaskAgentRunPhase): TaskAgentRunSectionId {
  if (phase === "done" || phase === "failed") return "ship";
  if (
    phase === "brief" ||
    phase === "build" ||
    phase === "verify" ||
    phase === "record" ||
    phase === "ship"
  ) {
    return phase;
  }
  return "brief";
}

function sectionsForPhase(
  phase: TaskAgentRunPhase | null,
  opts?: {
    recordIntent?: "commit" | "pr" | null;
    recordDone?: boolean;
  },
): readonly {
  id: TaskAgentRunSectionId;
  title: string;
  status: TaskStatus;
  working?: boolean;
}[] {
  const active = phase ? phaseToSectionId(phase) : "brief";
  const activeIndex = SECTION_ORDER.indexOf(active);
  const titles: Record<TaskAgentRunSectionId, string> = {
    brief: "Brief",
    build: "Build",
    verify: "Verify",
    record: "Record",
    ship: "Ship",
  };
  const recordIntent = opts?.recordIntent ?? null;
  const recordDone = Boolean(opts?.recordDone);
  return SECTION_ORDER.map((id, index) => {
    if (index < activeIndex) {
      return { id, title: titles[id], status: "completed" as const };
    }
    if (index === activeIndex) {
      if (id === "brief") {
        return {
          id,
          title: titles[id],
          status: "ready_to_start" as const,
          working: true,
        };
      }
      if (id === "build") {
        return { id, title: titles[id], status: "in_progress" as const };
      }
      if (id === "verify") {
        return { id, title: titles[id], status: "in_review" as const };
      }
      if (id === "record") {
        if (recordDone) {
          return { id, title: titles[id], status: "completed" as const };
        }
        if (recordIntent === "commit" || recordIntent === "pr") {
          return {
            id,
            title: titles[id],
            status: "in_progress" as const,
            working: true,
          };
        }
        return { id, title: titles[id], status: "waiting" as const };
      }
      return { id, title: titles[id], status: "completed" as const };
    }
    return { id, title: titles[id], status: "backlog" as const };
  });
}

function mapRunChecksToReviewItems(
  checks: readonly TaskAgentRunCheck[],
): ReviewCheckItem[] {
  const sorted = [...checks].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key),
  );
  // At most one active row — extras that were marked running stay backlog.
  const activeRunningId =
    sorted.find((check) => check.status === "running")?.id ?? null;

  return sorted.map((check) => {
    let status: ReviewCheckStatus =
      check.status === "pass"
        ? "pass"
        : check.status === "fail"
          ? "fail"
          : check.status === "running"
            ? "running"
            : "pending";
    if (status === "running" && check.id !== activeRunningId) {
      status = "pending";
    }
    return {
      id: check.id,
      label: check.label,
      status,
      detail: check.detail?.trim() || check.logText?.trim() || "",
      durationLabel: null,
      startedAtMs:
        status === "running" && check.startedAt
          ? Date.parse(check.startedAt)
          : null,
    };
  });
}

type CommitRecord = {
  kind: RecordKind;
  shortSha: string;
  sha: string;
  subject: string;
  body: string;
  authorName: string;
  authoredAtLabel: string;
  branch: string;
  additions: number;
  deletions: number;
  filesChanged: number;
  pullRequest: {
    number: number;
    title: string;
    state: "open" | "merged" | "closed";
    urlLabel: string;
  } | null;
};

const BUILD_MODE_OPTIONS: readonly SegmentedPillToggleOption<BuildMode>[] = [
  { value: "live", label: "Live" },
  { value: "diff", label: "Diff" },
  { value: "log", label: "Log" },
];

const VERIFY_MODE_OPTIONS: readonly SegmentedPillToggleOption<VerifyMode>[] = [
  { value: "results", label: "Results" },
  { value: "log", label: "Log" },
];

function changelogKindLetter(kind: ChangelogFileKind): string {
  switch (kind) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "modified":
      return "M";
  }
}

function formatCompactDiffCount(value: number): string {
  if (value < 1000) return String(value);
  const k = value / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
}

function formatAuthoredAtLabel(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) return "Just now";
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return trimmed;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return trimmed;
  }
}

function ChangelogDiffPanel({
  files,
  openFileId,
  onOpenFileIdChange,
  emptyLabel = "No file diff for this run yet.",
}: {
  files: ParsedGitCommitChangelog["files"];
  openFileId: string | null;
  onOpenFileIdChange: (id: string | null) => void;
  emptyLabel?: string;
}) {
  const totalAdditions = files.reduce((n, f) => n + f.additions, 0);
  const totalDeletions = files.reduce((n, f) => n + f.deletions, 0);

  if (files.length === 0) {
    return (
      <p className="task-agent-run-accordion__commit-empty" role="status">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="task-agent-run-accordion__changelog">
      <div className="task-agent-run-accordion__changelog-summary">
        <span>
          {files.length} file{files.length === 1 ? "" : "s"} changed
        </span>
        <span
          className="task-agent-run-accordion__changelog-stat"
          aria-label={`${totalAdditions} additions, ${totalDeletions} deletions`}
        >
          <span className="is-add">+{formatCompactDiffCount(totalAdditions)}</span>
          <span className="is-del">−{formatCompactDiffCount(totalDeletions)}</span>
        </span>
      </div>
      <ul className="task-agent-run-accordion__changelog-list">
        {files.map((file) => {
          const fileOpen = openFileId === file.id;
          const panelId = `changelog-file-${file.id}`;
          return (
            <li
              key={file.id}
              className={[
                "task-agent-run-accordion__changelog-item",
                fileOpen ? "is-open" : null,
                `is-${file.kind}`,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className="task-agent-run-accordion__changelog-row"
                aria-expanded={fileOpen}
                aria-controls={panelId}
                onClick={() =>
                  onOpenFileIdChange(fileOpen ? null : file.id)
                }
              >
                <span
                  className="task-agent-run-accordion__changelog-chevron"
                  aria-hidden="true"
                />
                <span
                  className="task-agent-run-accordion__changelog-kind"
                  aria-label={file.kind}
                >
                  {changelogKindLetter(file.kind)}
                </span>
                <span className="task-agent-run-accordion__changelog-path">
                  {file.path}
                </span>
                <span
                  className="task-agent-run-accordion__changelog-stat"
                  aria-label={`${file.additions} additions, ${file.deletions} deletions`}
                >
                  <span className="is-add">
                    +{formatCompactDiffCount(file.additions)}
                  </span>
                  <span className="is-del">
                    −{formatCompactDiffCount(file.deletions)}
                  </span>
                </span>
              </button>
              <div
                id={panelId}
                className="task-agent-run-accordion__changelog-preview"
                hidden={!fileOpen}
                aria-hidden={!fileOpen || undefined}
              >
                {fileOpen ? (
                  <pre className="task-agent-run-accordion__changelog-diff">
                    {file.preview.map((line, index) => (
                      <span
                        key={`${file.id}:${index}`}
                        className={[
                          "task-agent-run-accordion__changelog-line",
                          `is-${line.type}`,
                        ].join(" ")}
                      >
                        {line.type === "add"
                          ? `+${line.text}`
                          : line.type === "del"
                            ? `-${line.text}`
                            : line.type === "hunk"
                              ? line.text
                              : ` ${line.text}`}
                        {"\n"}
                      </span>
                    ))}
                  </pre>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function newLocalMessage(
  role: "user" | "assistant",
  text: string,
): ChatUiMessage {
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    parts: [{ type: "text", text }],
    status: "done",
    createdAt: new Date().toISOString(),
  };
}

function RecordKindBadge({ kind }: { kind: RecordKind }) {
  return (
    <span
      className={[
        "task-agent-run-accordion__record-badge",
        `is-${kind}`,
      ].join(" ")}
    >
      {kind === "pr" ? "PR" : "Commit"}
    </span>
  );
}

function TaskAgentRunSection({
  title,
  status,
  working = false,
  open,
  onToggle,
  titleEnd,
  headerEnd,
  children,
}: {
  title: string;
  status: TaskStatus;
  working?: boolean;
  open: boolean;
  onToggle: () => void;
  /** Inline chip next to the section title (visible when collapsed). */
  titleEnd?: ReactNode;
  headerEnd?: ReactNode;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <section
      className={[
        "task-agent-run-accordion__section",
        open ? "is-open" : "is-collapsed",
      ].join(" ")}
    >
      <header className="task-agent-run-accordion__header">
        <button
          type="button"
          className="task-agent-run-accordion__header-button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="task-agent-run-accordion__status" aria-hidden="true">
            <TaskStatusIcon
              status={status}
              working={working}
              size={14}
              title={title}
            />
          </span>
          <span className="task-agent-run-accordion__title">{title}</span>
          {titleEnd ? (
            <span className="task-agent-run-accordion__title-end">
              {titleEnd}
            </span>
          ) : null}
          <span
            className="task-agent-run-accordion__chevron"
            aria-hidden="true"
          />
        </button>
        {headerEnd ? (
          <div className="task-agent-run-accordion__header-end">{headerEnd}</div>
        ) : null}
      </header>
      <div
        id={bodyId}
        className="task-agent-run-accordion__body"
        hidden={!open}
        aria-hidden={!open || undefined}
      >
        {open ? children : null}
      </div>
    </section>
  );
}

function formatReviewDurationMs(elapsedMs: number): string {
  const safe = Math.max(0, elapsedMs);
  if (safe < 10_000) {
    return `${(safe / 1000).toFixed(1)}s`;
  }
  return `${Math.round(safe / 1000)}s`;
}

function reviewCheckMetaLabel(
  item: ReviewCheckItem,
  nowMs: number,
): string | null {
  if (item.durationLabel?.trim()) {
    return item.durationLabel.trim();
  }
  if (item.status === "running") {
    const started = item.startedAtMs ?? nowMs;
    return formatReviewDurationMs(nowMs - started);
  }
  switch (item.status) {
    case "pass":
      return null;
    case "fail":
      return "Fail";
    case "pending":
      return null;
  }
}

function ReviewCheckRow({
  item,
  nowMs,
}: {
  item: ReviewCheckItem;
  nowMs: number;
}) {
  const meta = reviewCheckMetaLabel(item, nowMs);
  const isDuration =
    Boolean(item.durationLabel?.trim()) || item.status === "running";
  return (
    <div
      className={[
        "task-agent-run-accordion__review-row",
        `is-${item.status}`,
      ].join(" ")}
    >
      <div className="task-agent-run-accordion__review-title-row">
        <span
          className={[
            "task-agent-run-accordion__review-mark",
            item.status === "running" || item.status === "pending"
              ? "is-status-icon"
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        >
          {item.status === "pass" ? (
            <Check size={12} strokeWidth={2.5} />
          ) : null}
          {item.status === "running" ? (
            <TaskStatusIcon
              status="in_progress"
              working
              size={14}
              title="Running"
            />
          ) : null}
          {item.status === "pending" ? (
            <TaskStatusIcon status="backlog" size={14} title="Backlog" />
          ) : null}
        </span>
        <span className="task-agent-run-accordion__review-label">
          {item.label}
        </span>
        {meta ? (
          <span
            className={[
              "task-agent-run-accordion__review-status",
              isDuration ? "is-duration" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {meta}
          </span>
        ) : null}
      </div>
      {item.detail ? (
        <p className="task-agent-run-accordion__review-detail">{item.detail}</p>
      ) : null}
    </div>
  );
}

function verifyLogMessagesFromChecks(
  checks: readonly TaskAgentRunCheck[] | undefined,
): ChatUiMessage[] {
  if (!checks || checks.length === 0) return [];
  const out: ChatUiMessage[] = [];
  for (const check of checks) {
    const log = check.logText?.trim();
    if (!log) continue;
    out.push({
      id: `verify-log:${check.id}`,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `[${check.status}] ${check.label}\n${log}`,
        },
      ],
      status: "done",
    });
  }
  return out;
}

/**
 * Full-height exclusive accordion for an agent run: Brief → Build →
 * Verify → Record → Ship. Content is driven by the cloud-owned run.
 */
export function TaskAgentRunAccordion({
  active,
  taskId,
  cwd,
  agentName = null,
  assigneeName = null,
  run = null,
  briefMessages: briefMessagesProp,
  onSendBriefMessage,
  onAnswerBriefChoices,
  onAnswerBriefApproval,
  onAnswerBriefForm,
  onAnswerBriefEmailDraft,
  orchestratorError = null,
  recordHeadSha = null,
  onChooseRecordIntent,
}: TaskAgentRunAccordionProps) {
  const logAgentLabel = agentName?.trim() || "agent";
  const logUserLabel = assigneeName?.trim() || "you";
  const recordDone = Boolean(recordHeadSha?.trim());
  const sections = useMemo(
    () =>
      sectionsForPhase(run?.phase ?? null, {
        recordIntent:
          run?.recordIntent === "commit" || run?.recordIntent === "pr"
            ? run.recordIntent
            : null,
        recordDone,
      }),
    [recordDone, run?.phase, run?.recordIntent],
  );
  const phaseSection = run ? phaseToSectionId(run.phase) : "brief";
  const [openSection, setOpenSection] =
    useState<TaskAgentRunSectionId>("brief");
  const [buildMode, setBuildMode] = useState<BuildMode>("live");
  const [verifyMode, setVerifyMode] = useState<VerifyMode>("results");
  const [recordIntentSubmitting, setRecordIntentSubmitting] = useState(false);
  const [briefMessagesLocal, setBriefMessagesLocal] = useState<ChatUiMessage[]>(
    [],
  );
  const briefMessages = briefMessagesProp ?? briefMessagesLocal;
  const reviewChecks = useMemo(
    () => mapRunChecksToReviewItems(run?.checks ?? []),
    [run?.checks],
  );

  const verifyLogMessages = useMemo(
    () => verifyLogMessagesFromChecks(run?.checks),
    [run?.checks],
  );

  useEffect(() => {
    setOpenSection(phaseSection);
  }, [phaseSection, run?.cycle]);
  const [reviewNowMs, setReviewNowMs] = useState(() => Date.now());
  const [openChangelogFileId, setOpenChangelogFileId] = useState<string | null>(
    null,
  );
  const [commitChangelog, setCommitChangelog] =
    useState<ParsedGitCommitChangelog | null>(null);
  const [commitChangelogLoading, setCommitChangelogLoading] = useState(false);
  const [commitChangelogError, setCommitChangelogError] = useState<
    string | null
  >(null);

  const awaitingRecordIntent =
    run?.phase === "record" &&
    run.recordIntent !== "commit" &&
    run.recordIntent !== "pr";

  useEffect(() => {
    const sha = recordHeadSha?.trim() || "";
    if (!active || !sha || !cwd?.trim()) {
      setCommitChangelog(null);
      setCommitChangelogError(null);
      setCommitChangelogLoading(false);
      return;
    }
    let cancelled = false;
    setCommitChangelogLoading(true);
    setCommitChangelogError(null);
    void fetchGitCommitShow(cwd, sha).then((result) => {
      if (cancelled) return;
      setCommitChangelogLoading(false);
      if (!result.ok || !result.payload) {
        setCommitChangelog(null);
        setCommitChangelogError(
          result.error || "Could not load commit file diff",
        );
        return;
      }
      setCommitChangelog(parseGitCommitShow(result.payload));
      setCommitChangelogError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [active, cwd, recordHeadSha]);

  const changelogFiles = commitChangelog?.files ?? [];

  const displayCommitRecord: CommitRecord | null = useMemo(() => {
    if (!run) return null;
    if (awaitingRecordIntent) return null;
    const intent: RecordKind =
      run.recordIntent === "commit"
        ? "commit"
        : run.recordIntent === "pr"
          ? "pr"
          : "commit";
    const sha = recordHeadSha?.trim() || "";
    if (!sha) {
      if (run.phase === "done" || run.phase === "ship") {
        return null;
      }
      return {
        kind: intent,
        shortSha: "—",
        sha: "",
        subject:
          run.phase === "record"
            ? intent === "commit"
              ? "Waiting for Cursor to commit…"
              : "Waiting for Cursor to open the pull request…"
            : "Record not started yet",
        body: run.recordNotes?.trim() || "",
        authorName: "—",
        authoredAtLabel: "—",
        branch: "—",
        additions: 0,
        deletions: 0,
        filesChanged: 0,
        pullRequest: null,
      };
    }
    return {
      kind: intent,
      shortSha: (commitChangelog?.sha || sha).slice(0, 7),
      sha: commitChangelog?.sha || sha,
      subject:
        commitChangelog?.subject?.trim() ||
        run.recordNotes?.trim() ||
        (intent === "pr" ? "Pull request recorded" : "Commit recorded"),
      body: commitChangelog?.body?.trim() || "",
      authorName: commitChangelog?.authorName?.trim() || "cursor-agent",
      authoredAtLabel: formatAuthoredAtLabel(
        commitChangelog?.authoredAt ?? "",
      ),
      branch: "—",
      additions: commitChangelog?.additions ?? 0,
      deletions: commitChangelog?.deletions ?? 0,
      filesChanged: commitChangelog?.files.length ?? 0,
      pullRequest: null,
    };
  }, [awaitingRecordIntent, commitChangelog, recordHeadSha, run]);

  const changelogEmptyLabel = recordHeadSha?.trim()
    ? commitChangelogLoading
      ? "Loading commit file diff…"
      : commitChangelogError || "No file changes in this commit."
    : run?.phase === "record" &&
        (run.recordIntent === "commit" || run.recordIntent === "pr")
      ? "Waiting for the commit so we can show its files…"
      : "No file diff for this run yet.";

  const chooseRecordIntent = async (intent: "commit" | "pr") => {
    if (!onChooseRecordIntent || recordIntentSubmitting) return;
    setRecordIntentSubmitting(true);
    try {
      await onChooseRecordIntent(intent);
    } finally {
      setRecordIntentSubmitting(false);
    }
  };

  const hasRunningReviewCheck = reviewChecks.some(
    (item) => item.status === "running",
  );
  useEffect(() => {
    if (!active || !hasRunningReviewCheck) return;
    const tick = window.setInterval(() => {
      setReviewNowMs(Date.now());
    }, 100);
    return () => window.clearInterval(tick);
  }, [active, hasRunningReviewCheck]);

  const buildTranscript = useTaskAgentBuildTranscript({
    active,
    cwd,
    builderSessionId: run?.builderSessionId,
  });

  const toggleSection = (id: TaskAgentRunSectionId) => {
    setOpenSection((current) => (current === id ? current : id));
  };

  return (
    <div className="task-agent-run-accordion">
      {orchestratorError ? (
        <p className="task-agent-run-accordion__process-sync-error" role="status">
          {orchestratorError}
        </p>
      ) : null}
      {sections.map((section) => {
        const open = openSection === section.id;

        return (
          <TaskAgentRunSection
            key={section.id}
            title={section.title}
            status={section.status}
            working={section.working}
            open={open}
            onToggle={() => toggleSection(section.id)}
            titleEnd={
              section.id === "record" && displayCommitRecord ? (
                <RecordKindBadge kind={displayCommitRecord.kind} />
              ) : null
            }
          >
            {section.id === "brief" ? (
              <div className="task-agent-run-accordion__chat">
                <ChatThread
                  messages={briefMessages}
                  placeholder="Message the conductor…"
                  emptyState="Waiting for the conductor Brief…"
                  onSend={(text) => {
                    const trimmed = text.trim();
                    if (!trimmed) return;
                    if (onSendBriefMessage) {
                      onSendBriefMessage(trimmed);
                      return;
                    }
                    setBriefMessagesLocal((prev) => [
                      ...prev,
                      newLocalMessage("user", trimmed),
                    ]);
                  }}
                  onAnswerChoices={onAnswerBriefChoices ?? null}
                  onAnswerApproval={onAnswerBriefApproval ?? null}
                  onAnswerForm={onAnswerBriefForm ?? null}
                  onAnswerEmailDraft={onAnswerBriefEmailDraft ?? null}
                />
              </div>
            ) : null}

            {section.id === "build" ? (
              <div className="task-agent-run-accordion__process">
                <div className="task-agent-run-accordion__process-body">
                  {buildMode === "log" ? (
                    <div className="task-agent-run-accordion__terminal">
                      <TaskShellTerminal
                        active={active && open}
                        taskId={taskId}
                        cwd={cwd}
                        staticSyncMessages={buildTranscript.messages}
                        agentLabel={logAgentLabel}
                        userLabel={logUserLabel}
                      />
                      {buildTranscript.error ? (
                        <p
                          className="task-agent-run-accordion__process-sync-error"
                          role="status"
                        >
                          {buildTranscript.error}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {buildMode === "live" ? (
                    <div className="task-agent-run-accordion__process-ui">
                      <div className="task-agent-run-accordion__chat">
                        <ChatThread
                          messages={buildTranscript.messages}
                          emptyState={
                            buildTranscript.error ||
                            "Waiting for the Cursor ACP build session…"
                          }
                        />
                      </div>
                      {buildTranscript.error ? (
                        <p
                          className="task-agent-run-accordion__process-sync-error"
                          role="status"
                        >
                          {buildTranscript.error}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {buildMode === "diff" ? (
                    <ChangelogDiffPanel
                      files={changelogFiles}
                      openFileId={openChangelogFileId}
                      onOpenFileIdChange={setOpenChangelogFileId}
                      emptyLabel={changelogEmptyLabel}
                    />
                  ) : null}
                </div>
                <div className="task-agent-run-accordion__process-footer">
                  <SegmentedPillToggle
                    value={buildMode}
                    options={BUILD_MODE_OPTIONS}
                    onChange={setBuildMode}
                    ariaLabel="Live, Diff, or Log"
                  />
                </div>
              </div>
            ) : null}

            {section.id === "verify" ? (
              <div className="task-agent-run-accordion__review">
                <div className="task-agent-run-accordion__review-body">
                  {verifyMode === "results" ? (
                    <div className="task-agent-run-accordion__review-results">
                      {reviewChecks.length === 0 ? (
                        <p
                          className="task-agent-run-accordion__process-sync-error"
                          role="status"
                        >
                          Waiting for the conductor to create verify checks…
                        </p>
                      ) : (
                        <ul className="task-agent-run-accordion__review-list">
                          {reviewChecks.map((item) => (
                            <li key={item.id}>
                              <ReviewCheckRow
                                item={item}
                                nowMs={reviewNowMs}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div className="task-agent-run-accordion__terminal">
                      <TaskShellTerminal
                        active={active && open}
                        taskId={`${taskId}:verify`}
                        cwd={cwd}
                        staticSyncMessages={verifyLogMessages}
                        agentLabel={logAgentLabel}
                        userLabel={logUserLabel}
                      />
                      {verifyLogMessages.length === 0 ? (
                        <p
                          className="task-agent-run-accordion__process-sync-error"
                          role="status"
                        >
                          {run
                            ? "No verify check logs yet."
                            : "Waiting for verify checks…"}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="task-agent-run-accordion__review-footer">
                  <SegmentedPillToggle
                    value={verifyMode}
                    options={VERIFY_MODE_OPTIONS}
                    onChange={setVerifyMode}
                    ariaLabel="Results or Log"
                  />
                </div>
              </div>
            ) : null}

            {section.id === "record" ? (
              <div className="task-agent-run-accordion__commit">
                {awaitingRecordIntent ? (
                  <div
                    className="task-agents-panel task-agent-run-accordion__record-choice"
                    role="group"
                    aria-label="Commit or pull request"
                  >
                    <header className="task-agents-panel__header">
                      <h3 className="task-agents-panel__title">
                        How should this work be recorded?
                      </h3>
                    </header>
                    <ul className="task-agents-panel__list">
                      <li>
                        <button
                          type="button"
                          className="task-agents-panel__card"
                          aria-label="Commit and push on the current branch"
                          disabled={
                            recordIntentSubmitting || !onChooseRecordIntent
                          }
                          onClick={() => {
                            void chooseRecordIntent("commit");
                          }}
                        >
                          <div className="task-agents-panel__avatar">
                            <span
                              className="task-agent-run-accordion__record-choice-icon"
                              aria-hidden="true"
                            >
                              <svg
                                width="24"
                                height="24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                viewBox="0 0 24 24"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-9-3h6m6 0h6" />
                              </svg>
                            </span>
                          </div>
                          <div className="task-agents-panel__meta">
                            <span className="task-agents-panel__name">
                              Commit
                            </span>
                            <span className="task-agents-panel__role">
                              Commit and push on the current branch
                            </span>
                          </div>
                          <span
                            className="task-agents-panel__start"
                            aria-hidden="true"
                          >
                            Continue
                          </span>
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className="task-agents-panel__card"
                          aria-label="Commit, push, and open a pull request"
                          disabled={
                            recordIntentSubmitting || !onChooseRecordIntent
                          }
                          onClick={() => {
                            void chooseRecordIntent("pr");
                          }}
                        >
                          <div className="task-agents-panel__avatar">
                            <span
                              className="task-agent-run-accordion__record-choice-icon"
                              aria-hidden="true"
                            >
                              <svg
                                width="24"
                                height="24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                viewBox="0 0 24 24"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6m12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 9v12m12-6V7.5a2 2 0 0 0-2-2h-2.5" />
                                <path d="M14.5 8 12 5.5 14.5 3" />
                              </svg>
                            </span>
                          </div>
                          <div className="task-agents-panel__meta">
                            <span className="task-agents-panel__name">
                              Pull request
                            </span>
                            <span className="task-agents-panel__role">
                              Commit, push, and open a PR for review
                            </span>
                          </div>
                          <span
                            className="task-agents-panel__start"
                            aria-hidden="true"
                          >
                            Continue
                          </span>
                        </button>
                      </li>
                    </ul>
                  </div>
                ) : !displayCommitRecord ? (
                  <p className="task-agent-run-accordion__commit-empty">
                    {run?.phase === "done" || run?.phase === "ship"
                      ? commitChangelogLoading
                        ? "Loading recorded commit…"
                        : "No recorded commit found for this run yet."
                      : "Waiting for Verify to finish before Record…"}
                  </p>
                ) : (
                  <>
                    {run?.recordIntent === "pr" && !recordHeadSha ? (
                      <p className="task-agent-run-accordion__commit-empty">
                        Waiting for Cursor to open the pull request…
                      </p>
                    ) : null}
                    {run?.recordNotes ? (
                      <p className="task-agent-run-accordion__commit-body">
                        {run.recordNotes}
                      </p>
                    ) : null}
                    <article className="task-agent-run-accordion__commit-card">
                      <header className="task-agent-run-accordion__commit-header">
                        <code
                          className="task-agent-run-accordion__commit-sha"
                          title={displayCommitRecord.sha || undefined}
                        >
                          {displayCommitRecord.shortSha}
                        </code>
                        <span className="task-agent-run-accordion__commit-branch">
                          {displayCommitRecord.branch}
                        </span>
                      </header>
                      <h3 className="task-agent-run-accordion__commit-subject">
                        {displayCommitRecord.subject}
                      </h3>
                      {displayCommitRecord.body ? (
                        <p className="task-agent-run-accordion__commit-body">
                          {displayCommitRecord.body}
                        </p>
                      ) : null}
                      {recordHeadSha ? (
                        <dl className="task-agent-run-accordion__commit-meta">
                          <div>
                            <dt>Author</dt>
                            <dd>{displayCommitRecord.authorName}</dd>
                          </div>
                          <div>
                            <dt>When</dt>
                            <dd>{displayCommitRecord.authoredAtLabel}</dd>
                          </div>
                          {displayCommitRecord.filesChanged > 0 ? (
                            <div>
                              <dt>Files</dt>
                              <dd>
                                {displayCommitRecord.filesChanged} · +
                                {displayCommitRecord.additions} −
                                {displayCommitRecord.deletions}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : null}
                    </article>
                    <ChangelogDiffPanel
                      files={changelogFiles}
                      openFileId={openChangelogFileId}
                      onOpenFileIdChange={setOpenChangelogFileId}
                      emptyLabel={changelogEmptyLabel}
                    />
                  </>
                )}
              </div>
            ) : null}

            {section.id === "ship" ? (
              <div className="task-agent-run-accordion__commit">
                <p
                  className="task-agent-run-accordion__commit-empty"
                  role="status"
                >
                  {run?.phase === "done"
                    ? "Run completed."
                    : run?.phase === "ship"
                      ? "Ship is waiting — deploy automation is not wired yet."
                      : run?.phase === "failed"
                        ? run.lastError?.trim() || "Run failed."
                        : "Ship starts after Record completes."}
                </p>
                {displayCommitRecord?.sha ? (
                  <>
                    <article className="task-agent-run-accordion__commit-card">
                      <header className="task-agent-run-accordion__commit-header">
                        <code
                          className="task-agent-run-accordion__commit-sha"
                          title={displayCommitRecord.sha}
                        >
                          {displayCommitRecord.shortSha}
                        </code>
                        <RecordKindBadge kind={displayCommitRecord.kind} />
                      </header>
                      <h3 className="task-agent-run-accordion__commit-subject">
                        {displayCommitRecord.subject}
                      </h3>
                      <dl className="task-agent-run-accordion__commit-meta">
                        <div>
                          <dt>Author</dt>
                          <dd>{displayCommitRecord.authorName}</dd>
                        </div>
                        <div>
                          <dt>When</dt>
                          <dd>{displayCommitRecord.authoredAtLabel}</dd>
                        </div>
                        {displayCommitRecord.filesChanged > 0 ? (
                          <div>
                            <dt>Files</dt>
                            <dd>
                              {displayCommitRecord.filesChanged} · +
                              {displayCommitRecord.additions} −
                              {displayCommitRecord.deletions}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </article>
                    <ChangelogDiffPanel
                      files={changelogFiles}
                      openFileId={openChangelogFileId}
                      onOpenFileIdChange={setOpenChangelogFileId}
                      emptyLabel={changelogEmptyLabel}
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </TaskAgentRunSection>
        );
      })}
    </div>
  );
}
