import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

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
import { useSectionTabShortcuts } from "../lib/use-section-tab-shortcuts";
import { ContactOverviewPanel } from "./contact-overview-panel";
import { ContactTasksPanel } from "./contact-tasks-panel";
import { ContentPageTitle } from "./content-page-title";
import { PillNav } from "./pill-nav";
import { ScopedLettersPanel } from "./scoped-letters-panel";

type Props = {
  contactId: string;
  title: string;
};

/** Contact detail shell — Overview / Tasks / Letters (desktop parity). */
export function ContactDetailScreen({ contactId, title }: Props) {
  const router = useRouter();
  const segments = useSegments();
  const inPadContactsSplit =
    isPadDevice() && (segments as string[]).includes("contacts");

  const [section, setSection] = useState<ContactSectionId>(
    DEFAULT_CONTACT_SECTION,
  );
  const [displayTitle, setDisplayTitle] = useState(title);

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

  function onPressCreate() {
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
  }

  const createTrailing =
    section === "tasks" || section === "letters" ? (
      <TabStackHeaderPlusButton
        onPress={onPressCreate}
        accessibilityLabel={
          section === "tasks" ? "Create task" : "Create letter"
        }
      />
    ) : null;

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
                accessibilityLabel="Contact sections"
                value={section}
                onChange={setSection}
                align="start"
                density="header"
                items={CONTACT_SECTIONS.map((entry) => ({
                  value: entry.id,
                  label: entry.label,
                }))}
              />
            </View>
          ),
          ...(inPadContactsSplit ? { headerBackVisible: false } : null),
        }}
      />
      <View style={ui.screen}>
        <View style={{ flex: 1 }}>
          {section === "overview" ? (
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
