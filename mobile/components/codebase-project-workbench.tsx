import type { GithubCommit, GithubPullRequest } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import {
  CODEBASE_PAD_SPLIT_MIN_WIDTH,
  CODEBASE_WORKBENCH_TABS,
  DEFAULT_CODEBASE_WORKBENCH_TAB,
  type CodebaseWorkbenchTabId,
} from "../lib/codebase-workbench-tabs";
import { isPadDevice } from "../lib/device";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { colors } from "../lib/theme";
import { PillNav } from "./pill-nav";
import { ProjectOverviewPanel } from "./project-overview-panel";
import { ProjectTasksPanel } from "./project-tasks-panel";
import { CodebaseProjectProperties } from "./codebase/codebase-project-properties";
import {
  GithubCommitDetail,
  GithubCommitDetailEmpty,
  GithubPullRequestDetail,
  GithubPullRequestDetailEmpty,
} from "./codebase/github-detail-panes";
import {
  GithubCommitList,
  GithubPullRequestList,
} from "./codebase/github-lists";
import { ProjectFsFileEditor } from "./codebase/project-fs-file-editor";
import { ProjectFsTree } from "./codebase/project-fs-tree";

const LIST_PANE_WIDTH = 340;

type Props = {
  projectId: string;
  /** Bumped after returning from GitHub OAuth. */
  githubRefreshToken?: number;
  onTitleChange?: (title: string) => void;
  /** Notify parent when the active section changes (for header Edit on Overview). */
  onPhoneSectionChange?: (section: CodebaseWorkbenchTabId) => void;
  descriptionOverride?: string | null;
  onDescriptionLoaded?: (description: string) => void;
};

/**
 * Codebase workbench tabs: Overview | Tasks | Files | Commits | PRs.
 * Overview uses the same ProjectOverviewPanel as default projects.
 * iPad: Tasks/Files/Commits/PRs use list|detail columns; Overview is full-width.
 * iPhone: single-column lists (detail pushed on the stack).
 */
export function CodebaseProjectWorkbench({
  projectId,
  githubRefreshToken = 0,
  onTitleChange,
  onPhoneSectionChange,
  descriptionOverride = null,
  onDescriptionLoaded,
}: Props) {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const usePadSplit =
    isPadDevice() && windowWidth >= CODEBASE_PAD_SPLIT_MIN_WIDTH;

  const [tab, setTab] = useState<CodebaseWorkbenchTabId>(
    DEFAULT_CODEBASE_WORKBENCH_TAB,
  );
  const [selectedCommit, setSelectedCommit] = useState<GithubCommit | null>(
    null,
  );
  const [selectedPull, setSelectedPull] = useState<GithubPullRequest | null>(
    null,
  );
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileRefreshToken, setFileRefreshToken] = useState(0);

  useEffect(() => {
    onPhoneSectionChange?.(tab);
  }, [onPhoneSectionChange, tab]);

  const handleTabChange = useCallback((next: CodebaseWorkbenchTabId) => {
    setTab(next);
    if (next !== "commits") setSelectedCommit(null);
    if (next !== "pulls") setSelectedPull(null);
    if (next !== "files") setSelectedFilePath(null);
  }, []);

  const handleSelectCommit = useCallback(
    (commit: GithubCommit) => {
      setSelectedCommit(commit);
      if (!usePadSplit) {
        router.push({
          pathname: "/project/[id]/commit/[sha]",
          params: { id: projectId, sha: commit.sha },
        });
      }
    },
    [usePadSplit, projectId, router],
  );

  const handleSelectPull = useCallback(
    (pull: GithubPullRequest) => {
      setSelectedPull(pull);
      if (!usePadSplit) {
        router.push({
          pathname: "/project/[id]/pull/[number]",
          params: { id: projectId, number: String(pull.number) },
        });
      }
    },
    [usePadSplit, projectId, router],
  );

  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedFilePath(path);
      if (!usePadSplit) {
        router.push({
          pathname: "/project/[id]/file",
          params: { id: projectId, path },
        });
      }
    },
    [usePadSplit, projectId, router],
  );

  let body: React.ReactNode;

  if (tab === "overview") {
    body = (
      <ProjectOverviewPanel
        projectId={projectId}
        layout={usePadSplit ? "wide" : "stacked"}
        descriptionOverride={descriptionOverride}
        onDescriptionLoaded={onDescriptionLoaded}
      />
    );
  } else if (!usePadSplit) {
    body =
      tab === "tasks" ? (
        <View style={styles.phoneTasks}>
          <ProjectTasksPanel projectId={projectId} />
        </View>
      ) : tab === "files" ? (
        <ProjectFsTree
          projectId={projectId}
          selectedPath={null}
          onSelectFile={handleSelectFile}
          onClearSelection={() => {}}
        />
      ) : tab === "commits" ? (
        <GithubCommitList
          projectId={projectId}
          selectedCommitSha={null}
          onSelectCommit={handleSelectCommit}
          githubRefreshToken={githubRefreshToken}
        />
      ) : (
        <GithubPullRequestList
          projectId={projectId}
          selectedPullNumber={null}
          onSelectPull={handleSelectPull}
          githubRefreshToken={githubRefreshToken}
        />
      );
  } else {
    const filesTree = (
      <ProjectFsTree
        projectId={projectId}
        selectedPath={selectedFilePath}
        onSelectFile={handleSelectFile}
        onClearSelection={() => setSelectedFilePath(null)}
        onTreeChanged={() => setFileRefreshToken((token) => token + 1)}
      />
    );

    const listBody =
      tab === "tasks" ? (
        <CodebaseProjectProperties
          projectId={projectId}
          onNameChange={onTitleChange}
        />
      ) : tab === "files" ? (
        filesTree
      ) : tab === "commits" ? (
        <GithubCommitList
          projectId={projectId}
          selectedCommitSha={selectedCommit?.sha ?? null}
          onSelectCommit={handleSelectCommit}
          githubRefreshToken={githubRefreshToken}
        />
      ) : (
        <GithubPullRequestList
          projectId={projectId}
          selectedPullNumber={selectedPull?.number ?? null}
          onSelectPull={handleSelectPull}
          githubRefreshToken={githubRefreshToken}
        />
      );

    const detailBody =
      tab === "tasks" ? (
        <View style={styles.tasksDetail}>
          <ProjectTasksPanel projectId={projectId} />
        </View>
      ) : tab === "files" ? (
        <ProjectFsFileEditor
          projectId={projectId}
          openPath={selectedFilePath}
          refreshToken={fileRefreshToken}
        />
      ) : tab === "commits" ? (
        selectedCommit ? (
          <GithubCommitDetail
            projectId={projectId}
            commit={selectedCommit}
            repository={null}
          />
        ) : (
          <GithubCommitDetailEmpty />
        )
      ) : selectedPull ? (
        <GithubPullRequestDetail
          projectId={projectId}
          pullRequest={selectedPull}
          repository={null}
        />
      ) : (
        <GithubPullRequestDetailEmpty />
      );

    body = (
      <View style={styles.splitRow}>
        <View style={styles.listPane}>
          <View style={styles.listBody}>{listBody}</View>
        </View>
        <View style={styles.detailPane}>{detailBody}</View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        <PillNav
          accessibilityLabel="Codebase project sections"
          value={tab}
          onChange={handleTabChange}
          density="content"
          items={CODEBASE_WORKBENCH_TABS.map((entry) => ({
            value: entry.id,
            label: entry.label,
          }))}
        />
      </View>
      <View
        style={[
          styles.body,
          tab !== "overview" && !usePadSplit ? styles.bodyPhonePad : null,
        ]}
      >
        {body}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    backgroundColor: colors.background,
  },
  tabs: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingTop: 4,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyPhonePad: {
    paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
  },
  splitRow: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  listPane: {
    width: LIST_PANE_WIDTH,
    flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    minHeight: 0,
  },
  listBody: {
    flex: 1,
    minHeight: 0,
  },
  detailPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  phoneTasks: {
    flex: 1,
    minHeight: 0,
  },
  tasksDetail: {
    flex: 1,
    minHeight: 0,
  },
});
