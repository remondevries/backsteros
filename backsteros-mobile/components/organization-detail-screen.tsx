import type { Organization } from "@backsteros/contracts";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import {
  DEFAULT_ORGANIZATION_SECTION,
  ORGANIZATION_SECTIONS,
  type OrganizationSectionId,
} from "../lib/organization-sections";
import { useMobilePowerSync } from "../lib/powersync-context";
import {
  TabStackHeaderPlusButton,
  TabStackHeaderTextButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import {
  FadingHeaderTitle,
  useFadingHeaderTitleOpacity,
} from "./fading-header-title";
import { OrganizationContactsPanel } from "./organization-contacts-panel";
import { OrganizationOverviewPanel } from "./organization-overview-panel";
import { OrganizationProjectsPanel } from "./organization-projects-panel";
import { PillNav } from "./pill-nav";
import { ScopedLettersPanel } from "./scoped-letters-panel";

type Props = {
  organizationId: string;
  title: string;
};

type OrganizationDraft = {
  name: string;
  summary: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
};

const EMPTY_DRAFT: OrganizationDraft = {
  name: "",
  summary: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  city: "",
  postalCode: "",
  country: "",
};

/** Organization detail shell — Overview / Projects / Letters / Contacts. */
export function OrganizationDetailScreen({ organizationId, title }: Props) {
  const router = useRouter();
  const powerSync = useMobilePowerSync();

  const client = useMobileApiClient();

  const [section, setSection] = useState<OrganizationSectionId>(
    DEFAULT_ORGANIZATION_SECTION,
  );
  const [displayTitle, setDisplayTitle] = useState(title);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OrganizationDraft>(EMPTY_DRAFT);
  const [loadedDetails, setLoadedDetails] =
    useState<OrganizationDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  useEffect(() => {
    setEditing(false);
    setSaveError(null);
  }, [section, organizationId]);

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
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      website: draft.website.trim() || null,
      address: draft.address.trim() || null,
      city: draft.city.trim() || null,
      postalCode: draft.postalCode.trim() || null,
      country: draft.country.trim() || null,
    };
    const sqliteValues = {
      name: patchBody.name,
      summary: patchBody.summary,
      phone: patchBody.phone,
      email: patchBody.email,
      website: patchBody.website,
      address: patchBody.address,
      city: patchBody.city,
      postal_code: patchBody.postalCode,
      country: patchBody.country,
    };
    try {
      if (powerSync.ready) {
        await powerSync.patchOrganization(organizationId, sqliteValues);
        try {
          await client.requestJson<Organization>(
            `/api/v1/organizations/${encodeURIComponent(organizationId)}`,
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
        await client.requestJson<Organization>(
          `/api/v1/organizations/${encodeURIComponent(organizationId)}`,
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
        reason instanceof Error
          ? reason.message
          : "Could not save organization.",
      );
    } finally {
      setSaving(false);
    }
  }

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
  ) : (
    <TabStackHeaderPlusButton
      chrome="plain"
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
          ...tabDetailScreenOptions(),
          title: displayTitle,
          headerTitleAlign: "center",
          headerTitle: () => (
            <FadingHeaderTitle
              title={displayTitle}
              opacity={headerTitleOpacity}
            />
          ),
          headerRight: () => headerRight,
        }}
      />
      <View style={ui.screen}>
        <PillNav
          accessibilityLabel="Organization sections"
          value={section}
          onChange={setSection}
          items={ORGANIZATION_SECTIONS.map((entry) => ({
            value: entry.id,
            label: entry.label,
          }))}
        />
        <View style={{ flex: 1 }}>
          {editing || section === "overview" ? (
            <OrganizationOverviewPanel
              organizationId={organizationId}
              editing={editing}
              draftName={draft.name}
              draftSummary={draft.summary}
              draftPhone={draft.phone}
              draftEmail={draft.email}
              draftWebsite={draft.website}
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
              onDraftPhoneChange={(value) =>
                setDraft((prev) => ({ ...prev, phone: value }))
              }
              onDraftEmailChange={(value) =>
                setDraft((prev) => ({ ...prev, email: value }))
              }
              onDraftWebsiteChange={(value) =>
                setDraft((prev) => ({ ...prev, website: value }))
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
          ) : section === "projects" ? (
            <OrganizationProjectsPanel organizationId={organizationId} />
          ) : section === "letters" ? (
            <ScopedLettersPanel
              scope={{ kind: "organization", id: organizationId }}
              emptyText="No letters linked to this organization."
            />
          ) : (
            <OrganizationContactsPanel organizationId={organizationId} />
          )}
        </View>
      </View>
    </>
  );
}
