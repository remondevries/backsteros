import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CodebaseProjectWorkbench } from "./codebase-project-workbench";
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
  TabStackHeaderBackButton,
  TabStackHeaderPlusButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEnsureProjectVault } from "../lib/use-ensure-project-vault";
import { useLocalQuery } from "../lib/use-local-query";
import { useSectionTabShortcuts } from "../lib/use-section-tab-shortcuts";
import { DetailContentContainer } from "./detail-content-container";
import { ContentPageTitle } from "./content-page-title";
import { PillNav, type PillNavItem } from "./pill-nav";
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

type ProjectTypeRow = {
  type: string | null;
};

const TYPE_SQL = `SELECT type FROM projects
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

/**
 * Section pills for the native header. Sized to content only so the strip
 * cannot steal taps from the Back control.
 */
function centeredHeaderSectionTabs<T extends string>({
  accessibilityLabel,
  value,
  onChange,
  items,
}: {
  accessibilityLabel: string;
  value: T;
  onChange: (next: T) => void;
  items: readonly PillNavItem<T>[];
}): ReactNode {
  return (
    <View style={styles.headerTitleClusterCenter} pointerEvents="box-none">
      <View pointerEvents="auto">
        <PillNav
          accessibilityLabel={accessibilityLabel}
          value={value}
          onChange={onChange}
          align="center"
          density="header"
          items={items}
        />
      </View>
    </View>
  );
}

/**
 * iPad codebase header — Back is its own control; project name sits beside it
 * but is NOT inside `headerLeft` (iOS liquid glass wraps that slot into one
 * button, which reads as “back to {project}”). Tabs stay absolutely centered.
 */
function CodebasePadHeader({
  title,
  tab,
  onTabChange,
  onBack,
}: {
  title: string;
  tab: CodebaseWorkbenchTabId;
  onTabChange: (next: CodebaseWorkbenchTabId) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.padHeader,
        {
          paddingTop: Math.max(insets.top, 8),
          backgroundColor: colors.background,
        },
      ]}
    >
      <View style={styles.padHeaderBar}>
        <View style={styles.padHeaderLeft} pointerEvents="box-none">
          <TabStackHeaderBackButton onPress={onBack} />
          <Text
            accessibilityRole="header"
            pointerEvents="none"
            style={styles.padHeaderTitle}
            numberOfLines={1}
          >
            {title.trim() || "Untitled"}
          </Text>
        </View>
        <View style={styles.padHeaderCenter} pointerEvents="box-none">
          <PillNav
            accessibilityLabel="Codebase project sections"
            value={tab}
            onChange={onTabChange}
            align="center"
            density="header"
            items={CODEBASE_WORKBENCH_TABS.map((entry) => ({
              value: entry.id,
              label: entry.label,
            }))}
          />
        </View>
        {/* Balance the left cluster so centered tabs stay optically centered. */}
        <View style={styles.padHeaderRightSpacer} pointerEvents="none" />
      </View>
    </View>
  );
}

const CENTERED_HEADER_TITLE_OPTIONS = {
  headerTitleAlign: "center" as const,
  // Keep the default title slot — do not stretch edge-to-edge or Back becomes
  // untappable under the title container.
  headerTitleContainerStyle: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  title: "",
  headerBackVisible: false,
};

/** Project detail shell — section pills; overview is always-edit. */
export function ProjectDetailScreen({ projectId, title }: Props) {
  const router = useRouter();
  const isPad = isPadDevice();
  useEnsureProjectVault(projectId);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // Deep link / empty history — return to the projects list.
    router.replace("/projects");
  }, [router]);

  const { data: typeRows, isLoading: typeLoading } =
    useLocalQuery<ProjectTypeRow>(TYPE_SQL, [projectId]);
  const projectType = migrateLegacyProjectType(typeRows?.[0]?.type);
  const typeReady = !typeLoading || typeRows.length > 0;
  const isCodebase = typeReady && projectType === "codebase";

  const [section, setSection] = useState<ProjectSectionId>(
    DEFAULT_PROJECT_SECTION,
  );
  const [codebaseTab, setCodebaseTab] = useState<CodebaseWorkbenchTabId>(
    DEFAULT_CODEBASE_WORKBENCH_TAB,
  );
  const [displayTitle, setDisplayTitle] = useState(title);
  const [githubRefreshToken, setGithubRefreshToken] = useState(0);

  useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  useEffect(() => {
    setCodebaseTab(DEFAULT_CODEBASE_WORKBENCH_TAB);
    setSection(DEFAULT_PROJECT_SECTION);
  }, [projectId]);

  // Refresh GitHub lists when returning to the screen (e.g. after Settings OAuth).
  useEffect(() => {
    if (!isCodebase) return;
    setGithubRefreshToken((token) => token + 1);
  }, [isCodebase, projectId]);

  const showPageTitle = !isCodebase && section !== "overview";

  const onDefaultSectionTabIndex = useCallback((index: number) => {
    const next = PROJECT_SECTIONS[index];
    if (next) setSection(next.id);
  }, []);

  const onCodebaseSectionTabIndex = useCallback((index: number) => {
    const next = CODEBASE_WORKBENCH_TABS[index];
    if (next) setCodebaseTab(next.id);
  }, []);

  useSectionTabShortcuts({
    enabled: typeReady && !isCodebase,
    sectionCount: PROJECT_SECTIONS.length,
    onSelectIndex: onDefaultSectionTabIndex,
  });

  useSectionTabShortcuts({
    enabled: typeReady && isCodebase,
    sectionCount: CODEBASE_WORKBENCH_TABS.length,
    onSelectIndex: onCodebaseSectionTabIndex,
  });

  function onPressCreate() {
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
  }

  const backHeaderLeft = () => (
    <TabStackHeaderBackButton onPress={handleBack} />
  );

  // Wait for project type so we don't flash default-header tabs then drop them
  // under Back when the row resolves as codebase.
  if (!typeReady) {
    return (
      <>
        <Stack.Screen
          options={{
            ...tabDetailScreenOptions(),
            ...CENTERED_HEADER_TITLE_OPTIONS,
            headerLeft: backHeaderLeft,
            headerTitle: () => null,
          }}
        />
        <View style={[ui.screen, styles.loading]}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </>
    );
  }

  if (isCodebase) {
    const overviewActive = codebaseTab === "overview";
    const createTrailing =
      overviewActive || isPad ? null : (
        <TabStackHeaderPlusButton
          onPress={onPressCreate}
          accessibilityLabel="Create task"
        />
      );
    return (
      <>
        <Stack.Screen
          options={
            isPad
              ? {
                  ...tabDetailScreenOptions(),
                  header: () => (
                    <CodebasePadHeader
                      title={displayTitle}
                      tab={codebaseTab}
                      onTabChange={setCodebaseTab}
                      onBack={handleBack}
                    />
                  ),
                  contentStyle: { backgroundColor: colors.background },
                }
              : {
                  ...tabDetailScreenOptions(),
                  ...CENTERED_HEADER_TITLE_OPTIONS,
                  headerLeft: backHeaderLeft,
                  headerStyle: { backgroundColor: colors.background },
                  contentStyle: { backgroundColor: colors.background },
                  headerTitle: () =>
                    centeredHeaderSectionTabs({
                      accessibilityLabel: "Codebase project sections",
                      value: codebaseTab,
                      onChange: setCodebaseTab,
                      items: CODEBASE_WORKBENCH_TABS.map((entry) => ({
                        value: entry.id,
                        label: entry.label,
                      })),
                    }),
                }
          }
        />
        <View style={ui.screen}>
          {!overviewActive && !isPad ? (
            <ContentPageTitle title={displayTitle} trailing={createTrailing} />
          ) : null}
          <CodebaseProjectWorkbench
            projectId={projectId}
            githubRefreshToken={githubRefreshToken}
            onTitleChange={setDisplayTitle}
            tab={codebaseTab}
            onTabChange={setCodebaseTab}
            showInlineTabs={false}
          />
        </View>
      </>
    );
  }

  const createTrailing = CREATE_SECTIONS.has(section) ? (
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

  const sectionBody =
    section === "tasks" ? (
      <>
        <ContentPageTitle title={displayTitle} trailing={createTrailing} />
        <ProjectTasksPanel projectId={projectId} />
      </>
    ) : section === "documents" ? (
      <>
        <ContentPageTitle title={displayTitle} trailing={createTrailing} />
        <ProjectDocumentsPanel projectId={projectId} />
      </>
    ) : section === "letters" ? (
      <>
        <ContentPageTitle title={displayTitle} trailing={createTrailing} />
        <ProjectLettersPanel projectId={projectId} />
      </>
    ) : section === "overview" ? (
      <ProjectOverviewPanel
        projectId={projectId}
        layout={isPad ? "wide" : "stacked"}
        onNameChange={setDisplayTitle}
      />
    ) : (
      <>
        {showPageTitle ? <ContentPageTitle title={displayTitle} /> : null}
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
              <Text
                style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}
              >
                {getProjectSectionLabel(section)} will sync here next.
              </Text>
            </DetailContentContainer>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
              {getProjectSectionLabel(section)} will sync here next.
            </Text>
          )}
        </View>
      </>
    );

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          ...CENTERED_HEADER_TITLE_OPTIONS,
          headerLeft: backHeaderLeft,
          headerTitle: () =>
            centeredHeaderSectionTabs({
              accessibilityLabel: "Project sections",
              value: section,
              onChange: setSection,
              items: PROJECT_SECTIONS.map((entry) => ({
                value: entry.id,
                label: entry.label,
              })),
            }),
        }}
      />
      <View style={ui.screen}>
        <View style={{ flex: 1 }}>{sectionBody}</View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleClusterCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  padHeader: {
    borderBottomWidth: 0,
  },
  padHeaderBar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  padHeaderLeft: {
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "42%",
    gap: 10,
  },
  padHeaderTitle: {
    flexShrink: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.02 * 17,
  },
  padHeaderCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  padHeaderRightSpacer: {
    marginLeft: "auto",
    width: 36,
    flexShrink: 0,
  },
});
