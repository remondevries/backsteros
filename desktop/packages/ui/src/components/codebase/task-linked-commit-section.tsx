"use client";

import type { GithubCommit } from "@backsteros/contracts";
import { useCallback, useEffect, useState } from "react";

import { CommitDetailPane } from "./commit-detail-pane.js";
import { apiErrorMessage } from "./api-error-message.js";
import type { CodebaseRequestJson } from "./project-fs-types.js";

function commitSubject(message: string): string {
  const line = message.split("\n")[0]?.trim() ?? "";
  return line || "(no message)";
}

function normalizeShaInput(raw: string): string | null {
  const sha = raw.trim();
  if (!/^[0-9a-fA-F]{7,64}$/.test(sha)) return null;
  return sha;
}

export type TaskLinkedCommitSectionProps = {
  projectId: string;
  /** Default branch hint for the commit list (optional). */
  defaultBranch?: string | null;
  linkedCommitSha: string | null;
  requestJson: CodebaseRequestJson;
  onLinkCommit: (sha: string) => void | Promise<void>;
  onUnlinkCommit: () => void | Promise<void>;
  linking?: boolean;
};

/**
 * Link a GitHub commit to a codebase task and render its file diffs
 * (same CommitDetailPane / CommitFilesPane as the project workbench).
 */
export function TaskLinkedCommitSection({
  projectId,
  defaultBranch = null,
  linkedCommitSha,
  requestJson,
  onLinkCommit,
  onUnlinkCommit,
  linking = false,
}: TaskLinkedCommitSectionProps) {
  const [picking, setPicking] = useState(false);
  const [commits, setCommits] = useState<GithubCommit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [shaDraft, setShaDraft] = useState("");
  const [shaError, setShaError] = useState<string | null>(null);
  const [commit, setCommit] = useState<GithubCommit | null>(null);
  const [repository, setRepository] = useState("");
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const sha = linkedCommitSha?.trim() || null;

  useEffect(() => {
    if (!sha) {
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
      `/api/v1/projects/${encodeURIComponent(projectId)}/github/commits/${encodeURIComponent(sha)}`,
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
  }, [projectId, requestJson, sha]);

  const loadRecentCommits = useCallback(async () => {
    setCommitsLoading(true);
    setCommitsError(null);
    try {
      const query = new URLSearchParams({ page: "1" });
      if (defaultBranch?.trim()) {
        query.set("branch", defaultBranch.trim());
      }
      const body = await requestJson<{ commits: GithubCommit[] }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/github/commits?${query.toString()}`,
      );
      setCommits(Array.isArray(body.commits) ? body.commits : []);
    } catch (error) {
      setCommits([]);
      setCommitsError(apiErrorMessage(error));
    } finally {
      setCommitsLoading(false);
    }
  }, [defaultBranch, projectId, requestJson]);

  useEffect(() => {
    if (!picking || sha) return;
    void loadRecentCommits();
  }, [loadRecentCommits, picking, sha]);

  const submitShaDraft = useCallback(async () => {
    const next = normalizeShaInput(shaDraft);
    if (!next) {
      setShaError("Enter a Git commit SHA (7–64 hex characters).");
      return;
    }
    setShaError(null);
    await onLinkCommit(next);
    setPicking(false);
    setShaDraft("");
  }, [onLinkCommit, shaDraft]);

  if (sha) {
    return (
      <section
        className="task-linked-commit"
        aria-label="Linked commit changes"
      >
        <div className="task-linked-commit__toolbar">
          <h2 className="task-linked-commit__heading">Changes</h2>
          <button
            type="button"
            className="task-linked-commit__unlink"
            disabled={linking}
            onClick={() => {
              void onUnlinkCommit();
            }}
          >
            Unlink commit
          </button>
        </div>
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
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="task-linked-commit" aria-label="Link a commit">
      <div className="task-linked-commit__toolbar">
        <h2 className="task-linked-commit__heading">Changes</h2>
        {!picking ? (
          <button
            type="button"
            className="task-linked-commit__link"
            disabled={linking}
            onClick={() => setPicking(true)}
          >
            Link commit…
          </button>
        ) : (
          <button
            type="button"
            className="task-linked-commit__unlink"
            onClick={() => {
              setPicking(false);
              setShaDraft("");
              setShaError(null);
            }}
          >
            Cancel
          </button>
        )}
      </div>
      {!picking ? (
        <p className="task-linked-commit__hint">
          Link a GitHub commit to keep a durable diff for this task.
        </p>
      ) : (
        <div className="task-linked-commit__picker">
          <form
            className="task-linked-commit__sha-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitShaDraft();
            }}
          >
            <label className="task-linked-commit__sha-label" htmlFor="task-commit-sha">
              Commit SHA
            </label>
            <div className="task-linked-commit__sha-row">
              <input
                id="task-commit-sha"
                className="task-linked-commit__sha-input"
                value={shaDraft}
                onChange={(event) => {
                  setShaDraft(event.target.value);
                  setShaError(null);
                }}
                placeholder="abc1234…"
                autoComplete="off"
                spellCheck={false}
                disabled={linking}
              />
              <button
                type="submit"
                className="task-linked-commit__link"
                disabled={linking}
              >
                Link
              </button>
            </div>
            {shaError ? (
              <p className="task-linked-commit__error" role="alert">
                {shaError}
              </p>
            ) : null}
          </form>
          <div className="task-linked-commit__list-block">
            <div className="task-linked-commit__list-header">
              Recent commits
              {defaultBranch?.trim() ? (
                <span className="task-linked-commit__branch">
                  {" "}
                  · {defaultBranch.trim()}
                </span>
              ) : null}
            </div>
            {commitsLoading ? (
              <p className="task-linked-commit__status">Loading…</p>
            ) : null}
            {commitsError ? (
              <p className="task-linked-commit__error" role="alert">
                {commitsError}
              </p>
            ) : null}
            {!commitsLoading && !commitsError && commits.length === 0 ? (
              <p className="task-linked-commit__status">No commits found.</p>
            ) : null}
            <ul className="task-linked-commit__list">
              {commits.map((entry) => (
                <li key={entry.sha}>
                  <button
                    type="button"
                    className="task-linked-commit__commit"
                    disabled={linking}
                    onClick={() => {
                      void onLinkCommit(entry.sha).then(() => {
                        setPicking(false);
                        setShaDraft("");
                      });
                    }}
                  >
                    <code className="task-linked-commit__short-sha">
                      {entry.shortSha}
                    </code>
                    <span className="task-linked-commit__subject">
                      {commitSubject(entry.message)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
