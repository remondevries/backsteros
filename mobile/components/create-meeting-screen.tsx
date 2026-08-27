import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { createMeetingViaPowerSyncOrApi } from "../lib/meeting-create";
import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import { tabDetailScreenOptions } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import { useMobilePowerSync } from "../lib/powersync-context";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { DetailPropertyEditorRows } from "./detail-property-editor-rows";
import { KeyboardAwareScrollView } from "./keyboard-aware-scroll-view";
import { MeetingDateTimePropertySheet } from "./meeting-datetime-property-sheet";
import { OrganizationIcon } from "./organization-icon";
import { ProjectOcticon } from "./project-octicon";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
import { TextInput } from "./app-text-input";

type PickerKind = "start" | "end" | "project" | "organization" | null;

type NamedOptionRow = {
  id: string;
  name: string | null;
  key?: string | null;
  icon?: string | null;
  type?: string | null;
};

const PROJECTS_SQL = `SELECT id, name, key, icon, type FROM projects
 WHERE deleted_at IS NULL
 ORDER BY name COLLATE NOCASE ASC`;

const ORGANIZATIONS_SQL = `SELECT id, name, key FROM organizations
 WHERE deleted_at IS NULL
 ORDER BY name COLLATE NOCASE ASC`;

function defaultStart(): Date {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

function defaultEnd(start: Date): Date {
  return new Date(start.getTime() + 60 * 60_000);
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CreateMeetingScreen() {
  const router = useRouter();
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();

  const { data: projects } = useLocalQuery<NamedOptionRow>(PROJECTS_SQL);
  const { data: organizations } =
    useLocalQuery<NamedOptionRow>(ORGANIZATIONS_SQL);

  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState(() => defaultStart().toISOString());
  const [endAt, setEndAt] = useState(() =>
    defaultEnd(defaultStart()).toISOString(),
  );
  const [projectId, setProjectId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectLabel =
    projects.find((entry) => entry.id === projectId)?.name?.trim() ||
    "No project";
  const organizationLabel =
    organizations.find((entry) => entry.id === organizationId)?.name?.trim() ||
    "No organization";

  const projectOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      { value: null, label: "No project" },
      ...(projects ?? []).map((project) => ({
        value: project.id,
        label: project.name?.trim() || project.key?.trim() || "Project",
        icon: (
          <ProjectOcticon
            size={16}
            color={colors.muted}
            icon={project.icon}
            type={project.type}
          />
        ),
      })),
    ],
    [projects],
  );

  const organizationOptions = useMemo<PropertyOption<string | null>[]>(
    () => [
      { value: null, label: "No organization" },
      ...(organizations ?? []).map((org) => ({
        value: org.id,
        label: org.name?.trim() || org.key?.trim() || "Organization",
        icon: <OrganizationIcon size={16} color={colors.muted} />,
      })),
    ],
    [organizations],
  );

  async function onCreate() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createMeetingViaPowerSyncOrApi(client, powerSync, {
        title,
        startAt,
        endAt,
        projectId,
        organizationId,
      });
      router.replace(`/meeting/${encodeURIComponent(created.id)}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create meeting.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <KeyboardAwareScrollView
        style={ui.screen}
        bottomClearance={FLOATING_TAB_BAR_CLEARANCE}
      >
        <View style={{ padding: 16, gap: 12 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Meeting title"
            style={ui.detailTitle}
          />
          <DetailPropertyEditorRows
            rows={[
              {
                key: "start",
                label: "Starts",
                value: formatWhen(startAt),
              },
              {
                key: "end",
                label: "Ends",
                value: formatWhen(endAt),
              },
              {
                key: "project",
                label: "Project",
                value: projectLabel,
                icon: <ProjectOcticon size={16} color={colors.muted} icon={null} />,
              },
              {
                key: "organization",
                label: "Organization",
                value: organizationLabel,
                icon: <OrganizationIcon size={16} color={colors.muted} />,
              },
            ]}
            onPressRow={(key) => setPicker(key as PickerKind)}
          />
          {error ? <Text style={ui.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={() => void onCreate()}
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: colors.foreground,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={{ color: colors.background, fontWeight: "600" }}>
                Create meeting
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAwareScrollView>

      <MeetingDateTimePropertySheet
        visible={picker === "start"}
        title="Starts"
        value={startAt}
        onSelect={(iso) => {
          setStartAt(iso);
          const start = new Date(iso);
          const end = new Date(endAt);
          if (!Number.isNaN(start.getTime()) && end.getTime() <= start.getTime()) {
            setEndAt(defaultEnd(start).toISOString());
          }
        }}
        onClose={() => setPicker(null)}
      />
      <MeetingDateTimePropertySheet
        visible={picker === "end"}
        title="Ends"
        value={endAt}
        onSelect={setEndAt}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        visible={picker === "project"}
        title="Project"
        options={projectOptions}
        selected={projectId}
        onSelect={(value) => {
          setPicker(null);
          setProjectId(value);
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        visible={picker === "organization"}
        title="Organization"
        options={organizationOptions}
        selected={organizationId}
        onSelect={(value) => {
          setPicker(null);
          setOrganizationId(value);
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );
}
