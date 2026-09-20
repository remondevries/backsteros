import { useEffect, useRef, useState } from "react";

import { BacksterosGithubCommitIcon } from "~/backsteros/GithubCommitIcon";
import {
  BacksterosGithubFilesDiffPane,
  useBacksterosCommitFiles,
} from "~/backsteros/GithubFilesDiffPane";
import { ProjectOcticon } from "~/backsteros/ProjectOcticon";
import type { BacksterosGithubCommit } from "~/backsteros/types";

function commitSubject(message: string): string {
  return message.split("\n")[0]?.trim() || "(no message)";
}

function commitBody(message: string): string | null {
  const body = message.split("\n").slice(1).join("\n").trim();
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

function GithubCodeMenu(props: {
  readonly command: string;
  readonly commandTitle: string;
  readonly githubUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="bos-github-code-menu" ref={rootRef}>
      <button
        type="button"
        className="bos-github-code-menu__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        Code
        <ProjectOcticon icon="triangle-down" size={12} />
      </button>
      {open ? (
        <div className="bos-github-code-menu__panel" role="menu">
          <div className="bos-github-code-menu__header">
            <ProjectOcticon icon="terminal" size={14} />
            <span>{props.commandTitle}</span>
          </div>
          <div className="bos-github-code-menu__command-row">
            <code>{props.command}</code>
            <button
              type="button"
              className="bos-github-code-menu__copy"
              aria-label={copied ? "Copied" : "Copy command"}
              title={copied ? "Copied" : "Copy"}
              onClick={() => {
                void navigator.clipboard.writeText(props.command).then(() => setCopied(true));
              }}
            >
              <ProjectOcticon icon={copied ? "check" : "copy"} size={14} />
            </button>
          </div>
          <a
            className="bos-github-code-menu__github"
            href={props.githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function BacksterosCommitDetailPane(props: {
  readonly projectId: string;
  readonly commit: BacksterosGithubCommit;
  readonly repository: string;
}) {
  const { projectId, commit, repository } = props;
  const subject = commitSubject(commit.message);
  const body = commitBody(commit.message);
  const author = commit.authorLogin || commit.authorName || "Unknown";
  const authoredLabel = formatCommitDetailDate(commit.authoredAt);
  const { files, loading, error } = useBacksterosCommitFiles(projectId, commit.sha);

  return (
    <div className="bos-github-detail bos-github-detail--commit">
      <header className="bos-github-detail__hero">
        <div className="bos-github-detail__title-row">
          <h2 className="bos-github-detail__title">{subject}</h2>
          <div className="bos-github-detail__title-actions">
            <a
              className="bos-github-detail__sha"
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

        {body ? <pre className="bos-github-detail__message">{body}</pre> : null}

        <div className="bos-github-detail__meta">
          <span className="bos-github-detail__avatar" aria-hidden="true">
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
          <div className="bos-github-detail__meta-text">
            <span className="bos-github-detail__author">{author}</span>
            {authoredLabel ? (
              <span className="bos-github-detail__meta-muted"> committed on {authoredLabel}</span>
            ) : null}
            {repository ? (
              <span className="bos-github-detail__meta-muted"> · {repository}</span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="bos-github-detail__content">
        <BacksterosGithubFilesDiffPane files={files} loading={loading} error={error} />
      </div>
    </div>
  );
}

export function BacksterosGithubCommitListItem(props: {
  readonly commit: BacksterosGithubCommit;
  readonly selected: boolean;
  readonly age: string;
  readonly onSelect: () => void;
}) {
  const { commit, selected, age, onSelect } = props;
  return (
    <button
      type="button"
      className={["bos-github-commit", selected ? "is-selected" : null].filter(Boolean).join(" ")}
      aria-label={`${commitSubject(commit.message)} · ${age || "unknown age"}`}
      onClick={onSelect}
    >
      <div className="bos-github-commit__body">
        <div className="bos-github-commit__message">{commitSubject(commit.message)}</div>
        <div className="bos-github-commit__meta">
          {[commit.shortSha, commit.authorLogin || commit.authorName].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="bos-github-commit__trailing">
        <span className="bos-github-commit__icon" aria-hidden="true">
          <BacksterosGithubCommitIcon size={14} />
        </span>
        <span className="bos-github-commit__age">{age || "—"}</span>
      </div>
    </button>
  );
}
