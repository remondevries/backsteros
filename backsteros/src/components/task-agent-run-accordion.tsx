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

/** Agent turn file changes — same shape as T3 DiffStatLabel rows. */
type ChangelogFileKind = "added" | "modified" | "deleted" | "renamed";

type ChangelogDiffLine = {
  type: "add" | "del" | "ctx" | "hunk";
  text: string;
};

type ChangelogFileItem = {
  id: string;
  path: string;
  kind: ChangelogFileKind;
  additions: number;
  deletions: number;
  /** Scaffolded unified-diff preview lines for the nested accordion body. */
  preview: readonly ChangelogDiffLine[];
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

function sectionsForPhase(phase: TaskAgentRunPhase | null): readonly {
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

function ChangelogDiffPanel({
  files,
  openFileId,
  onOpenFileIdChange,
}: {
  files: readonly ChangelogFileItem[];
  openFileId: string | null;
  onOpenFileIdChange: (id: string | null) => void;
}) {
  const totalAdditions = files.reduce((n, f) => n + f.additions, 0);
  const totalDeletions = files.reduce((n, f) => n + f.deletions, 0);

  if (files.length === 0) {
    return (
      <p className="task-agent-run-accordion__commit-empty" role="status">
        No file diff for this run yet.
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
}: TaskAgentRunAccordionProps) {
  const logAgentLabel = agentName?.trim() || "agent";
  const logUserLabel = assigneeName?.trim() || "you";
  const sections = useMemo(
    () => sectionsForPhase(run?.phase ?? null),
    [run?.phase],
  );
  const phaseSection = run ? phaseToSectionId(run.phase) : "brief";
  const [openSection, setOpenSection] =
    useState<TaskAgentRunSectionId>("brief");
  const [buildMode, setBuildMode] = useState<BuildMode>("live");
  const [verifyMode, setVerifyMode] = useState<VerifyMode>("results");
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
  const changelogFiles: readonly ChangelogFileItem[] = [];
  const displayCommitRecord: CommitRecord | null = useMemo(() => {
    if (!run) return null;
    const intent: RecordKind =
      run.recordIntent === "commit"
        ? "commit"
        : run.recordIntent === "pr"
          ? "pr"
          : "pr";
    const sha = recordHeadSha?.trim() || "";
    if (!sha) {
      return {
        kind: intent,
        shortSha: "—",
        sha: "",
        subject:
          run.phase === "record"
            ? run.recordIntent === "commit"
              ? "Waiting for Cursor to commit…"
              : run.recordIntent === "pr"
                ? "Waiting for Cursor to open the pull request…"
                : "Waiting for record intent from the conductor…"
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
      shortSha: sha.slice(0, 7),
      sha,
      subject:
        run.recordNotes?.trim() ||
        (intent === "pr" ? "Pull request recorded" : "Commit recorded"),
      body: "",
      authorName: "cursor-agent",
      authoredAtLabel: "Just now",
      branch: "—",
      additions: 0,
      deletions: 0,
      filesChanged: 0,
      pullRequest: null,
    };
  }, [recordHeadSha, run]);

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
                {!displayCommitRecord ? (
                  <p className="task-agent-run-accordion__commit-empty">
                    Waiting for the conductor to enter Record…
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
                        </dl>
                      ) : null}
                    </article>
                    <ChangelogDiffPanel
                      files={changelogFiles}
                      openFileId={openChangelogFileId}
                      onOpenFileIdChange={setOpenChangelogFileId}
                    />
                  </>
                )}
              </div>
            ) : null}

            {section.id === "ship" ? (
              <div className="task-agent-run-accordion__review">
                <div className="task-agent-run-accordion__review-body">
                  <p
                    className="task-agent-run-accordion__process-sync-error"
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
                </div>
              </div>
            ) : null}
          </TaskAgentRunSection>
        );
      })}
    </div>
  );
}
