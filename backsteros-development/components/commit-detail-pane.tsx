"use client";

import type { GithubCommit, GithubPullRequest } from "@backsteros/contracts";
import { ProjectOcticon } from "@backsteros/ui";

import { ConsoleProjectBreadcrumbHeader } from "@/components/console-project-breadcrumb-header";
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
  projectIcon,
  projectName,
  commit,
  repository,
  parentPullRequest,
  showChromeHeader = true,
  onClose,
  onNavigateToProject,
  onNavigateToPull,
}: {
  projectId: string;
  projectIcon?: string | null;
  projectName: string;
  commit: GithubCommit;
  repository: string;
  parentPullRequest?: GithubPullRequest | null;
  showChromeHeader?: boolean;
  onClose: () => void;
  onNavigateToProject?: () => void;
  onNavigateToPull?: () => void;
}) {
  const subject = commitSubject(commit.message);
  const body = commitBody(commit.message);
  const author = commit.authorLogin || commit.authorName || "Unknown";
  const authoredLabel = formatCommitDetailDate(commit.authoredAt);
  const fromPull = Boolean(parentPullRequest);

  return (
    <div className="console-pane console-pane--commit-detail">
      {showChromeHeader ? (
        <ConsoleProjectBreadcrumbHeader
          className="console-commit-detail-chrome"
          projectIcon={projectIcon}
          projectName={projectName}
          segment={subject}
          onNavigateToProject={onNavigateToProject ?? onClose}
          leading={
            <button
              type="button"
              className="console-commit-detail-back"
              aria-label={fromPull ? "Back to pull request" : "Back"}
              onClick={
                fromPull
                  ? () => {
                      onNavigateToPull?.();
                      if (!onNavigateToPull) onClose();
                    }
                  : onClose
              }
            >
              <ProjectOcticon icon="chevron-left" size={14} />
            </button>
          }
          actions={
            <a
              className="console-commit-detail-open-github"
              href={commit.htmlUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open on GitHub
            </a>
          }
        />
      ) : null}

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
              <span
                className="console-commit-detail-author-avatar"
                aria-hidden="true"
              >
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
                {repository ? (
                  <span className="console-commit-detail-meta-muted">
                    {" "}
                    · {repository}
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
