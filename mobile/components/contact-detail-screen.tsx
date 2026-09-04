import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { DetailHeaderDeleteButton } from "./detail-header-delete-button";

import {
  CONTACT_SECTIONS,
  DEFAULT_CONTACT_SECTION,
  type ContactSectionId,
} from "../lib/contact-sections";
import { isPadDevice } from "../lib/device";
import {
  TabStackHeaderPlusButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { ui } from "../lib/ui";
import { useEntitySoftDelete } from "../lib/use-entity-soft-delete";
import { useSectionTabShortcuts } from "../lib/use-section-tab-shortcuts";
import { ContactActivityPanel } from "./contact-activity-panel";
import { ContactOverviewPanel } from "./contact-overview-panel";
import { ContactTasksPanel } from "./contact-tasks-panel";
import { ContentPageTitle } from "./content-page-title";
import { PillNav, type PillNavItem } from "./pill-nav";
import { ScopedLettersPanel } from "./scoped-letters-panel";

type Props = {
  contactId: string;
  title: string;
};

const CONTACT_PILL_ITEMS: readonly PillNavItem<ContactSectionId>[] =
  CONTACT_SECTIONS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));

/** Contact detail shell — Activity / Details / Tasks / Letters. */
export function ContactDetailScreen({ contactId, title }: Props) {
  const router = useRouter();
  const segments = useSegments();
  const inPadContactsSplit =
    isPadDevice() && (segments as string[]).includes("contacts");

  const [section, setSection] = useState<ContactSectionId>(
    DEFAULT_CONTACT_SECTION,
  );
  const [displayTitle, setDisplayTitle] = useState(title);
  const { confirmAndDelete } = useEntitySoftDelete();

  const onDeleteContact = useCallback(() => {
    confirmAndDelete("contacts", contactId, displayTitle);
  }, [confirmAndDelete, contactId, displayTitle]);

  useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  useEffect(() => {
    setSection(DEFAULT_CONTACT_SECTION);
  }, [contactId]);

  const onSectionTabIndex = useCallback((index: number) => {
    const next = CONTACT_SECTIONS[index];
    if (next) setSection(next.id);
  }, []);

  useSectionTabShortcuts({
    enabled: true,
    sectionCount: CONTACT_SECTIONS.length,
    onSelectIndex: onSectionTabIndex,
  });

  const onPressCreate = useCallback(() => {
    if (section === "tasks") {
      router.push({
        pathname: "/create/task",
        params: { contactId },
      });
      return;
    }
    if (section === "letters") {
      router.push({
        pathname: "/create/letter",
        params: { contactId },
      });
    }
  }, [contactId, router, section]);

  const createTrailing =
    section === "tasks" || section === "letters" ? (
      <TabStackHeaderPlusButton
        onPress={onPressCreate}
        accessibilityLabel={
          section === "tasks" ? "Create task" : "Create letter"
        }
      />
    ) : null;

  const headerTitle = useCallback(
    () => (
      <View style={styles.headerTitleCluster}>
        <PillNav
          accessibilityLabel="Contact sections"
          value={section}
          onChange={setSection}
          align="start"
          density="header"
          items={CONTACT_PILL_ITEMS}
        />
      </View>
    ),
    [section],
  );

  const headerRight = useCallback(
    () => <DetailHeaderDeleteButton onDelete={onDeleteContact} />,
    [onDeleteContact],
  );

  const screenOptions = useMemo(
    () => ({
      ...tabDetailScreenOptions({ embedded: isPadDevice() }),
      title: "",
      headerTitleAlign: "left" as const,
      headerTitle,
      ...(inPadContactsSplit ? { headerBackVisible: false } : null),
      headerRight,
    }),
    [headerRight, headerTitle, inPadContactsSplit],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <View style={ui.screen}>
        <View style={{ flex: 1 }}>
          {section === "overview" ? (
            <ContactActivityPanel contactId={contactId} />
          ) : section === "details" ? (
            <ContactOverviewPanel
              contactId={contactId}
              onNameChange={setDisplayTitle}
            />
          ) : section === "tasks" ? (
            <>
              <ContentPageTitle
                title={displayTitle}
                trailing={createTrailing}
              />
              <ContactTasksPanel contactId={contactId} />
            </>
          ) : (
            <>
              <ContentPageTitle
                title={displayTitle}
                trailing={createTrailing}
              />
              <ScopedLettersPanel
                scope={{ kind: "contact", id: contactId }}
                emptyText="No letters linked to this contact."
              />
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
