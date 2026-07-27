import type { GithubCommit, GithubPullRequest } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  CODEBASE_WORKBENCH_TABS,
  DEFAULT_CODEBASE_WORKBENCH_TAB,
  type CodebaseWorkbenchTabId,
} from "../lib/codebase-workbench-tabs";
import { isPadDevice } from "../lib/device";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { colors } from "../lib/theme";
import { PillNav } from "./pill-nav";
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
import {
  ProjectFsFileEditor,
} from "./codebase/project-fs-file-editor";
import { ProjectFsTree } from "./codebase/project-fs-tree";

const LIST_PANE_WIDTH = 340;

type Props = {
  projectId: string;
  /** Bumped after returning from GitHub OAuth. */
  githubRefreshToken?: number;
  onTitleChange?: (title: string) => void;
};

/**
 * API-only codebase workbench: Tasks | Files | Commits | PRs.
 * iPad: list | detail columns. iPhone: list full-width; detail via stack push.
 */
export function CodebaseProjectWorkbench({
  projectId,
  githubRefreshToken = 0,
  onTitleChange,
}: Props) {
  const router = useRouter();
  const isPad = isPadDevice();

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

  const handleTabChange = useCallback((next: CodebaseWorkbenchTabId) => {
    setTab(next);
    if (next !== "commits") setSelectedCommit(null);
    if (next !== "pulls") setSelectedPull(null);
    if (next !== "files") setSelectedFilePath(null);
  }, []);

  const handleSelectCommit = useCallback(
    (commit: GithubCommit) => {
      setSelectedCommit(commit);
      if (!isPad) {
        router.push({
          pathname: "/project/[id]/commit/[sha]",
          params: { id: projectId, sha: commit.sha },
        });
      }
    },
    [isPad, projectId, router],
  );

  const handleSelectPull = useCallback(
    (pull: GithubPullRequest) => {
      setSelectedPull(pull);
      if (!isPad) {
        router.push({
          pathname: "/project/[id]/pull/[number]",
          params: { id: projectId, number: String(pull.number) },
        });
      }
    },
    [isPad, projectId, router],
  );

  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedFilePath(path);
      if (!isPad) {
        router.push({
          pathname: "/project/[id]/file",
          params: { id: projectId, path },
        });
      }
    },
    [isPad, projectId, router],
  );

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

  const tabs = (
    <View style={styles.tabs}>
      <PillNav
        accessibilityLabel="Codebase workbench"
        value={tab}
        onChange={handleTabChange}
        density="content"
        items={CODEBASE_WORKBENCH_TABS.map((entry) => ({
          value: entry.id,
          label: entry.label,
        }))}
      />
    </View>
  );

  if (!isPad) {
    const phoneBody =
      tab === "tasks" ? (
        <View style={styles.phoneTasks}>
          <View style={styles.phoneProperties}>
            <CodebaseProjectProperties
              projectId={projectId}
              onNameChange={onTitleChange}
            />
          </View>
          <View style={styles.tasksDetail}>
            <ProjectTasksPanel projectId={projectId} />
          </View>
        </View>
      ) : (
        listBody
      );

    return (
      <View style={styles.rootPhone}>
        {tabs}
        <View style={styles.phoneBody}>{phoneBody}</View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.listPane}>
        {tabs}
        <View style={styles.listBody}>{listBody}</View>
      </View>
      <View style={styles.detailPane}>{detailBody}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    backgroundColor: colors.background,
  },
  rootPhone: {
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    backgroundColor: colors.background,
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
  phoneBody: {
    flex: 1,
    minHeight: 0,
    paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
  },
  phoneTasks: {
    flex: 1,
    minHeight: 0,
  },
  phoneProperties: {
    maxHeight: 280,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabs: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingTop: 4,
  },
  tasksDetail: {
    flex: 1,
    minHeight: 0,
  },
});
