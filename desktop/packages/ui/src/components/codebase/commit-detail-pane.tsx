import type { GithubCommit, GithubPullRequest } from "@backsteros/contracts";

import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { GithubCodeMenu } from "./github-code-menu.js";
import type { CodebaseRequestJson } from "./project-fs-types.js";
import { CommitFilesPane } from "./pull-request-files-pane.js";

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

export type CommitDetailPaneProps = {
  projectId: string;
  commit: GithubCommit;
  repository: string;
  requestJson: CodebaseRequestJson;
  /** Present when opened from a PR; workbench owns back navigation. */
  parentPullRequest?: GithubPullRequest | null;
};

export function CommitDetailPane({
  projectId,
  commit,
  repository,
  requestJson,
}: CommitDetailPaneProps) {
  const subject = commitSubject(commit.message);
  const body = commitBody(commit.message);
  const author = commit.authorLogin || commit.authorName || "Unknown";
  const authoredLabel = formatCommitDetailDate(commit.authoredAt);

  return (
    <div className="console-pane console-pane--commit-detail">
      <div className="console-pane-body console-commit-detail-body">
        <div className="console-github-detail-stack">
          <div className="console-github-detail-hero-rail">
            <header className="console-commit-detail-hero">
              <div className="console-commit-detail-title-row">
                <h1 className="console-commit-detail-title">{subject}</h1>
                <div className="console-commit-detail-title-actions">
                  <a
                    className="console-commit-detail-sha"
                    href={commit.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={commit.sha}
                  >
                    {commit.shortSha}
                  </a>
                  <GithubCodeMenu
                    command={`git checkout ${commit.shortSha}`}
                    commandTitle="Checkout commit"
                    githubUrl={commit.htmlUrl}
                  />
                </div>
              </div>

              {body ? (
                <div className="console-commit-detail-message">
                  <DocumentMarkdownPreview body={body} />
                </div>
              ) : null}

              <div className="console-commit-detail-meta">
                <span
                  className="console-commit-detail-author-avatar"
                  aria-hidden="true"
                >
                  {commit.authorLogin ? (
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
          </div>

          <div className="console-github-detail-content is-full">
            <CommitFilesPane
              key={commit.sha}
              projectId={projectId}
              sha={commit.sha}
              requestJson={requestJson}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
