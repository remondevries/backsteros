import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CodebaseProjectWorkbench } from "./codebase-project-workbench-lazy";
import {
  FLOATING_BOTTOM_RIGHT_PLUS_CLEARANCE,
  FloatingBottomRightPlusButton,
} from "./floating-bottom-right-plus-button";
import {
  CODEBASE_WORKBENCH_TABS,
  DEFAULT_CODEBASE_WORKBENCH_TAB,
  type CodebaseWorkbenchTabId,
} from "../lib/codebase-workbench-tabs";
import { isPadDevice } from "../lib/device";
import {
  DEFAULT_PROJECT_SECTION,
  getProjectSectionLabel,
  PROJECT_SECTIONS,
  type ProjectSectionId,
} from "../lib/project-sections";
import { migrateLegacyProjectType } from "../lib/project-type";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import {
  TabStackHeaderPlusButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEnsureProjectVault } from "../lib/use-ensure-project-vault";
import { useEntitySoftDelete } from "../lib/use-entity-soft-delete";
import { useLocalQuery } from "../lib/use-local-query";
import { useSectionTabShortcuts } from "../lib/use-section-tab-shortcuts";
import { DetailContentContainer } from "./detail-content-container";
import { DetailHeaderDeleteButton } from "./detail-header-delete-button";
import { ProjectDetailHeader } from "./project-detail-header";
import { ProjectDocumentsPanel } from "./project-documents-panel";
import { ProjectLettersPanel } from "./project-letters-panel";
import { ProjectOverviewPanel } from "./project-overview-panel";
import { ProjectTasksPanel } from "./project-tasks-panel";

type Props = {
  projectId: string;
  title: string;
};

const CREATE_SECTIONS = new Set<ProjectSectionId>([
  "tasks",
  "documents",
  "letters",
]);

type ProjectMetaRow = {
  type: string | null;
  icon: string | null;
};

const META_SQL = `SELECT type, icon FROM projects
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

function headerRightActions(actions: ReactNode) {
  return <View style={styles.headerRightCluster}>{actions}</View>;
}

/** Project detail shell — title + tabs in header; overview is always-edit. */
export function ProjectDetailScreen({ projectId, title }: Props) {
  const router = useRouter();
  const isPad = isPadDevice();
  const { confirmAndDelete } = useEntitySoftDelete();
  useEnsureProjectVault(projectId);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/projects");
  }, [router]);

  const { data: metaRows, isLoading: metaLoading } =
    useLocalQuery<ProjectMetaRow>(META_SQL, [projectId]);
  const projectType = migrateLegacyProjectType(metaRows?.[0]?.type);
  const projectIcon = metaRows?.[0]?.icon ?? null;
  const metaReady = !metaLoading || metaRows.length > 0;
  const isCodebase = metaReady && projectType === "codebase";

  const [section, setSection] = useState<ProjectSectionId>(
    DEFAULT_PROJECT_SECTION,
  );
  const [codebaseTab, setCodebaseTab] = useState<CodebaseWorkbenchTabId>(
    DEFAULT_CODEBASE_WORKBENCH_TAB,
  );
  const [displayTitle, setDisplayTitle] = useState(title);
  const [githubRefreshToken, setGithubRefreshToken] = useState(0);
  const [filesCreateSignal, setFilesCreateSignal] = useState(0);

  const onDeleteProject = useCallback(() => {
    confirmAndDelete("projects", projectId, displayTitle);
  }, [confirmAndDelete, displayTitle, projectId]);

  useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  useEffect(() => {
    setCodebaseTab(DEFAULT_CODEBASE_WORKBENCH_TAB);
    setSection(DEFAULT_PROJECT_SECTION);
  }, [projectId]);

  useEffect(() => {
    if (!isCodebase) return;
    setGithubRefreshToken((token) => token + 1);
  }, [isCodebase, projectId]);

  const onDefaultSectionTabIndex = useCallback((index: number) => {
    const next = PROJECT_SECTIONS[index];
    if (next) setSection(next.id);
  }, []);

  const onCodebaseSectionTabIndex = useCallback((index: number) => {
    const next = CODEBASE_WORKBENCH_TABS[index];
    if (next) setCodebaseTab(next.id);
  }, []);

  useSectionTabShortcuts({
    enabled: metaReady && !isCodebase,
    sectionCount: PROJECT_SECTIONS.length,
    onSelectIndex: onDefaultSectionTabIndex,
  });

  useSectionTabShortcuts({
    enabled: metaReady && isCodebase,
    sectionCount: CODEBASE_WORKBENCH_TABS.length,
    onSelectIndex: onCodebaseSectionTabIndex,
  });

  const onPressCreate = useCallback(() => {
    if (section === "tasks" || isCodebase) {
      router.push({
        pathname: "/create/task",
        params: { projectId },
      });
      return;
    }
    if (section === "documents") {
      router.push({
        pathname: "/create/document",
        params: { projectId },
      });
      return;
    }
    if (section === "letters") {
      router.push({
        pathname: "/create/letter",
        params: { projectId },
      });
    }
  }, [isCodebase, projectId, router, section]);

  const showPhoneFloatingCreate =
    !isPad &&
    (isCodebase
      ? codebaseTab === "tasks" || codebaseTab === "files"
      : CREATE_SECTIONS.has(section));

  const floatingCreateLabel = isCodebase
    ? codebaseTab === "files"
      ? "Create file or folder"
      : "Create task"
    : section === "tasks"
      ? "Create task"
      : section === "documents"
        ? "Create document"
        : "Create letter";

  const onPressFloatingCreate = useCallback(() => {
    if (isCodebase && codebaseTab === "files") {
      setFilesCreateSignal((value) => value + 1);
      return;
    }
    onPressCreate();
  }, [codebaseTab, isCodebase, onPressCreate]);

  const deleteAction = (
    <DetailHeaderDeleteButton onDelete={onDeleteProject} />
  );

  const padCreateAction =
    !isPad || isCodebase
      ? null
      : CREATE_SECTIONS.has(section) ? (
          <TabStackHeaderPlusButton
            onPress={onPressCreate}
            accessibilityLabel={
              section === "tasks"
                ? "Create task"
                : section === "documents"
                  ? "Create document"
                  : "Create letter"
            }
          />
        ) : null;

  const headerRight = headerRightActions(
    <>
      {padCreateAction}
      {deleteAction}
    </>,
  );

  const loadingHeader = (
    <ProjectDetailHeader
      title=""
      tab={DEFAULT_PROJECT_SECTION}
      onTabChange={() => {}}
      tabItems={[]}
      tabsAccessibilityLabel="Project sections"
      onBack={handleBack}
      minimal
    />
  );

  if (!metaReady) {
    return (
      <>
        <Stack.Screen
          options={{
            ...tabDetailScreenOptions(),
            header: () => loadingHeader,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <View style={[ui.screen, styles.loading]}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </>
    );
  }

  if (isCodebase) {
    return (
      <>
        <Stack.Screen
          options={{
            ...tabDetailScreenOptions(),
            header: () => (
              <ProjectDetailHeader
                title={displayTitle}
                icon={projectIcon}
                projectType={projectType}
                tab={codebaseTab}
                onTabChange={setCodebaseTab}
                tabItems={CODEBASE_WORKBENCH_TABS.map((entry) => ({
                  value: entry.id,
                  label: entry.label,
                }))}
                tabsAccessibilityLabel="Codebase project sections"
                onBack={handleBack}
                headerRight={headerRight}
              />
            ),
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <View style={ui.screen}>
          <View
            style={{
              flex: 1,
              paddingBottom: showPhoneFloatingCreate
                ? FLOATING_BOTTOM_RIGHT_PLUS_CLEARANCE
                : 0,
            }}
          >
            <CodebaseProjectWorkbench
              projectId={projectId}
              githubRefreshToken={githubRefreshToken}
              onTitleChange={setDisplayTitle}
              tab={codebaseTab}
              onTabChange={setCodebaseTab}
              showInlineTabs={false}
              filesCreateSignal={filesCreateSignal}
            />
          </View>
          <FloatingBottomRightPlusButton
            visible={showPhoneFloatingCreate}
            onPress={onPressFloatingCreate}
            accessibilityLabel={floatingCreateLabel}
          />
        </View>
      </>
    );
  }

  const sectionBody =
    section === "tasks" ? (
      <ProjectTasksPanel projectId={projectId} />
    ) : section === "documents" ? (
      <ProjectDocumentsPanel projectId={projectId} />
    ) : section === "letters" ? (
      <ProjectLettersPanel projectId={projectId} />
    ) : section === "overview" ? (
      <ProjectOverviewPanel
        projectId={projectId}
        layout={isPad ? "wide" : "stacked"}
        onNameChange={setDisplayTitle}
      />
    ) : (
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
      >
        {isPad ? (
          <DetailContentContainer>
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
              {getProjectSectionLabel(section)} will sync here next.
            </Text>
          </DetailContentContainer>
        ) : (
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
            {getProjectSectionLabel(section)} will sync here next.
          </Text>
        )}
      </View>
    );

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          header: () => (
            <ProjectDetailHeader
              title={displayTitle}
              icon={projectIcon}
              projectType={projectType}
              tab={section}
              onTabChange={setSection}
              tabItems={PROJECT_SECTIONS.map((entry) => ({
                value: entry.id,
                label: entry.label,
              }))}
              tabsAccessibilityLabel="Project sections"
              onBack={handleBack}
              headerRight={headerRight}
            />
          ),
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <View style={ui.screen}>
        <View
          style={{
            flex: 1,
            paddingBottom: showPhoneFloatingCreate
              ? FLOATING_BOTTOM_RIGHT_PLUS_CLEARANCE
              : 0,
          }}
        >
          {sectionBody}
        </View>
        <FloatingBottomRightPlusButton
          visible={showPhoneFloatingCreate}
          onPress={onPressFloatingCreate}
          accessibilityLabel={floatingCreateLabel}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerRightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
});
