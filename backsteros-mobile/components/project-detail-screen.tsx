import type { Project } from "@backsteros/contracts";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useMobilePowerSync } from "../lib/powersync-context";
import {
  DEFAULT_PROJECT_SECTION,
  getProjectSectionLabel,
  PROJECT_SECTIONS,
  type ProjectSectionId,
} from "../lib/project-sections";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import {
  TabStackHeaderPlusButton,
  TabStackHeaderTextButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
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

/** Project detail shell — section pills; Tasks uses the shared grouped list. */
export function ProjectDetailScreen({ projectId, title }: Props) {
  const router = useRouter();
  const powerSync = useMobilePowerSync();

  const client = useMobileApiClient();

  const [section, setSection] = useState<ProjectSectionId>(
    DEFAULT_PROJECT_SECTION,
  );
  const [displayTitle, setDisplayTitle] = useState(title);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [overviewDescription, setOverviewDescription] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  useEffect(() => {
    setEditing(false);
    setSaveError(null);
  }, [section, projectId]);

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
    if (section === "tasks") {
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

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          headerRight: headerRight
            ? () => headerRight
            : undefined,
        }}
      />
      <View style={ui.screen}>
        {!editing ? (
          <>
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 8,
                paddingBottom: 4,
              }}
            >
              <Text style={ui.detailTitle}>{displayTitle}</Text>
            </View>
            <PillNav
              accessibilityLabel="Project sections"
              value={section}
              onChange={setSection}
              items={PROJECT_SECTIONS.map((entry) => ({
                value: entry.id,
                label: entry.label,
              }))}
            />
          </>
        ) : null}
        <View style={{ flex: 1 }}>
          {editing ? (
            <ProjectOverviewPanel
              projectId={projectId}
              editing
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
              <Text
                style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}
              >
                {getProjectSectionLabel(section)} will sync here next.
              </Text>
            </View>
          )}
        </View>
      </View>
    </>
  );
}
