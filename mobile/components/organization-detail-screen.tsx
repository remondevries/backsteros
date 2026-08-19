import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { isPadDevice } from "../lib/device";
import {
  DEFAULT_ORGANIZATION_SECTION,
  ORGANIZATION_SECTIONS,
  type OrganizationSectionId,
} from "../lib/organization-sections";
import {
  TabStackHeaderPlusButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { ui } from "../lib/ui";
import { useSectionTabShortcuts } from "../lib/use-section-tab-shortcuts";
import { ContentPageTitle } from "./content-page-title";
import { OrganizationContactsPanel } from "./organization-contacts-panel";
import { OrganizationOverviewPanel } from "./organization-overview-panel";
import { OrganizationProjectsPanel } from "./organization-projects-panel";
import { PillNav } from "./pill-nav";
import { ScopedLettersPanel } from "./scoped-letters-panel";

type Props = {
  organizationId: string;
  title: string;
};

/** Organization detail shell — Overview / Projects / Letters / Contacts. */
export function OrganizationDetailScreen({ organizationId, title }: Props) {
  const router = useRouter();
  const segments = useSegments();
  const inPadOrganizationsSplit =
    isPadDevice() && (segments as string[]).includes("organizations");

  const [section, setSection] = useState<OrganizationSectionId>(
    DEFAULT_ORGANIZATION_SECTION,
  );
  const [displayTitle, setDisplayTitle] = useState(title);

  useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  useEffect(() => {
    setSection(DEFAULT_ORGANIZATION_SECTION);
  }, [organizationId]);

  const onSectionTabIndex = useCallback((index: number) => {
    const next = ORGANIZATION_SECTIONS[index];
    if (next) setSection(next.id);
  }, []);

  useSectionTabShortcuts({
    enabled: true,
    sectionCount: ORGANIZATION_SECTIONS.length,
    onSelectIndex: onSectionTabIndex,
  });

  function onPressCreate() {
    if (section === "projects") {
      router.push({
        pathname: "/(app)/projects/new",
        params: { organizationId },
      });
      return;
    }
    if (section === "letters") {
      router.push({
        pathname: "/create/letter",
        params: { organizationId },
      });
      return;
    }
    if (section === "contacts") {
      router.push({
        pathname: "/create/contact",
        params: { organizationId },
      });
    }
  }

  const createTrailing =
    section === "overview" ? null : (
      <TabStackHeaderPlusButton
        onPress={onPressCreate}
        accessibilityLabel={
          section === "projects"
            ? "Create project"
            : section === "letters"
              ? "Create letter"
              : "Create contact"
        }
      />
    );

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions({ embedded: isPadDevice() }),
          title: "",
          headerTitleAlign: "left",
          headerTitle: () => (
            <View style={styles.headerTitleCluster}>
              <PillNav
                accessibilityLabel="Organization sections"
                value={section}
                onChange={setSection}
                align="start"
                density="header"
                items={ORGANIZATION_SECTIONS.map((entry) => ({
                  value: entry.id,
                  label: entry.label,
                }))}
              />
            </View>
          ),
          ...(inPadOrganizationsSplit ? { headerBackVisible: false } : null),
        }}
      />
      <View style={ui.screen}>
        <View style={{ flex: 1 }}>
          {section === "overview" ? (
            <OrganizationOverviewPanel
              organizationId={organizationId}
              onNameChange={setDisplayTitle}
            />
          ) : section === "projects" ? (
            <>
              <ContentPageTitle
                title={displayTitle}
                trailing={createTrailing}
              />
              <OrganizationProjectsPanel organizationId={organizationId} />
            </>
          ) : section === "letters" ? (
            <>
              <ContentPageTitle
                title={displayTitle}
                trailing={createTrailing}
              />
              <ScopedLettersPanel
                scope={{ kind: "organization", id: organizationId }}
                emptyText="No letters linked to this organization."
              />
            </>
          ) : (
            <>
              <ContentPageTitle
                title={displayTitle}
                trailing={createTrailing}
              />
              <OrganizationContactsPanel organizationId={organizationId} />
            </>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerTitleCluster: {
    alignItems: "flex-start",
    justifyContent: "center",
    maxWidth: 420,
  },
});
