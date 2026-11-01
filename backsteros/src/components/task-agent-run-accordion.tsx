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

type DeploymentItem = {
  id: string;
  label: string;
  done: boolean;
  durationLabel?: string | null;
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

function mapRunCheckToReviewItem(check: TaskAgentRunCheck): ReviewCheckItem {
  const status: ReviewCheckStatus =
    check.status === "pass"
      ? "pass"
      : check.status === "fail"
        ? "fail"
        : check.status === "running"
          ? "running"
          : "pending";
  return {
    id: check.id,
    label: check.label,
    status,
    detail: check.detail?.trim() || check.logText?.trim() || "",
    durationLabel: null,
    startedAtMs:
      check.status === "running" && check.startedAt
        ? Date.parse(check.startedAt)
        : null,
  };
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

/** Scaffold: git receipt after Build/Verify (PR or commit-only). */
const INITIAL_COMMIT_RECORD: CommitRecord = {
  kind: "pr",
  shortSha: "a1b2c3d",
  sha: "a1b2c3d4e5f678901234567890abcdef12345678",
  subject: "Wire agent run factory: brief → build → verify → record → ship",
  body: "Git-first agent run accordion with Diff inside Build, Verify gates, polymorphic Record (PR or commit), and optional Ship.",
  authorName: "cursor-agent",
  authoredAtLabel: "Just now",
  branch: "production",
  additions: 800,
  deletions: 76,
  filesChanged: 5,
  pullRequest: {
    number: 482,
    title: "Agent run factory: brief, build, verify, record, ship",
    state: "open",
    urlLabel: "backsteros#482",
  },
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

const INITIAL_REVIEW_CHECKS: readonly ReviewCheckItem[] = [
  {
    id: "typecheck",
    label: "Typecheck",
    status: "pass",
    detail: "pnpm typecheck completed with no errors.",
    durationLabel: "12.4s",
  },
  {
    id: "lint",
    label: "Lint",
    status: "pass",
    detail: "pnpm lint passed.",
    durationLabel: "3.1s",
  },
  {
    id: "unit",
    label: "Unit tests",
    status: "running",
    detail: "pnpm test is still running…",
  },
  {
    id: "integration",
    label: "Integration tests",
    status: "pending",
    detail: "Waiting for unit tests to finish.",
  },
  {
    id: "diff",
    label: "Diff review",
    status: "pending",
    detail: "Review agent will inspect the change set next.",
  },
];

const INITIAL_DEPLOYMENT: readonly DeploymentItem[] = [
  {
    id: "build",
    label: "Build production assets",
    done: true,
    durationLabel: "48s",
  },
  {
    id: "migrate",
    label: "Run database migrations",
    done: true,
    durationLabel: "2.1s",
  },
  { id: "health", label: "Pass health checks", done: false },
  { id: "publish", label: "Publish release", done: false },
  { id: "notify", label: "Notify project channel", done: false },
];

/** Scaffold file list inspired by backsterdev DiffPanel / DiffStatLabel. */
const INITIAL_CHANGELOG_FILES: readonly ChangelogFileItem[] = [
  {
    id: "1",
    path: "backsteros/src/components/task-agent-run-accordion.tsx",
    kind: "modified",
    additions: 186,
    deletions: 42,
    preview: [
      { type: "hunk", text: "@@ -48,7 +48,12 @@" },
      { type: "del", text: "  { id: \"setup\", title: \"Setup\", status: \"ready_to_start\" }," },
      { type: "del", text: "  { id: \"process\", title: \"Process\", status: \"in_progress\" }," },
      { type: "del", text: "  { id: \"review\", title: \"Review\", status: \"in_review\" }," },
      { type: "add", text: "  { id: \"brief\", title: \"Brief\", status: \"ready_to_start\" }," },
      { type: "add", text: "  { id: \"build\", title: \"Build\", status: \"in_progress\" }," },
      { type: "add", text: "  { id: \"verify\", title: \"Verify\", status: \"in_review\" }," },
      { type: "add", text: "  { id: \"record\", title: \"Record\", status: \"completed\" }," },
      { type: "add", text: "  { id: \"ship\", title: \"Ship\", status: \"waiting\" }," },
      { type: "ctx", text: "];" },
    ],
  },
  {
    id: "2",
    path: "backsteros/src/styles/task-agent-layout.css",
    kind: "modified",
    additions: 120,
    deletions: 18,
    preview: [
      { type: "hunk", text: "@@ -470,6 +470,40 @@" },
      { type: "ctx", text: ".task-agent-run-accordion__process-footer {" },
      { type: "add", text: "  justify-content: flex-end;" },
      { type: "ctx", text: "}" },
      { type: "add", text: "" },
      { type: "add", text: ".task-agent-run-accordion__changelog-row {" },
      { type: "add", text: "  display: flex;" },
      { type: "add", text: "  align-items: center;" },
      { type: "add", text: "}" },
    ],
  },
  {
    id: "3",
    path: "backsteros/src/lib/cursor-agent-transcript.ts",
    kind: "added",
    additions: 210,
    deletions: 0,
    preview: [
      { type: "hunk", text: "@@ -0,0 +1,24 @@" },
      { type: "add", text: "export async function fetchCursorAgentTranscript(options: {" },
      { type: "add", text: "  cwd?: string | null;" },
      { type: "add", text: "  conversationId?: string | null;" },
      { type: "add", text: "}): Promise<CursorAgentTranscriptResult> {" },
      { type: "add", text: "  const originResult = getCursorTranscriptHttpOrigin();" },
      { type: "add", text: "  // …" },
      { type: "add", text: "}" },
    ],
  },
  {
    id: "4",
    path: "backsteros/scripts/cursor-agent-transcript.mjs",
    kind: "added",
    additions: 260,
    deletions: 0,
    preview: [
      { type: "hunk", text: "@@ -0,0 +1,18 @@" },
      { type: "add", text: "export function loadCursorAgentTranscript(options = {}) {" },
      { type: "add", text: "  const found = findCursorAgentTranscript(options);" },
      { type: "add", text: "  if (!found) {" },
      { type: "add", text: "    return { ok: false, messages: [] };" },
      { type: "add", text: "  }" },
      { type: "add", text: "  return { ok: true, messages: readCursorAgentTranscriptMessages(found.path) };" },
      { type: "add", text: "}" },
    ],
  },
  {
    id: "5",
    path: "backsteros/packages/ui/src/components/chat/chat-thread.tsx",
    kind: "modified",
    additions: 24,
    deletions: 16,
    preview: [
      { type: "hunk", text: "@@ -770,20 +770,28 @@" },
      { type: "del", text: "      <div className=\"chat-ui-composer__row\">" },
      { type: "del", text: "        <label className=\"chat-ui-composer__attach\">+</label>" },
      { type: "add", text: "      <div className=\"chat-ui-composer__row\">" },
      { type: "add", text: "        <div className=\"chat-ui-composer__input-wrap\">…</div>" },
      { type: "add", text: "      </div>" },
      { type: "add", text: "      <div className=\"chat-ui-composer__tools\">" },
      { type: "add", text: "        <label className=\"chat-ui-composer__attach\">+</label>" },
      { type: "ctx", text: "        <ComposerPrimitive.Send>↑</ComposerPrimitive.Send>" },
    ],
  },
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
            <TaskStatusIcon status="backlog" size={14} title="Pending" />
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
 * Verify → Record → Ship. Design scaffold after fake kickoff.
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
    () => [
      newLocalMessage(
        "assistant",
        "Share constraints and preferences for this task before we start the build.",
      ),
    ],
  );
  const briefMessages = briefMessagesProp ?? briefMessagesLocal;
  const reviewChecks = useMemo(() => {
    if (run) {
      return (run.checks ?? []).map(mapRunCheckToReviewItem);
    }
    return INITIAL_REVIEW_CHECKS.map((item) =>
      item.status === "running" && item.startedAtMs == null
        ? { ...item, startedAtMs: Date.now() }
        : { ...item },
    );
  }, [run]);

  const verifyLogMessages = useMemo(
    () => verifyLogMessagesFromChecks(run?.checks),
    [run?.checks],
  );

  useEffect(() => {
    setOpenSection(phaseSection);
  }, [phaseSection, run?.cycle]);
  const [reviewNowMs, setReviewNowMs] = useState(() => Date.now());
  const [deployment, setDeployment] = useState<DeploymentItem[]>(() => [
    ...INITIAL_DEPLOYMENT,
  ]);
  const [changelogFiles] = useState<ChangelogFileItem[]>(() => [
    ...INITIAL_CHANGELOG_FILES,
  ]);
  const [openChangelogFileId, setOpenChangelogFileId] = useState<string | null>(
    null,
  );
  const [commitRecord] = useState<CommitRecord>(() => ({
    ...INITIAL_COMMIT_RECORD,
  }));
  const displayCommitRecord: CommitRecord = useMemo(() => {
    if (!run) return commitRecord;
    const sha = recordHeadSha?.trim() || "";
    const shortSha = sha ? sha.slice(0, 7) : "———————";
    const intent: RecordKind =
      run.recordIntent === "commit" ? "commit" : "pr";
    if (!sha) {
      return {
        ...commitRecord,
        kind: intent,
        shortSha,
        sha: "",
        subject:
          intent === "pr"
            ? "Waiting for Cursor to open the pull request…"
            : "Waiting for Cursor to commit…",
        body: run.recordNotes?.trim() || "",
        authorName: "cursor-agent",
        authoredAtLabel: "Pending",
        branch: "—",
        additions: 0,
        deletions: 0,
        filesChanged: 0,
        pullRequest: null,
      };
    }
    return {
      ...commitRecord,
      kind: intent,
      shortSha,
      sha,
      subject:
        run.recordNotes?.trim() ||
        (intent === "pr" ? "Pull request recorded" : "Commit recorded"),
      body: "",
      authorName: "cursor-agent",
      authoredAtLabel: "Just now",
      pullRequest:
        intent === "pr"
          ? {
              number: 0,
              title: run.recordNotes?.trim() || "Pull request",
              state: "open",
              urlLabel: "PR pending URL",
            }
          : null,
    };
  }, [commitRecord, recordHeadSha, run]);

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

  const toggleDeploymentItem = (id: string) => {
    setDeployment((items) =>
      items.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    );
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
              section.id === "record" ? (
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
                {displayCommitRecord.kind === "pr" &&
                displayCommitRecord.pullRequest ? (
                  <article
                    className={[
                      "task-agent-run-accordion__commit-pr",
                      `is-${displayCommitRecord.pullRequest.state}`,
                    ].join(" ")}
                  >
                    <div className="task-agent-run-accordion__commit-pr-top">
                      <span className="task-agent-run-accordion__commit-pr-id">
                        {displayCommitRecord.pullRequest.urlLabel}
                      </span>
                      <span className="task-agent-run-accordion__commit-pr-state">
                        {displayCommitRecord.pullRequest.state}
                      </span>
                    </div>
                    <p className="task-agent-run-accordion__commit-pr-title">
                      {displayCommitRecord.pullRequest.title}
                    </p>
                  </article>
                ) : null}
                {displayCommitRecord.kind === "pr" &&
                !displayCommitRecord.pullRequest ? (
                  <p className="task-agent-run-accordion__commit-empty">
                    {run?.recordIntent === "pr"
                      ? "Waiting for Cursor to open the pull request…"
                      : "No pull request linked yet."}
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
                      title={displayCommitRecord.sha}
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
                  <dl className="task-agent-run-accordion__commit-meta">
                    <div>
                      <dt>Author</dt>
                      <dd>{displayCommitRecord.authorName}</dd>
                    </div>
                    <div>
                      <dt>When</dt>
                      <dd>{displayCommitRecord.authoredAtLabel}</dd>
                    </div>
                    <div>
                      <dt>Changes</dt>
                      <dd>
                        <span className="task-agent-run-accordion__changelog-stat">
                          <span className="is-add">
                            +
                            {formatCompactDiffCount(
                              displayCommitRecord.additions,
                            )}
                          </span>
                          <span className="is-del">
                            −
                            {formatCompactDiffCount(
                              displayCommitRecord.deletions,
                            )}
                          </span>
                        </span>
                        <span className="task-agent-run-accordion__commit-files">
                          · {displayCommitRecord.filesChanged} files
                        </span>
                      </dd>
                    </div>
                  </dl>
                </article>
                <ChangelogDiffPanel
                  files={changelogFiles}
                  openFileId={openChangelogFileId}
                  onOpenFileIdChange={setOpenChangelogFileId}
                />
              </div>
            ) : null}

            {section.id === "ship" ? (
              <div className="task-agent-run-accordion__review">
                <div className="task-agent-run-accordion__review-body">
                  <div className="task-agent-run-accordion__review-results">
                    <ul className="task-agent-run-accordion__review-list">
                      {deployment.map((item) => {
                        const status: ReviewCheckStatus = item.done
                          ? "pass"
                          : "pending";
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="task-agent-run-accordion__review-row-button"
                              aria-pressed={item.done}
                              onClick={() => toggleDeploymentItem(item.id)}
                            >
                              <ReviewCheckRow
                                item={{
                                  id: item.id,
                                  label: item.label,
                                  status,
                                  detail: item.done
                                    ? "Completed."
                                    : "Waiting to run.",
                                  durationLabel: item.done
                                    ? item.durationLabel
                                    : null,
                                }}
                                nowMs={reviewNowMs}
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}
          </TaskAgentRunSection>
        );
      })}
    </div>
  );
}
