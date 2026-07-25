"use client";

import type {
  GithubCommit,
  GithubPullRequest,
  GithubPullRequestState,
} from "@backsteros/contracts";
import {
  DocumentMarkdownPreview,
  LIST_KEYBOARD_NAV_ZONE_MAIN,
  PillNav,
  ProjectOcticon,
  keyboardNavItemProps,
  keyboardNavListItemClass,
  shouldHandleGlobalShortcut,
  useCommandPalette,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
} from "@backsteros/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConsoleProjectBreadcrumbHeader } from "@/components/console-project-breadcrumb-header";
import { GithubCodeMenu } from "@/components/github-code-menu";
import { GithubCommitIcon } from "@/components/github-commit-icon";
import { GithubPullRequestIcon } from "@/components/github-pull-request-icon";
import { PullRequestFilesPane } from "@/components/pull-request-files-pane";
import { apiErrorMessage, useConsoleApi } from "@/lib/api-context";

type PullDetailTab = "conversation" | "commits" | "files";

function commitSubject(message: string): string {
  const line = message.split("\n")[0]?.trim() ?? "";
  return line || "(no message)";
}

/** Compact relative age for list trailing column (e.g. 5m, 3h, 2d). */
function formatRelativeAge(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

function pullStateLabel(
  state: GithubPullRequestState,
  draft: boolean,
): string {
  if (state === "open" && draft) return "Draft";
  if (state === "open") return "Open";
  if (state === "merged") return "Merged";
  return "Closed";
}

function pullActionVerb(state: GithubPullRequestState): string {
  if (state === "merged") return "merged";
  if (state === "closed") return "closed";
  return "wants to merge";
}

function formatRelativeAgo(value: string | null): string {
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

function formatCount(value: number | null | undefined): string {
  if (value == null) return "–";
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k+`;
  }
  return String(value);
}

function formatDiffStat(value: number | null | undefined): string {
  if (value == null) return "0";
  return value.toLocaleString("en-US");
}

export function PullRequestDetailPane({
  projectId,
  projectIcon,
  projectName,
  pullRequest: initialPullRequest,
  repository,
  tab: controlledTab,
  onTabChange,
  onClose,
  onNavigateToProject,
  onSelectCommit,
  showChromeHeader = true,
  hotkeysEnabled = false,
  onSelectedFilenameChange,
}: {
  projectId: string;
  projectIcon?: string | null;
  projectName: string;
  pullRequest: GithubPullRequest;
  repository: string;
  tab?: PullDetailTab;
  onTabChange?: (tab: PullDetailTab) => void;
  onClose: () => void;
  onNavigateToProject?: () => void;
  onSelectCommit?: (commit: GithubCommit, repository: string) => void;
  showChromeHeader?: boolean;
  /** When false, 1/2/3 stay on the side-panel list tabs. */
  hotkeysEnabled?: boolean;
  onSelectedFilenameChange?: (filename: string | null) => void;
}) {
  const { client } = useConsoleApi();
  const { open: commandPaletteOpen } = useCommandPalette();
  const { clearHighlights, setActiveZone } = useListKeyboardNavigationZone();
  const [pullRequest, setPullRequest] =
    useState<GithubPullRequest>(initialPullRequest);
  const [uncontrolledTab, setUncontrolledTab] =
    useState<PullDetailTab>("conversation");
  const tab = controlledTab ?? uncontrolledTab;
  const setTab = onTabChange ?? setUncontrolledTab;
  const [detailError, setDetailError] = useState<string | null>(null);
  const [commits, setCommits] = useState<GithubCommit[]>([]);
  const [commitsPage, setCommitsPage] = useState(1);
  const [commitsHasMore, setCommitsHasMore] = useState(false);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsLoadingMore, setCommitsLoadingMore] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const commitsLoadedForRef = useRef<number | null>(null);
  const commitsRequestGenerationRef = useRef(0);
  const tabsRowRef = useRef<HTMLDivElement>(null);
  const commitsListRef = useRef<HTMLUListElement>(null);
  const commitsListContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  const focusTabButton = useCallback((nextTab: PullDetailTab) => {
    const root = tabsRowRef.current;
    if (!root) return;
    const byValue = root.querySelector<HTMLButtonElement>(
      `.app-pill-nav-item[data-pill-nav-value="${CSS.escape(nextTab)}"]`,
    );
    if (byValue) {
      byValue.focus({ preventScroll: true });
      return;
    }
    // Fallback before @backsteros/ui rebuild ships data-pill-nav-value.
    const order: PullDetailTab[] = ["conversation", "commits", "files"];
    const index = order.indexOf(nextTab);
    root
      .querySelectorAll<HTMLButtonElement>(".app-pill-nav-item")
      [index]?.focus({ preventScroll: true });
  }, []);

  /** Drop side-panel PR/commit list focus so its orange ring cannot linger. */
  const blurSidepanelGithubListFocus = useCallback(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (!active.closest("[data-keyboard-nav-item]")) return;
    // Keep focus inside this PR detail (commit list / files / tabs).
    if (active.closest(".console-pane--pull-detail")) return;
    active.blur();
  }, []);

  const selectDetailTab = useCallback(
    (nextTab: PullDetailTab) => {
      setTab(nextTab);
      // Clear list keyboard rings, leave content zone so j/k cannot re-highlight
      // the side PR list while tabs own focus.
      clearHighlights();
      setActiveZone("main", { activate: false });
      blurSidepanelGithubListFocus();
      // Focus after paint so `is-active` lands on the same button we focus.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          blurSidepanelGithubListFocus();
          focusTabButton(nextTab);
          if (nextTab === "commits") {
            setActiveZone("main", { activate: true });
          }
        });
      });
    },
    [
      blurSidepanelGithubListFocus,
      clearHighlights,
      focusTabButton,
      setActiveZone,
      setTab,
    ],
  );

  useEffect(() => {
    setPullRequest(initialPullRequest);
    if (controlledTab == null) {
      setUncontrolledTab("conversation");
    }
    setDetailError(null);
    setCommits([]);
    setCommitsPage(1);
    setCommitsHasMore(false);
    setCommitsError(null);
    commitsLoadedForRef.current = null;
    commitsRequestGenerationRef.current += 1;
    // Reset only when opening a different PR — not when switching Conversation /
    // Commits / Files (that would clobber detail stats back to the list payload).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [initialPullRequest.number, projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await client.requestJson<{
          pullRequest: GithubPullRequest;
        }>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/github/pulls/${encodeURIComponent(String(initialPullRequest.number))}`,
          { signal: controller.signal },
        );
        setPullRequest(result.pullRequest);
        setDetailError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setDetailError(apiErrorMessage(error));
      }
    })();
    return () => controller.abort();
  }, [client, initialPullRequest.number, projectId]);

  const loadCommitsPage = useCallback(
    async (page: number, append: boolean) => {
      const requestGeneration = commitsRequestGenerationRef.current;
      if (append) {
        setCommitsLoadingMore(true);
      } else {
        setCommitsLoading(true);
        setCommits([]);
      }
      setCommitsError(null);
      try {
        const query = new URLSearchParams({ page: String(page) });
        const result = await client.requestJson<{
          commits: GithubCommit[];
          page: number;
          hasMore: boolean;
        }>(
          `/api/v1/projects/${encodeURIComponent(projectId)}/github/pulls/${encodeURIComponent(String(pullRequest.number))}/commits?${query.toString()}`,
        );
        if (requestGeneration !== commitsRequestGenerationRef.current) {
          return;
        }
        setCommits((previous) =>
          append ? [...previous, ...result.commits] : result.commits,
        );
        setCommitsPage(result.page);
        setCommitsHasMore(result.hasMore);
        commitsLoadedForRef.current = pullRequest.number;
      } catch (error) {
        if (requestGeneration !== commitsRequestGenerationRef.current) {
          return;
        }
        setCommitsError(apiErrorMessage(error));
        if (!append) {
          setCommits([]);
          setCommitsHasMore(false);
        }
      } finally {
        if (requestGeneration === commitsRequestGenerationRef.current) {
          setCommitsLoading(false);
          setCommitsLoadingMore(false);
        }
      }
    },
    [client, projectId, pullRequest.number],
  );

  useEffect(() => {
    if (tab !== "commits") return;
    if (commitsLoadedForRef.current === pullRequest.number && commits.length > 0) {
      return;
    }
    void loadCommitsPage(1, false);
  }, [commits.length, loadCommitsPage, pullRequest.number, tab]);

  // 1 / 2 / 3 → Conversation / Commits / Files while PR detail is engaged
  // (Enter/Space). While browsing the PR list, the side panel owns 1–4.
  useEffect(() => {
    if (!hotkeysEnabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (!shouldHandleGlobalShortcut(event)) return;

      const nextTab: PullDetailTab | null =
        event.key === "1"
          ? "conversation"
          : event.key === "2"
            ? "commits"
            : event.key === "3"
              ? "files"
              : null;
      if (!nextTab) return;

      event.preventDefault();
      event.stopPropagation();
      selectDetailTab(nextTab);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, hotkeysEnabled, selectDetailTab]);

  // Enter/Space into the PR — claim focus for the active detail tab.
  // Escape back to the list — drop tab-button focus so the highlight clears.
  useEffect(() => {
    if (!hotkeysEnabled) {
      const root = tabsRowRef.current;
      if (root) {
        for (const button of root.querySelectorAll<HTMLButtonElement>(
          ".app-pill-nav-item",
        )) {
          if (button === document.activeElement) {
            button.blur();
          }
        }
      }
      return;
    }

    let cancelled = false;
    clearHighlights();
    setActiveZone("main", { activate: false });
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        focusTabButton(tab);
        if (tab === "commits") {
          setActiveZone("main", { activate: true });
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // Only when engaging / changing PR — not on every tab switch via 1/2/3.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [hotkeysEnabled, pullRequest.number]);

  const commitItemIds = useMemo(
    () => commits.map((commit) => commit.sha),
    [commits],
  );
  const navigatePullCommit = useCallback(
    (sha: string) => {
      const commit = commits.find((entry) => entry.sha === sha);
      if (commit) onSelectCommit?.(commit, repository);
    },
    [commits, onSelectCommit, repository],
  );
  const { highlightedId: commitHighlightedId } = useListKeyboardNavigation({
    containerRef: commitsListRef,
    itemIds: commitItemIds,
    selectedId: null,
    onNavigate: navigatePullCommit,
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    priority: 20,
    enabled:
      hotkeysEnabled && tab === "commits" && commitItemIds.length > 0,
  });

  // After switching to Commits (or commits finishing load), claim j/k —
  // only while the PR detail is engaged.
  useEffect(() => {
    if (!hotkeysEnabled) return;
    if (tab !== "commits" || commitItemIds.length === 0) return;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setActiveZone("main", { activate: true });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [commitItemIds.length, hotkeysEnabled, setActiveZone, tab]);

  const author = pullRequest.authorLogin || "Unknown";
  const body = pullRequest.body?.trim() || null;
  const stateClass = `is-${pullRequest.state}${
    pullRequest.draft ? " is-draft" : ""
  }`;
  const activityAt =
    pullRequest.state === "merged"
      ? pullRequest.mergedAt
      : pullRequest.state === "closed"
        ? pullRequest.closedAt
        : pullRequest.createdAt;
  const agoLabel = formatRelativeAgo(activityAt ?? pullRequest.updatedAt);
  const commitsCount = pullRequest.commitsCount ?? 0;
  const commentsCount = pullRequest.commentsCount ?? 0;
  const changedFilesCount = pullRequest.changedFilesCount ?? 0;

  const tabItems = useMemo(
    () => [
      {
        value: "conversation" as const,
        label: "Conversation",
        count: formatCount(commentsCount),
      },
      {
        value: "commits" as const,
        label: "Commits",
        count: formatCount(commitsCount),
      },
      {
        value: "files" as const,
        label: "Files changed",
        count: formatCount(changedFilesCount),
      },
    ],
    [changedFilesCount, commentsCount, commitsCount],
  );

  const commitsPhrase =
    commitsCount > 0
      ? `${commitsCount} commit${commitsCount === 1 ? "" : "s"}`
      : null;

  return (
    <div className="console-pane console-pane--pull-detail">
      {showChromeHeader ? (
        <ConsoleProjectBreadcrumbHeader
          className="console-commit-detail-chrome"
          projectIcon={projectIcon}
          projectName={projectName}
          segment={pullRequest.title}
          onNavigateToProject={onNavigateToProject ?? onClose}
          leading={
            <button
              type="button"
              className="console-commit-detail-back"
              aria-label="Back to project"
              onClick={onClose}
            >
              <ProjectOcticon icon="chevron-left" size={14} />
            </button>
          }
        />
      ) : null}

      <div className="console-pane-body console-pull-detail-body">
        <div className="console-github-detail-stack">
          <div className="console-github-detail-hero-rail console-github-detail-hero-rail--pull">
            <div className="console-github-detail-hero-inner">
              <header className="console-pull-detail-hero">
                <div className="console-pull-detail-title-row">
                  <h1 className="console-pull-detail-title">
                    {pullRequest.title}{" "}
                    <a
                      className="console-pull-detail-title-number"
                      href={pullRequest.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      #{pullRequest.number}
                    </a>
                  </h1>
                  <GithubCodeMenu
                    command={`gh pr checkout ${pullRequest.number}`}
                    commandTitle="Checkout with GitHub CLI"
                    githubUrl={pullRequest.htmlUrl}
                  />
                </div>

                <div className="console-pull-detail-meta-row">
                  <span className={`console-pull-detail-badge ${stateClass}`}>
                    <GithubPullRequestIcon size={14} />
                    {pullStateLabel(pullRequest.state, pullRequest.draft)}
                  </span>
                  <div className="console-pull-detail-meta-copy">
                    <span className="console-pull-detail-meta-author">
                      {author}
                    </span>
                    <span className="console-pull-detail-meta-muted">
                      {" "}
                      {pullActionVerb(pullRequest.state)}
                      {commitsPhrase ? ` ${commitsPhrase}` : ""}
                      {pullRequest.baseRef || pullRequest.headRef
                        ? " into "
                        : ""}
                    </span>
                    {pullRequest.baseRef ? (
                      <span className="console-pull-detail-branch">
                        {pullRequest.baseRef}
                      </span>
                    ) : null}
                    {pullRequest.baseRef && pullRequest.headRef ? (
                      <span className="console-pull-detail-meta-muted">
                        {" "}
                        from{" "}
                      </span>
                    ) : null}
                    {pullRequest.headRef ? (
                      <span className="console-pull-detail-branch">
                        {pullRequest.headRef}
                      </span>
                    ) : null}
                    {agoLabel ? (
                      <span className="console-pull-detail-meta-ago">
                        <ProjectOcticon icon="comment" size={12} />
                        {agoLabel}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div
                  ref={tabsRowRef}
                  className={`console-pull-detail-tabs-row${
                    hotkeysEnabled ? " is-hotkeys-active" : ""
                  }`}
                >
                  <PillNav
                    ariaLabel="Pull request sections"
                    items={tabItems}
                    value={tab}
                    onChange={selectDetailTab}
                  />
                  {pullRequest.additions != null ||
                  pullRequest.deletions != null ? (
                    <div
                      className="console-pull-detail-diffstat"
                      aria-label="Diff stats"
                    >
                      <span className="console-pull-detail-diffstat-add">
                        +{formatDiffStat(pullRequest.additions)}
                      </span>
                      <span className="console-pull-detail-diffstat-del">
                        −{formatDiffStat(pullRequest.deletions)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </header>
            </div>
          </div>

          <div
            className={[
              "console-github-detail-content",
              tab === "files" ? "is-full" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {tab === "files" ? (
              <PullRequestFilesPane
                key={pullRequest.number}
                projectId={projectId}
                pullNumber={pullRequest.number}
                autoFocusList={hotkeysEnabled}
                onSelectedFilenameChange={onSelectedFilenameChange}
              />
            ) : (
              <div className="console-github-detail-content-inner">
                {detailError ? (
                  <p className="console-github-pane-error" role="alert">
                    {detailError}
                  </p>
                ) : null}

                {tab === "conversation" ? (
                  <section
                    className="console-pull-detail-description"
                    aria-label="Conversation"
                  >
                    {body ? (
                      <div className="console-pull-detail-description-body">
                        <DocumentMarkdownPreview body={body} />
                      </div>
                    ) : (
                      <p className="console-pull-detail-description-empty">
                        No description provided.
                      </p>
                    )}
                  </section>
                ) : null}

                {tab === "commits" ? (
                  <section
                    className="console-pull-detail-commits"
                    aria-label="Commits"
                  >
                    {commitsError ? (
                      <p className="console-github-pane-error" role="alert">
                        {commitsError}
                      </p>
                    ) : null}

                    {commitsLoading && commits.length === 0 ? (
                      <p className="console-github-pane-status">
                        Loading commits…
                      </p>
                    ) : null}

                    {!commitsLoading &&
                    !commitsError &&
                    commits.length === 0 ? (
                      <p className="console-github-pane-status">
                        No commits on this pull request.
                      </p>
                    ) : null}

                    {commits.length > 0 ? (
                      <ul
                        ref={commitsListRef}
                        className="console-github-commit-list"
                        {...commitsListContainerProps}
                      >
                        {commits.map((commit) => (
                          <li key={commit.sha}>
                            <div
                              role="button"
                              tabIndex={0}
                              {...keyboardNavItemProps(commit.sha)}
                              className={[
                                "console-github-commit",
                                keyboardNavListItemClass(
                                  commitHighlightedId === commit.sha,
                                ),
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onClick={() => {
                                onSelectCommit?.(commit, repository);
                              }}
                              onKeyDown={(event) => {
                                if (
                                  event.key !== "Enter" &&
                                  event.key !== " "
                                ) {
                                  return;
                                }
                                event.preventDefault();
                                onSelectCommit?.(commit, repository);
                              }}
                            >
                              <div className="console-github-commit-body">
                                <div className="console-github-commit-message">
                                  {commitSubject(commit.message)}
                                </div>
                                <div className="console-github-commit-meta">
                                  {[
                                    commit.shortSha,
                                    commit.authorLogin || commit.authorName,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              </div>
                              <div className="console-github-commit-trailing">
                                <span
                                  className="console-github-commit-icon"
                                  aria-hidden="true"
                                >
                                  <GithubCommitIcon size={14} />
                                </span>
                                <span className="console-github-commit-age">
                                  {formatRelativeAge(commit.authoredAt) ||
                                    "—"}
                                </span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {commitsHasMore ? (
                      <div className="console-github-pane-more">
                        <button
                          type="button"
                          className="console-btn"
                          disabled={commitsLoadingMore}
                          onClick={() => {
                            void loadCommitsPage(commitsPage + 1, true);
                          }}
                        >
                          {commitsLoadingMore ? "Loading…" : "Load more"}
                        </button>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
