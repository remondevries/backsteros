import { BacksterosGithubPullRequestIcon } from "~/backsteros/GithubPullRequestIcon";
import {
  BacksterosGithubFilesDiffPane,
  useBacksterosPullFiles,
} from "~/backsteros/GithubFilesDiffPane";
import { ProjectOcticon } from "~/backsteros/ProjectOcticon";
import type { BacksterosGithubPullRequest } from "~/backsteros/types";

function pullStateLabel(state: BacksterosGithubPullRequest["state"], draft: boolean): string {
  if (state === "open" && draft) return "Draft";
  if (state === "open") return "Open";
  if (state === "merged") return "Merged";
  return "Closed";
}

function pullActionVerb(state: BacksterosGithubPullRequest["state"]): string {
  if (state === "merged") return "merged";
  if (state === "closed") return "closed";
  return "wants to merge";
}

function formatRelativeAgo(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

function formatDiffStat(value: number | null | undefined): string {
  if (value == null) return "0";
  return value.toLocaleString("en-US");
}

export function BacksterosPullRequestDetailPane(props: {
  readonly projectId: string;
  readonly pullRequest: BacksterosGithubPullRequest;
  readonly repository: string;
}) {
  const { projectId, pullRequest, repository } = props;
  const author = pullRequest.authorLogin || "Unknown";
  const stateClass = `is-${pullRequest.state}${pullRequest.draft ? " is-draft" : ""}`;
  const activityAt =
    pullRequest.state === "merged"
      ? pullRequest.mergedAt
      : pullRequest.state === "closed"
        ? pullRequest.closedAt
        : pullRequest.createdAt;
  const agoLabel = formatRelativeAgo(activityAt ?? pullRequest.updatedAt);
  const commitsCount = pullRequest.commitsCount ?? 0;
  const commitsPhrase =
    commitsCount > 0 ? `${commitsCount} commit${commitsCount === 1 ? "" : "s"}` : null;
  const { files, loading, error, hasMore, loadingMore, loadMore } = useBacksterosPullFiles(
    projectId,
    pullRequest.number,
  );

  return (
    <div className="bos-github-detail bos-github-detail--pull">
      <header className="bos-github-detail__hero bos-github-detail__hero--pull">
        <div className="bos-github-detail__title-row">
          <h2 className="bos-github-detail__title">
            {pullRequest.title}{" "}
            <a
              className="bos-github-detail__title-number"
              href={pullRequest.htmlUrl}
              target="_blank"
              rel="noreferrer"
            >
              #{pullRequest.number}
            </a>
          </h2>
        </div>

        <div className="bos-github-pull__meta-row">
          <span className={`bos-github-pull__badge ${stateClass}`}>
            <BacksterosGithubPullRequestIcon size={14} />
            {pullStateLabel(pullRequest.state, pullRequest.draft)}
          </span>
          <div className="bos-github-pull__meta-copy">
            <span className="bos-github-detail__author">{author}</span>
            <span className="bos-github-detail__meta-muted">
              {" "}
              {pullActionVerb(pullRequest.state)}
              {commitsPhrase ? ` ${commitsPhrase}` : ""}
              {pullRequest.baseRef || pullRequest.headRef ? " into " : ""}
            </span>
            {pullRequest.baseRef ? (
              <span className="bos-github-pull__branch">{pullRequest.baseRef}</span>
            ) : null}
            {pullRequest.baseRef && pullRequest.headRef ? (
              <span className="bos-github-detail__meta-muted"> from </span>
            ) : null}
            {pullRequest.headRef ? (
              <span className="bos-github-pull__branch">{pullRequest.headRef}</span>
            ) : null}
            {agoLabel ? (
              <span className="bos-github-pull__ago">
                <ProjectOcticon icon="comment" size={12} />
                {agoLabel}
              </span>
            ) : null}
          </div>
        </div>

        {(pullRequest.additions != null || pullRequest.deletions != null) && (
          <div className="bos-github-pull__diffstat" aria-label="Diff stats">
            <span className="is-add">+{formatDiffStat(pullRequest.additions)}</span>
            <span className="is-del">−{formatDiffStat(pullRequest.deletions)}</span>
            {repository ? (
              <span className="bos-github-detail__meta-muted"> · {repository}</span>
            ) : null}
          </div>
        )}

        {pullRequest.body?.trim() ? (
          <pre className="bos-github-detail__message">{pullRequest.body.trim()}</pre>
        ) : null}
      </header>

      <div className="bos-github-detail__content">
        <BacksterosGithubFilesDiffPane
          files={files}
          loading={loading}
          error={error}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
        />
      </div>
    </div>
  );
}

export function BacksterosGithubPullListItem(props: {
  readonly pull: BacksterosGithubPullRequest;
  readonly selected: boolean;
  readonly age: string;
  readonly onSelect: () => void;
}) {
  const { pull, selected, age, onSelect } = props;
  return (
    <button
      type="button"
      className={[
        "bos-github-commit",
        "bos-github-pull",
        `is-${pull.state}`,
        pull.draft ? "is-draft" : null,
        selected ? "is-selected" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`#${pull.number}: ${pull.title}`}
      onClick={onSelect}
    >
      <div className="bos-github-commit__body">
        <div className="bos-github-commit__message">{pull.title}</div>
        <div className="bos-github-commit__meta">
          {[`#${pull.number}`, pullStateLabel(pull.state, pull.draft), pull.authorLogin]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <div className="bos-github-commit__trailing">
        <span className="bos-github-commit__icon" aria-hidden="true">
          <BacksterosGithubPullRequestIcon size={14} />
        </span>
        <span className="bos-github-commit__age">{age || "—"}</span>
      </div>
    </button>
  );
}
