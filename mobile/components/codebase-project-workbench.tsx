import type { GithubCommit, GithubPullRequest } from "@backsteros/contracts";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CODEBASE_PAD_SPLIT_MIN_WIDTH,
  CODEBASE_WORKBENCH_TABS,
  type CodebaseWorkbenchTabId,
} from "../lib/codebase-workbench-tabs";
import { isPadDevice } from "../lib/device";
import {
  PAD_CONTENT_INSET,
  usePadSidePanelCollapsed,
} from "../lib/pad-side-panel-collapse";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { colors } from "../lib/theme";
import { PillNav } from "./pill-nav";
import { ProjectDocumentsPanel } from "./project-documents-panel";
import { ProjectOverviewPanel } from "./project-overview-panel";
import { ProjectTasksPanel } from "./project-tasks-panel";
import { ProjectsSidePanelIcon } from "./projects-side-panel-icon";
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
/** Matches task detail collapsed rail (`TASK_DETAIL_COLLAPSED_RAIL_WIDTH`). */
const LIST_COLLAPSED_RAIL_WIDTH = 46;

type Props = {
  projectId: string;
  /** Bumped after returning from GitHub OAuth. */
  githubRefreshToken?: number;
  onTitleChange?: (title: string) => void;
  /** Controlled workbench tab (parent owns header chrome). */
  tab: CodebaseWorkbenchTabId;
  onTabChange: (tab: CodebaseWorkbenchTabId) => void;
  /**
   * When false, the parent renders the tab strip (stack header).
   * Phone may still render an inline strip when true.
   */
  showInlineTabs?: boolean;
  onDescriptionLoaded?: (description: string) => void;
  /** Phone FAB — open Files create picker when incremented. */
  filesCreateSignal?: number;
};

/**
 * Codebase workbench tabs: Overview | Tasks | Files | Documents | Commits | PRs.
 * Overview uses the same ProjectOverviewPanel as default projects.
 * Documents uses ProjectDocumentsPanel (desktop Docs tab parity).
 * iPad: Tasks/Files/Commits/PRs use list|detail columns; Documents is full-width
 * like Overview. Project name lives in the stack header next to Back.
 * Left pane can collapse like task detail (⇧[ parity).
 * iPhone: single-column lists (detail pushed on the stack).
 */
export function CodebaseProjectWorkbench({
  projectId,
  githubRefreshToken = 0,
  onTitleChange,
  tab,
  onTabChange,
  showInlineTabs = true,
  onDescriptionLoaded,
  filesCreateSignal = 0,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isPad = isPadDevice();
  const usePadSplit =
    isPad && windowWidth >= CODEBASE_PAD_SPLIT_MIN_WIDTH;
  // Content sits under the stack header — only canvas inset, not status-bar.
  const listCardBottomInset = Math.max(insets.bottom, PAD_CONTENT_INSET);
  const { collapsed: listCollapsed, setCollapsed: setListCollapsed } =
    usePadSidePanelCollapsed("codebase-project-workbench");

  const [selectedCommit, setSelectedCommit] = useState<GithubCommit | null>(
    null,
  );
  const [selectedPull, setSelectedPull] = useState<GithubPullRequest | null>(
    null,
  );
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileRefreshToken, setFileRefreshToken] = useState(0);

  const handleTabChange = useCallback(
    (next: CodebaseWorkbenchTabId) => {
      onTabChange(next);
      if (next !== "commits") setSelectedCommit(null);
      if (next !== "pulls") setSelectedPull(null);
      if (next !== "files") setSelectedFilePath(null);
    },
    [onTabChange],
  );

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
        layout={usePadSplit || isPad ? "wide" : "stacked"}
        onDescriptionLoaded={onDescriptionLoaded}
        onNameChange={onTitleChange}
      />
    );
  } else if (tab === "docs") {
    body = (
      <View style={styles.phoneTasks}>
        <ProjectDocumentsPanel projectId={projectId} />
      </View>
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
          filesCreateSignal={filesCreateSignal}
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

    const detailPane = (
      <View
        style={[
          styles.detailPane,
          {
            paddingTop: PAD_CONTENT_INSET,
            paddingRight: PAD_CONTENT_INSET,
            paddingBottom: listCardBottomInset,
          },
        ]}
      >
        {detailBody}
      </View>
    );

    if (listCollapsed) {
      body = (
        <View style={styles.splitRow}>
          <View
            style={[
              styles.listCollapsedRail,
              { paddingTop: PAD_CONTENT_INSET },
            ]}
            accessibilityLabel="Project side panel collapsed"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show project side panel"
              accessibilityState={{ expanded: false }}
              hitSlop={8}
              onPress={() => setListCollapsed(false)}
              style={({ pressed }) => [
                styles.listToggle,
                pressed ? { opacity: 0.55 } : null,
              ]}
            >
              <ProjectsSidePanelIcon
                size={18}
                collapsed
                color={colors.foreground}
              />
            </Pressable>
          </View>
          {detailPane}
        </View>
      );
    } else {
      body = (
        <View style={styles.splitRow}>
          {/*
            Same floating surface card as task detail (`CodebaseTaskLayout`
            detailCard) — rounded border on the black canvas.
          */}
          <View
            style={[
              styles.listSlot,
              {
                paddingTop: PAD_CONTENT_INSET,
                paddingLeft: PAD_CONTENT_INSET,
                paddingBottom: listCardBottomInset,
              },
            ]}
            accessibilityLabel="Project details"
          >
            <View style={styles.listCard}>
              <View style={styles.listChrome}>
                <View style={styles.listChromeSpacer} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Hide project side panel"
                  accessibilityState={{ expanded: true }}
                  hitSlop={8}
                  onPress={() => setListCollapsed(true)}
                  style={({ pressed }) => [
                    styles.listToggle,
                    pressed ? { opacity: 0.55 } : null,
                  ]}
                >
                  <ProjectsSidePanelIcon size={18} color={colors.foreground} />
                </Pressable>
              </View>
              <View style={styles.listBody}>{listBody}</View>
            </View>
          </View>
          {detailPane}
        </View>
      );
    }
  }

  return (
    <View style={styles.root}>
      {showInlineTabs && !isPad ? (
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
      ) : null}
      <View
        style={[
          styles.body,
          // Tab bar is hidden on project detail (phone). List panes that use
          // `embedded` FlashLists still need clearance for the home indicator /
          // create FAB; Overview + Documents fill the canvas (Documents uses
          // BacksterFlashList’s content inset instead of shrinking the pane).
          tab !== "overview" && tab !== "docs" && !usePadSplit
            ? styles.bodyPhonePad
            : null,
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
  listSlot: {
    width: LIST_PANE_WIDTH + PAD_CONTENT_INSET,
    flexShrink: 0,
    minHeight: 0,
  },
  listCard: {
    flex: 1,
    minHeight: 0,
    width: LIST_PANE_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  listChrome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 2,
  },
  listChromeSpacer: {
    flex: 1,
  },
  listToggle: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginRight: -6,
  },
  listCollapsedRail: {
    width: LIST_COLLAPSED_RAIL_WIDTH,
    flexShrink: 0,
    alignItems: "center",
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
