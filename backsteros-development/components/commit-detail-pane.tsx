"use client";

import type { GithubCommit, GithubPullRequest } from "@backsteros/contracts";
import { ProjectOcticon } from "@backsteros/ui";

import { CommitFilesPane } from "@/components/pull-request-files-pane";

function commitSubject(message: string): string {
  const line = message.split("\n")[0]?.trim() ?? "";
  return line || "(no message)";
}

function commitBody(message: string): string | null {
  const parts = message.split("\n");
  const body = parts.slice(1).join("\n").trim();
  return body || null;
}

function formatCommitDetailDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CommitDetailPane({
  projectId,
  commit,
  repository,
  parentPullRequest,
  onClose,
  onNavigateToPull,
}: {
  projectId: string;
  commit: GithubCommit;
  repository: string;
  parentPullRequest?: GithubPullRequest | null;
  onClose: () => void;
  onNavigateToPull?: () => void;
}) {
  const subject = commitSubject(commit.message);
  const body = commitBody(commit.message);
  const author = commit.authorLogin || commit.authorName || "Unknown";
  const authoredLabel = formatCommitDetailDate(commit.authoredAt);
  const fromPull = Boolean(parentPullRequest);

  return (
    <div className="console-pane console-pane--commit-detail">
      <div className="console-pane-header">
        <div className="console-pane-header-title console-commit-detail-header">
          <button
            type="button"
            className="console-commit-detail-back"
            aria-label={fromPull ? "Back to pull request" : "Back"}
            onClick={onClose}
          >
            <ProjectOcticon icon="chevron-left" size={14} />
          </button>
          {fromPull && parentPullRequest ? (
            <nav
              className="console-github-breadcrumb"
              aria-label="Commit location"
            >
              <span className="console-github-breadcrumb-sep" aria-hidden="true">
                /
              </span>
              <button
                type="button"
                className="console-github-breadcrumb-item"
                title={parentPullRequest.title}
                onClick={() => {
                  onNavigateToPull?.();
                }}
              >
                <span className="console-github-breadcrumb-prefix">
                  Pull request:
                </span>{" "}
                <span className="console-github-breadcrumb-strong">
                  {parentPullRequest.title}
                </span>
              </button>
              <span className="console-github-breadcrumb-sep" aria-hidden="true">
                /
              </span>
              <span
                className="console-github-breadcrumb-item is-current"
                aria-current="page"
                title={subject}
              >
                {subject}
              </span>
            </nav>
          ) : (
            <>
              <span className="console-commit-detail-header-label">Commit</span>
              <span
                className="console-commit-detail-header-repo"
                title={repository}
              >
                {repository}
              </span>
            </>
          )}
        </div>
        <a
          className="console-commit-detail-open-github"
          href={commit.htmlUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open on GitHub
        </a>
      </div>

      <div className="console-pane-body console-commit-detail-body">
        <div className="console-github-detail-container is-files">
          <header className="console-commit-detail-hero">
            <div className="console-commit-detail-title-row">
              <h1 className="console-commit-detail-title">{subject}</h1>
              <a
                className="console-commit-detail-sha"
                href={commit.htmlUrl}
                target="_blank"
                rel="noreferrer"
                title={commit.sha}
              >
                {commit.shortSha}
              </a>
            </div>

            {body ? (
              <pre className="console-commit-detail-message">{body}</pre>
            ) : null}

            <div className="console-commit-detail-meta">
              <span className="console-commit-detail-author-avatar" aria-hidden="true">
                {commit.authorLogin ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://github.com/${encodeURIComponent(commit.authorLogin)}.png?size=48`}
                    alt=""
                    width={24}
                    height={24}
                  />
                ) : (
                  <ProjectOcticon icon="person" size={14} />
                )}
              </span>
              <div className="console-commit-detail-meta-text">
                <span className="console-commit-detail-author">{author}</span>
                {authoredLabel ? (
                  <span className="console-commit-detail-meta-muted">
                    {" "}
                    committed on {authoredLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          <CommitFilesPane
            key={commit.sha}
            projectId={projectId}
            sha={commit.sha}
          />
        </div>
      </div>
    </div>
  );
}
