import type { Project } from "@backsteros/contracts";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getProjectAreaFilterLabel,
  isProjectArea,
  PROJECT_AREAS,
  type ProjectArea,
} from "../lib/project-areas";
import {
  getProjectStatusLabel,
  PROJECT_STATUSES,
  type ProjectStatus,
} from "../lib/project-status";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { DetailPropertiesInlineShell } from "./detail-properties-inline-shell";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { ProjectIcon } from "./project-icon";
import { ProjectStatusIcon } from "./project-status-icon";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";

type PickerKind = "status" | "area" | null;

type EditableProperty = {
  key: "status" | "area";
  label: string;
  value: string;
  icon: ReactNode;
};

/** Short unique key from a project name — mirrors desktop `entityKeyFromName`. */
function projectKeyFromName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 6);
  return (base || "prj") + Math.floor(Math.random() * 90 + 10);
}

/** Compose a new project — name, description, status, and area. */
export function CreateProjectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    area?: string | string[];
    organizationId?: string | string[];
  }>();
  const areaParam = Array.isArray(params.area) ? params.area[0] : params.area;
  const organizationIdParam = Array.isArray(params.organizationId)
    ? params.organizationId[0]
    : params.organizationId;
  const initialArea =
    areaParam && isProjectArea(areaParam) ? areaParam : null;

  const client = useMobileApiClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("backlog");
  const [area, setArea] = useState<ProjectArea | null>(initialArea);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusOptions = useMemo<PropertyOption<ProjectStatus>[]>(
    () =>
      PROJECT_STATUSES.map((value) => ({
        value,
        label: getProjectStatusLabel(value),
        icon: <ProjectStatusIcon status={value} size={14} />,
      })),
    [],
  );

  const areaOptions = useMemo<PropertyOption<ProjectArea | null>[]>(
    () => [
      {
        value: null,
        label: "No area",
        icon: <ProjectIcon size={14} />,
      },
      ...PROJECT_AREAS.map((value) => ({
        value,
        label: getProjectAreaFilterLabel(value),
        icon: <ProjectIcon size={14} color={colors.foreground} />,
      })),
    ],
    [],
  );

  const properties: EditableProperty[] = [
    {
      key: "status",
      label: "Status",
      value: getProjectStatusLabel(status),
      icon: <ProjectStatusIcon status={status} size={14} />,
    },
    {
      key: "area",
      label: "Area",
      value: area ? getProjectAreaFilterLabel(area) : "No area",
      icon: <ProjectIcon size={14} />,
    },
  ];

  const propertyChips = [
    {
      key: "status",
      label: getProjectStatusLabel(status),
      icon: <ProjectStatusIcon status={status} size={12} />,
    },
    ...(area
      ? [
          {
            key: "area",
            label: getProjectAreaFilterLabel(area),
            icon: <ProjectIcon size={12} />,
          },
        ]
      : []),
  ];

  const canCreate = name.trim().length > 0 && !saving;

  async function onCreate() {
    const trimmedName = name.trim();
    if (!trimmedName || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await client.requestJson<Project>("/api/v1/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: projectKeyFromName(trimmedName),
          name: trimmedName,
          description: description.trim() || undefined,
          status,
          area,
          organizationId: organizationIdParam || null,
          sortOrder: -Date.now(),
        }),
      });
      router.replace(`/(app)/projects/${created.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create project.",
      );
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          headerRight: () => (
            <Pressable
              onPress={() => {
                void onCreate();
              }}
              disabled={!canCreate}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Create project"
              style={({ pressed }) => ({
                minWidth: 64,
                minHeight: 36,
                alignItems: "center",
                justifyContent: "center",
                opacity: !canCreate ? 0.35 : pressed ? 0.55 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator color={colors.foreground} size="small" />
              ) : (
                <Text
                  style={{
                    color: colors.foreground,
                    fontSize: 17,
                    fontWeight: "600",
                    lineHeight: 22,
                    textAlign: "center",
                  }}
                >
                  Create
                </Text>
              )}
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={ui.screen}
        contentContainerStyle={{
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Project name"
            placeholderTextColor={colors.muted}
            autoFocus
            returnKeyType="next"
            style={{
              color: colors.foreground,
              fontSize: 24,
              fontWeight: "600",
              lineHeight: 30,
              paddingVertical: 4,
            }}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Add a description…"
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
            style={{
              color: colors.foreground,
              fontSize: 15,
              lineHeight: 22,
              minHeight: 72,
              paddingVertical: 4,
            }}
          />
        </View>

        <DetailPropertiesInlineShell
          modalTitle="Project properties"
          chips={propertyChips}
          overlay={
            <>
              <PropertyOptionSheet
                embedded
                visible={picker === "status"}
                title="Status"
                options={statusOptions}
                selected={status}
                onSelect={(value) => {
                  setStatus(value);
                  setPicker(null);
                }}
                onClose={() => setPicker(null)}
              />
              <PropertyOptionSheet
                embedded
                visible={picker === "area"}
                title="Area"
                options={areaOptions}
                selected={area}
                onSelect={(value) => {
                  setArea(value);
                  setPicker(null);
                }}
                onClose={() => setPicker(null)}
              />
            </>
          }
        >
          <DetailPropertyEditorRows
            rows={properties}
            onPressRow={(key) => setPicker(key as PickerKind)}
          />
        </DetailPropertiesInlineShell>

        {error ? (
          <Text style={[ui.error, { paddingHorizontal: 16, paddingTop: 16 }]}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}
