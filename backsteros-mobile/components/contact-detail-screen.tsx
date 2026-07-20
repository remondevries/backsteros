import type { Contact } from "@backsteros/contracts";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import {
  CONTACT_SECTIONS,
  DEFAULT_CONTACT_SECTION,
  type ContactSectionId,
} from "../lib/contact-sections";
import { useMobilePowerSync } from "../lib/powersync-context";
import {
  TabStackHeaderPlusButton,
  TabStackHeaderTextButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { ContactOverviewPanel } from "./contact-overview-panel";
import { ContactTasksPanel } from "./contact-tasks-panel";
import {
  FadingHeaderTitle,
  useFadingHeaderTitleOpacity,
} from "./fading-header-title";
import { PillNav } from "./pill-nav";
import { ScopedLettersPanel } from "./scoped-letters-panel";

type Props = {
  contactId: string;
  title: string;
};

type ContactDraft = {
  name: string;
  summary: string;
  email: string;
  phone: string;
  title: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
};

const EMPTY_DRAFT: ContactDraft = {
  name: "",
  summary: "",
  email: "",
  phone: "",
  title: "",
  address: "",
  city: "",
  postalCode: "",
  country: "",
};

/** Contact detail shell — Overview / Tasks / Letters (desktop parity). */
export function ContactDetailScreen({ contactId, title }: Props) {
  const router = useRouter();
  const powerSync = useMobilePowerSync();

  const client = useMobileApiClient();

  const [section, setSection] = useState<ContactSectionId>(
    DEFAULT_CONTACT_SECTION,
  );
  const [displayTitle, setDisplayTitle] = useState(title);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [loadedDetails, setLoadedDetails] = useState<ContactDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  useEffect(() => {
    setEditing(false);
    setSaveError(null);
  }, [section, contactId]);

  const showHeaderTitle = !editing && section !== "overview";
  const headerTitleOpacity = useFadingHeaderTitleOpacity(showHeaderTitle);

  const startEditing = useCallback(() => {
    setDraft(
      loadedDetails.name
        ? loadedDetails
        : { ...EMPTY_DRAFT, name: displayTitle },
    );
    setSaveError(null);
    setEditing(true);
  }, [displayTitle, loadedDetails]);

  async function saveEditing() {
    const trimmedName = draft.name.trim();
    if (!trimmedName || saving) return;
    setSaving(true);
    setSaveError(null);
    const patchBody = {
      name: trimmedName,
      summary: draft.summary.trim() || null,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      title: draft.title.trim() || null,
      address: draft.address.trim() || null,
      city: draft.city.trim() || null,
      postalCode: draft.postalCode.trim() || null,
      country: draft.country.trim() || null,
    };
    const sqliteValues = {
      name: patchBody.name,
      summary: patchBody.summary,
      email: patchBody.email,
      phone: patchBody.phone,
      title: patchBody.title,
      address: patchBody.address,
      city: patchBody.city,
      postal_code: patchBody.postalCode,
      country: patchBody.country,
    };
    try {
      if (powerSync.ready) {
        await powerSync.patchContact(contactId, sqliteValues);
        try {
          await client.requestJson<Contact>(
            `/api/v1/contacts/${encodeURIComponent(contactId)}`,
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
        await client.requestJson<Contact>(
          `/api/v1/contacts/${encodeURIComponent(contactId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patchBody),
          },
        );
      }
      setDisplayTitle(trimmedName);
      setLoadedDetails({ ...draft, name: trimmedName });
      setEditing(false);
    } catch (reason) {
      setSaveError(
        reason instanceof Error ? reason.message : "Could not save contact.",
      );
    } finally {
      setSaving(false);
    }
  }

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

  const headerRight = editing ? (
    <TabStackHeaderTextButton
      label="Save"
      onPress={() => {
        void saveEditing();
      }}
      loading={saving}
      disabled={saving || !draft.name.trim()}
    />
  ) : section === "overview" ? (
    <TabStackHeaderTextButton label="Edit" onPress={startEditing} />
  ) : section === "tasks" || section === "letters" ? (
    <TabStackHeaderPlusButton
      chrome="plain"
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
          ...tabDetailScreenOptions(),
          title: displayTitle,
          headerTitleAlign: "center",
          headerTitle: () => (
            <FadingHeaderTitle
              title={displayTitle}
              opacity={headerTitleOpacity}
            />
          ),
          headerRight: headerRight ? () => headerRight : undefined,
        }}
      />
      <View style={ui.screen}>
        <PillNav
          accessibilityLabel="Contact sections"
          value={section}
          onChange={setSection}
          align="center"
          items={CONTACT_SECTIONS.map((entry) => ({
            value: entry.id,
            label: entry.label,
          }))}
        />
        <View style={{ flex: 1 }}>
          {editing || section === "overview" ? (
            <ContactOverviewPanel
              contactId={contactId}
              editing={editing}
              draftName={draft.name}
              draftSummary={draft.summary}
              draftEmail={draft.email}
              draftPhone={draft.phone}
              draftTitle={draft.title}
              draftAddress={draft.address}
              draftCity={draft.city}
              draftPostalCode={draft.postalCode}
              draftCountry={draft.country}
              onDraftNameChange={(value) =>
                setDraft((prev) => ({ ...prev, name: value }))
              }
              onDraftSummaryChange={(value) =>
                setDraft((prev) => ({ ...prev, summary: value }))
              }
              onDraftEmailChange={(value) =>
                setDraft((prev) => ({ ...prev, email: value }))
              }
              onDraftPhoneChange={(value) =>
                setDraft((prev) => ({ ...prev, phone: value }))
              }
              onDraftTitleChange={(value) =>
                setDraft((prev) => ({ ...prev, title: value }))
              }
              onDraftAddressChange={(value) =>
                setDraft((prev) => ({ ...prev, address: value }))
              }
              onDraftCityChange={(value) =>
                setDraft((prev) => ({ ...prev, city: value }))
              }
              onDraftPostalCodeChange={(value) =>
                setDraft((prev) => ({ ...prev, postalCode: value }))
              }
              onDraftCountryChange={(value) =>
                setDraft((prev) => ({ ...prev, country: value }))
              }
              saveError={saveError}
              onDetailsLoaded={setLoadedDetails}
            />
          ) : section === "tasks" ? (
            <ContactTasksPanel contactId={contactId} />
          ) : (
            <ScopedLettersPanel
              scope={{ kind: "contact", id: contactId }}
              emptyText="No letters linked to this contact."
            />
          )}
        </View>
      </View>
    </>
  );
}
