"use client";

import type { GithubCommit } from "@backsteros/contracts";
import { XIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { ProjectsSidePanelIcon } from "./projects-side-panel-icon.js";
import { CommitDetailPane } from "./commit-detail-pane.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./project-fs-types.js";

const MAX_LINKED_COMMITS = 20;
const MAX_PICKER_RESULTS = 40;

function commitSubject(message: string): string {
  const line = message.split("\n")[0]?.trim() ?? "";
  return line || "(no message)";
}

function normalizeShaInput(raw: string): string | null {
  const sha = raw.trim();
  if (!/^[0-9a-fA-F]{7,64}$/.test(sha)) return null;
  return sha;
}

function shortSha(sha: string): string {
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

function normalizeShaList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const sha = entry.trim();
    if (!/^[0-9a-fA-F]{7,64}$/.test(sha)) continue;
    const key = sha.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sha);
  }
  return out;
}

function commitMatchesQuery(commit: GithubCommit, query: string): boolean {
  if (!query) return true;
  const haystack = [
    commit.sha,
    commit.shortSha,
    commit.message,
    commit.authorName ?? "",
    commit.authorLogin ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(query);
}

function formatCommitAuthoredAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export type TaskLinkedCommitSectionProps = {
  projectId: string;
  /** Default branch hint for the commit list (optional). */
  defaultBranch?: string | null;
  linkedCommitShas: string[];
  /** Which linked commit’s diff is shown (controlled). */
  activeSha?: string | null;
  onActiveShaChange?: (sha: string | null) => void;
  requestJson: CodebaseRequestJson;
  /** Append a commit (caller dedupes / persists full list). */
  onLinkCommit: (sha: string) => void | Promise<void>;
  /** Remove one linked commit. */
  onUnlinkCommit: (sha: string) => void | Promise<void>;
  linking?: boolean;
  /** Collapse the Changes rail (same control the agent panel used). */
  onHidePanel?: () => void;
  /**
   * Bump to open the repo commit picker (e.g. collapsed-strip + or chip +).
   * Ignored when already at the link cap.
   */
  openPickerRequest?: number;
};

/**
 * Link GitHub commits to a codebase task and render file diffs for the active
 * commit (same CommitDetailPane as the project workbench).
 */
export function TaskLinkedCommitSection({
  projectId,
  defaultBranch = null,
  linkedCommitShas,
  activeSha: activeShaProp = null,
  onActiveShaChange,
  requestJson,
  onLinkCommit,
  onUnlinkCommit,
  linking = false,
  onHidePanel,
  openPickerRequest = 0,
}: TaskLinkedCommitSectionProps) {
  const shas = normalizeShaList(linkedCommitShas);
  const canAddMore = shas.length < MAX_LINKED_COMMITS;
  const [picking, setPicking] = useState(false);
  const [commits, setCommits] = useState<GithubCommit[]>([]);
  const [resolvedBranch, setResolvedBranch] = useState<string | null>(
    defaultBranch?.trim() || null,
  );
  const resolvedBranchRef = useRef(defaultBranch?.trim() || null);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [commit, setCommit] = useState<GithubCommit | null>(null);
  const [repository, setRepository] = useState("");
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    const next = defaultBranch?.trim() || null;
    if (!next) return;
    resolvedBranchRef.current = next;
    setResolvedBranch(next);
  }, [defaultBranch]);

  const activeSha =
    (activeShaProp &&
    shas.some((sha) => sha.toLowerCase() === activeShaProp.toLowerCase())
      ? shas.find((sha) => sha.toLowerCase() === activeShaProp.toLowerCase())
      : null) ??
    shas[shas.length - 1] ??
    null;

  useEffect(() => {
    if (!onActiveShaChange) return;
    if (activeSha === (activeShaProp ?? null)) return;
    onActiveShaChange(activeSha);
  }, [activeSha, activeShaProp, onActiveShaChange]);

  const closePicker = useCallback(() => {
    setPicking(false);
    setSearchQuery("");
    setFormError(null);
  }, []);

  const openPicker = useCallback(() => {
    if (!canAddMore) return;
    setSearchQuery("");
    setFormError(null);
    setPicking(true);
  }, [canAddMore]);

  useEffect(() => {
    if (!openPickerRequest || !canAddMore) return;
    openPicker();
  }, [canAddMore, openPicker, openPickerRequest]);

  useEffect(() => {
    if (!picking) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closePicker();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [closePicker, picking]);

  useEffect(() => {
    if (!activeSha) {
      setCommit(null);
      setRepository("");
      setCommitError(null);
      setCommitLoading(false);
      return;
    }
    let cancelled = false;
    setCommitLoading(true);
    setCommitError(null);
    void requestJson<{
      commit: GithubCommit;
      repository?: string;
    }>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/github/commits/${encodeURIComponent(activeSha)}`,
    )
      .then((body) => {
        if (cancelled) return;
        setCommit(body.commit);
        setRepository(body.repository ?? "");
      })
      .catch((error) => {
        if (cancelled) return;
        setCommit(null);
        setCommitError(apiErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setCommitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSha, projectId, requestJson]);

  const loadRecentCommits = useCallback(async () => {
    setCommitsLoading(true);
    setCommitsError(null);
    try {
      let branch = defaultBranch?.trim() || resolvedBranchRef.current || "";
      if (!branch) {
        const branchesBody = await requestJson<{
          defaultBranch?: string | null;
          branches?: Array<{ name: string }>;
        }>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/github/branches`,
        );
        branch =
          branchesBody.defaultBranch?.trim() ||
          branchesBody.branches?.[0]?.name?.trim() ||
          "";
      }
      if (!branch) {
        setCommits([]);
        setCommitsError(
          "Could not resolve a default branch for this repository.",
        );
        return;
      }

      const query = new URLSearchParams({
        page: "1",
        branch,
      });
      const body = await requestJson<{ commits: GithubCommit[] }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/github/commits?${query.toString()}`,
      );
      setCommits(Array.isArray(body.commits) ? body.commits : []);
      resolvedBranchRef.current = branch;
      setResolvedBranch(branch);
    } catch (error) {
      setCommits([]);
      setCommitsError(apiErrorMessage(error));
    } finally {
      setCommitsLoading(false);
    }
  }, [defaultBranch, projectId, requestJson]);

  useEffect(() => {
    if (!picking) return;
    void loadRecentCommits();
  }, [loadRecentCommits, picking]);

  const linkedAlready = useCallback(
    (sha: string) =>
      shas.some((entry) => entry.toLowerCase() === sha.toLowerCase()),
    [shas],
  );

  const linkCommit = useCallback(
    async (sha: string) => {
      if (linkedAlready(sha)) {
        setFormError("This commit is already linked.");
        return;
      }
      setFormError(null);
      await onLinkCommit(sha);
      onActiveShaChange?.(sha);
      closePicker();
    },
    [closePicker, linkedAlready, onActiveShaChange, onLinkCommit],
  );

  const query = searchQuery.trim().toLowerCase();
  const filteredCommits = useMemo(() => {
    return commits
      .filter((entry) => commitMatchesQuery(entry, query))
      .slice(0, MAX_PICKER_RESULTS);
  }, [commits, query]);

  const shaFromQuery = normalizeShaInput(searchQuery);
  const showLinkBySha =
    Boolean(shaFromQuery) &&
    !filteredCommits.some(
      (entry) =>
        entry.sha.toLowerCase() === shaFromQuery!.toLowerCase() ||
        entry.shortSha.toLowerCase() === shaFromQuery!.toLowerCase(),
    );

  const panelHideButton = onHidePanel ? (
    <button
      type="button"
      className="desktop-agent-surface-tab desktop-agent-surface-tab--icon task-linked-commit__hide"
      onClick={onHidePanel}
      title="Hide changes (])"
      aria-label="Hide changes"
    >
      <ProjectsSidePanelIcon size={16} collapsed={false} rail="end" />
    </button>
  ) : null;

  const branchLabel = (defaultBranch?.trim() || resolvedBranch)?.trim() || null;

  return (
    <section
      className="task-linked-commit"
      aria-label="Linked commit changes"
    >
      <div className="task-linked-commit__toolbar">
        {shas.length > 0 || canAddMore ? (
          <div
            className="task-linked-commit__sha-chips"
            role="tablist"
            aria-label="Linked commits"
          >
            {shas.map((sha) => {
              const selected =
                activeSha != null &&
                sha.toLowerCase() === activeSha.toLowerCase();
              return (
                <div
                  key={sha}
                  className={[
                    "task-linked-commit__sha-chip",
                    selected ? "is-selected" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    type="button"
                    className="task-linked-commit__sha-chip-remove"
                    title={`Unlink ${shortSha(sha)}`}
                    aria-label={`Unlink commit ${shortSha(sha)}`}
                    disabled={linking}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void onUnlinkCommit(sha);
                    }}
                  >
                    <XIcon size={10} />
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className="task-linked-commit__sha-chip-select"
                    title={sha}
                    onClick={() => onActiveShaChange?.(sha)}
                  >
                    <code>{shortSha(sha)}</code>
                  </button>
                </div>
              );
            })}
            {canAddMore ? (
              <button
                type="button"
                className="task-linked-commit__sha-chip task-linked-commit__sha-chip--add"
                title="Link another commit"
                aria-label="Link another commit"
                disabled={linking}
                onClick={openPicker}
              >
                <span aria-hidden="true">+</span>
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="task-linked-commit__toolbar-actions">
          {panelHideButton}
        </div>
      </div>

      {shas.length === 0 ? (
        <p className="task-linked-commit__hint">
          Link a GitHub commit to keep a durable diff for this task.
        </p>
      ) : null}

      {activeSha ? (
        <>
          {commitLoading ? (
            <p className="task-linked-commit__status">Loading commit…</p>
          ) : null}
          {commitError ? (
            <p className="task-linked-commit__error" role="alert">
              {commitError}
            </p>
          ) : null}
          {commit ? (
            <CommitDetailPane
              projectId={projectId}
              commit={commit}
              repository={repository}
              requestJson={requestJson}
              filesPresentation="stacked"
            />
          ) : null}
        </>
      ) : null}

      {picking && typeof document !== "undefined"
        ? createPortal(
            <div
              className="entity-delete-modal-root"
              data-blocking-modal=""
              data-task-link-modal=""
              data-task-linked-commit-modal=""
            >
              <button
                type="button"
                aria-label="Cancel"
                className="entity-delete-modal-backdrop"
                onClick={closePicker}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="entity-delete-modal task-link-attachments-modal"
              >
                <h2 id={titleId} className="entity-delete-modal-title">
                  Link commit
                </h2>
                <p className="entity-delete-modal-body">
                  Search commits from the project repository
                  {branchLabel ? ` (${branchLabel})` : ""}.
                </p>
                <label className="task-link-attachments-modal__label">
                  <span className="sr-only">Search commits</span>
                  <input
                    ref={searchInputRef}
                    type="search"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Search by message, author, or SHA…"
                    value={searchQuery}
                    disabled={linking}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      if (formError) setFormError(null);
                    }}
                    className="task-link-attachments-modal__input"
                  />
                </label>
                {formError ? (
                  <p className="entity-delete-modal-error" role="alert">
                    {formError}
                  </p>
                ) : null}
                {commitsError ? (
                  <p className="entity-delete-modal-error" role="alert">
                    {commitsError}
                  </p>
                ) : null}
                <p className="task-link-attachments-modal__section-label">
                  Commits
                </p>
                {commitsLoading ? (
                  <p className="task-link-attachments-modal__empty">Loading…</p>
                ) : null}
                {!commitsLoading ? (
                  <ul className="task-link-attachments-modal__results">
                    {showLinkBySha && shaFromQuery ? (
                      <li>
                        <button
                          type="button"
                          className="task-link-attachments-modal__result"
                          disabled={linking || linkedAlready(shaFromQuery)}
                          onClick={() => {
                            void linkCommit(shaFromQuery);
                          }}
                        >
                          <span className="task-link-attachments-modal__result-scope">
                            SHA
                          </span>
                          <span className="task-link-attachments-modal__result-label">
                            Link {shortSha(shaFromQuery)}
                          </span>
                          <span className="task-link-attachments-modal__result-detail">
                            {linkedAlready(shaFromQuery)
                              ? "Already linked"
                              : "Not in recent commits — link by SHA"}
                          </span>
                        </button>
                      </li>
                    ) : null}
                    {filteredCommits.map((entry) => {
                      const already = linkedAlready(entry.sha);
                      const author =
                        entry.authorLogin || entry.authorName || null;
                      const authored = formatCommitAuthoredAt(entry.authoredAt);
                      const detail = [author, authored]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <li key={entry.sha}>
                          <button
                            type="button"
                            className="task-link-attachments-modal__result"
                            disabled={linking || already}
                            onClick={() => {
                              void linkCommit(entry.sha);
                            }}
                          >
                            <span className="task-link-attachments-modal__result-scope">
                              {entry.shortSha}
                            </span>
                            <span className="task-link-attachments-modal__result-label">
                              {already
                                ? `${commitSubject(entry.message)} (linked)`
                                : commitSubject(entry.message)}
                            </span>
                            {detail ? (
                              <span className="task-link-attachments-modal__result-detail">
                                {detail}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {!commitsLoading &&
                !commitsError &&
                filteredCommits.length === 0 &&
                !showLinkBySha ? (
                  <p className="task-link-attachments-modal__empty">
                    No matches.
                  </p>
                ) : null}
                <div className="entity-delete-modal-actions">
                  <button
                    type="button"
                    className="entity-delete-modal-cancel"
                    onClick={closePicker}
                    disabled={linking}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
