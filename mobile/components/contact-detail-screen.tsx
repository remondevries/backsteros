import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { DetailHeaderDeleteButton } from "./detail-header-delete-button";
import { FloatingBottomRightPlusButton } from "./floating-bottom-right-plus-button";

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
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useEntitySoftDelete } from "../lib/use-entity-soft-delete";
import { useSectionTabShortcuts } from "../lib/use-section-tab-shortcuts";
import { ContactActivityPanel } from "./contact-activity-panel";
import { ContactOverviewPanel } from "./contact-overview-panel";
import { ContactTasksPanel } from "./contact-tasks-panel";
import type { PillNavItem } from "./pill-nav";
import { ScopedLettersPanel } from "./scoped-letters-panel";
import { SectionedDetailHeader } from "./sectioned-detail-header";

type Props = {
  contactId: string;
  title: string;
};

const CONTACT_PILL_ITEMS: readonly PillNavItem<ContactSectionId>[] =
  CONTACT_SECTIONS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));

const CREATE_SECTIONS = new Set<ContactSectionId>(["tasks", "letters"]);

function headerRightActions(actions: ReactNode) {
  return <View style={styles.headerRightCluster}>{actions}</View>;
}

/** Contact detail shell — name + tabs in header (project chrome parity). */
export function ContactDetailScreen({ contactId, title }: Props) {
  const router = useRouter();
  const segments = useSegments();
  const isPad = isPadDevice();
  const inPadContactsSplit =
    isPad && (segments as string[]).includes("contacts");

  const [section, setSection] = useState<ContactSectionId>(
    DEFAULT_CONTACT_SECTION,
  );
  const [displayTitle, setDisplayTitle] = useState(title);
  const { confirmAndDelete } = useEntitySoftDelete();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/contacts");
  }, [router]);

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

  const showPhoneFloatingCreate = !isPad && CREATE_SECTIONS.has(section);

  const padCreateAction =
    isPad && CREATE_SECTIONS.has(section) ? (
      <TabStackHeaderPlusButton
        onPress={onPressCreate}
        accessibilityLabel={
          section === "tasks" ? "Create task" : "Create letter"
        }
      />
    ) : null;

  const headerRight = headerRightActions(
    <>
      {padCreateAction}
      <DetailHeaderDeleteButton onDelete={onDeleteContact} />
    </>,
  );

  const screenOptions = useMemo(
    () => ({
      ...tabDetailScreenOptions({ embedded: isPad }),
      header: () => (
        <SectionedDetailHeader
          title={displayTitle}
          tab={section}
          onTabChange={setSection}
          tabItems={CONTACT_PILL_ITEMS}
          tabsAccessibilityLabel="Contact sections"
          onBack={handleBack}
          showBack={!inPadContactsSplit}
          headerRight={headerRight}
        />
      ),
      contentStyle: { backgroundColor: colors.background },
    }),
    [
      displayTitle,
      handleBack,
      headerRight,
      inPadContactsSplit,
      isPad,
      section,
    ],
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
            <View style={{ flex: 1, minHeight: 0 }}>
              <ContactTasksPanel contactId={contactId} />
            </View>
          ) : (
            <View style={{ flex: 1, minHeight: 0 }}>
              <ScopedLettersPanel
                scope={{ kind: "contact", id: contactId }}
                emptyText="No letters linked to this contact."
              />
            </View>
          )}
        </View>
        <FloatingBottomRightPlusButton
          visible={showPhoneFloatingCreate}
          onPress={onPressCreate}
          accessibilityLabel={
            section === "tasks" ? "Create task" : "Create letter"
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerRightCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
});
