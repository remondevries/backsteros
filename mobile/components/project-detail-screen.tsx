import type { Project } from "@backsteros/contracts";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { CodebaseProjectWorkbench } from "./codebase-project-workbench";
import {
  DEFAULT_CODEBASE_PHONE_SECTION,
  type CodebasePhoneSectionId,
} from "../lib/codebase-workbench-tabs";
import { isPadDevice } from "../lib/device";
import { useMobilePowerSync } from "../lib/powersync-context";
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
  TabStackHeaderTextButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEnsureProjectVault } from "../lib/use-ensure-project-vault";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSectionTabShortcuts } from "../lib/use-section-tab-shortcuts";
import { DetailContentContainer } from "./detail-content-container";
import { useFadingHeaderTitleOpacity } from "./fading-header-title";
import { PillNav } from "./pill-nav";
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

/** Project detail shell — section pills; Tasks uses the shared grouped list. */
export function ProjectDetailScreen({ projectId, title }: Props) {
  const router = useRouter();
  const powerSync = useMobilePowerSync();
  const isPad = isPadDevice();
  const client = useMobileApiClient();
  useEnsureProjectVault(projectId);

  const { data: typeRows } = useLocalQuery<ProjectTypeRow>(TYPE_SQL, [
    projectId,
  ]);
  const projectType = migrateLegacyProjectType(typeRows?.[0]?.type);
  const isCodebase = projectType === "codebase";

  const [section, setSection] = useState<ProjectSectionId>(
    DEFAULT_PROJECT_SECTION,
  );
  const [phoneCodebaseSection, setPhoneCodebaseSection] =
    useState<CodebasePhoneSectionId>(DEFAULT_CODEBASE_PHONE_SECTION);
  const [displayTitle, setDisplayTitle] = useState(title);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [overviewDescription, setOverviewDescription] = useState<string | null>(
    null,
  );
  const [githubRefreshToken, setGithubRefreshToken] = useState(0);

  useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  useEffect(() => {
    setEditing(false);
    setSaveError(null);
  }, [section, projectId]);

  useEffect(() => {
    setPhoneCodebaseSection(DEFAULT_CODEBASE_PHONE_SECTION);
  }, [projectId]);

  // Refresh GitHub lists when returning to the screen (e.g. after Settings OAuth).
  useEffect(() => {
    if (!isCodebase) return;
    setGithubRefreshToken((token) => token + 1);
  }, [isCodebase, projectId]);

  const showHeaderProjectName =
    !editing && !isCodebase && section !== "overview";
  const headerProjectNameOpacity =
    useFadingHeaderTitleOpacity(showHeaderProjectName);
  const headerProjectNameStyle = useAnimatedStyle(() => ({
    opacity: headerProjectNameOpacity.value,
    maxHeight: 14 * headerProjectNameOpacity.value,
    marginBottom: 3 * headerProjectNameOpacity.value,
  }));

  const onSectionTabIndex = useCallback((index: number) => {
    const next = PROJECT_SECTIONS[index];
    if (next) setSection(next.id);
  }, []);

  useSectionTabShortcuts({
    enabled: !editing && !isCodebase,
    sectionCount: PROJECT_SECTIONS.length,
    onSelectIndex: onSectionTabIndex,
  });

  const startEditing = useCallback(() => {
    setDraftName(displayTitle);
    setDraftDescription(overviewDescription ?? "");
    setSaveError(null);
    setEditing(true);
  }, [displayTitle, overviewDescription]);

  async function saveEditing() {
    const trimmedName = draftName.trim();
    if (!trimmedName || saving) return;
    setSaving(true);
    setSaveError(null);
    const nextDescription = draftDescription;
    const patchBody = {
      name: trimmedName,
      description: nextDescription,
    };
    try {
      if (powerSync.ready) {
        await powerSync.patchProject(projectId, patchBody);
        try {
          await client.requestJson<Project>(
            `/api/v1/projects/${encodeURIComponent(projectId)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(patchBody),
            },
          );
        } catch {
          // Local write remains source of truth if REST fails.
        }
      } else {
        await client.requestJson<Project>(
          `/api/v1/projects/${encodeURIComponent(projectId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patchBody),
          },
        );
      }
      setDisplayTitle(trimmedName);
      setOverviewDescription(nextDescription);
      setEditing(false);
      setDraftName("");
      setDraftDescription("");
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : "Could not save project.",
      );
    } finally {
      setSaving(false);
    }
  }

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

  if (isCodebase && !editing) {
    const phoneOverviewActive = phoneCodebaseSection === "overview";
    return (
      <>
        <Stack.Screen
          options={{
            ...tabDetailScreenOptions(),
            headerTitleAlign: "center",
            headerTitle: () => (
              <View style={styles.headerTitleCluster}>
                <Text
                  numberOfLines={1}
                  style={styles.headerProjectName}
                  accessibilityRole="header"
                >
                  {displayTitle}
                </Text>
              </View>
            ),
            headerRight: () =>
              phoneOverviewActive ? (
                <TabStackHeaderTextButton
                  label="Edit"
                  onPress={startEditing}
                />
              ) : (
                <TabStackHeaderPlusButton
                  chrome="plain"
                  onPress={onPressCreate}
                  accessibilityLabel="Create task"
                />
              ),
          }}
        />
        <View style={ui.screen}>
          <CodebaseProjectWorkbench
            projectId={projectId}
            githubRefreshToken={githubRefreshToken}
            onTitleChange={setDisplayTitle}
            onPhoneSectionChange={setPhoneCodebaseSection}
            descriptionOverride={overviewDescription}
            onDescriptionLoaded={setOverviewDescription}
          />
        </View>
      </>
    );
  }

  const headerRight = editing ? (
    <TabStackHeaderTextButton
      label="Save"
      onPress={() => {
        void saveEditing();
      }}
      loading={saving}
      disabled={saving || !draftName.trim()}
    />
  ) : section === "overview" ? (
    <TabStackHeaderTextButton label="Edit" onPress={startEditing} />
  ) : CREATE_SECTIONS.has(section) ? (
    <TabStackHeaderPlusButton
      chrome="plain"
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

  const sectionBody = editing ? (
    <ProjectOverviewPanel
      projectId={projectId}
      editing
      layout={isPad ? "wide" : "stacked"}
      draftName={draftName}
      draftDescription={draftDescription}
      onDraftNameChange={setDraftName}
      onDraftDescriptionChange={setDraftDescription}
      saveError={saveError}
    />
  ) : section === "tasks" ? (
    <ProjectTasksPanel projectId={projectId} />
  ) : section === "documents" ? (
    <ProjectDocumentsPanel projectId={projectId} />
  ) : section === "letters" ? (
    <ProjectLettersPanel projectId={projectId} />
  ) : section === "overview" ? (
    <ProjectOverviewPanel
      projectId={projectId}
      layout={isPad ? "wide" : "stacked"}
      descriptionOverride={overviewDescription}
      onDescriptionLoaded={setOverviewDescription}
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
          headerTitleAlign: "center",
          headerTitle: editing
            ? () => null
            : () => (
                <View style={styles.headerTitleCluster}>
                  <Animated.View
                    style={[styles.headerProjectNameWrap, headerProjectNameStyle]}
                    accessibilityElementsHidden={!showHeaderProjectName}
                    importantForAccessibility={
                      showHeaderProjectName ? "yes" : "no-hide-descendants"
                    }
                  >
                    <Text
                      numberOfLines={1}
                      style={styles.headerProjectName}
                      accessibilityRole="header"
                    >
                      {displayTitle}
                    </Text>
                  </Animated.View>
                  <PillNav
                    accessibilityLabel="Project sections"
                    value={section}
                    onChange={setSection}
                    align="center"
                    density="header"
                    items={PROJECT_SECTIONS.map((entry) => ({
                      value: entry.id,
                      label: entry.label,
                    }))}
                  />
                </View>
              ),
          headerRight: headerRight ? () => headerRight : undefined,
        }}
      />
      <View style={ui.screen}>
        <View style={{ flex: 1 }}>{sectionBody}</View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerTitleCluster: {
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 360,
  },
  headerProjectNameWrap: {
    overflow: "hidden",
    alignItems: "center",
    maxWidth: 320,
  },
  headerProjectName: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 14,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 320,
  },
});
