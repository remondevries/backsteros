"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  CONTACT_CARD_SECTIONS,
  CONTACT_SECTIONS,
  type ContactSectionConfig,
  type ContactSectionId,
} from "../../contacts/contact-sections.js";
import { rememberContactSection } from "../../navigation/entity-section-memory.js";
import {
  ContactOverviewView,
  type ContactOverviewDetails,
  type ContactOverviewViewContact,
  type ContactOverviewViewProps,
} from "./contact-overview-view.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { PillNav } from "../shared/pill-nav.js";

const CONTACT_MORE_TAB = {
  value: "more" as const,
  label: "More...",
};

function isCardOnlySections(sections: readonly ContactSectionConfig[]): boolean {
  return (
    sections === CONTACT_CARD_SECTIONS ||
    (sections.length === CONTACT_CARD_SECTIONS.length &&
      sections.every(
        (entry, index) => entry.id === CONTACT_CARD_SECTIONS[index]?.id,
      ))
  );
}

export type ContactDetailViewProps = {
  contact: ContactOverviewViewContact;
  organizationOptions?: ContactOverviewViewProps["organizationOptions"];
  groupOptions?: ContactOverviewViewProps["groupOptions"];
  memberGroupIds?: ContactOverviewViewProps["memberGroupIds"];
  onMemberGroupIdsChange?: ContactOverviewViewProps["onMemberGroupIdsChange"];
  onSaveName?: ContactOverviewViewProps["onSaveName"];
  onSaveFirstName?: ContactOverviewViewProps["onSaveFirstName"];
  onSaveLastName?: ContactOverviewViewProps["onSaveLastName"];
  onSaveDetails?: (
    details: ContactOverviewDetails,
  ) => void | Promise<void>;
  onAfterLocationSave?: ContactOverviewViewProps["onAfterLocationSave"];
  mapImageSrc?: ContactOverviewViewProps["mapImageSrc"];
  mapLoading?: ContactOverviewViewProps["mapLoading"];
  mapHint?: ContactOverviewViewProps["mapHint"];
  onCreateOrganizationFromQuery?: ContactOverviewViewProps["onCreateOrganizationFromQuery"];
  overviewHeaderAccessory?: ReactNode;
  relationshipsSlot?: ReactNode;
  activitySlot?: ReactNode;
  section?: ContactSectionId;
  onSectionChange?: (section: ContactSectionId) => void;
  initialSection?: ContactSectionId;
  renderSection?: (sectionId: ContactSectionId) => ReactNode;
  /** When false, hide section tabs (e.g. nested task/letter detail). Default true. */
  showSectionNav?: boolean;
  /**
   * Tabs on the profile card. Standalone contacts use
   * `CONTACT_CARD_SECTIONS` (Activity / Details); org-scoped keeps all sections.
   */
  sections?: readonly ContactSectionConfig[];
  /**
   * When set, appends a "More..." tab after Details that expands the overlay
   * (same as the expand control). Only for the narrow card.
   */
  onMore?: () => void;
};

/**
 * Contact detail shell — avatar header + tabs stay put; only the tab body scrolls.
 */
export function ContactDetailView({
  contact,
  organizationOptions,
  groupOptions,
  memberGroupIds,
  onMemberGroupIdsChange,
  onSaveName,
  onSaveFirstName,
  onSaveLastName,
  onSaveDetails,
  onAfterLocationSave,
  mapImageSrc,
  mapLoading,
  mapHint,
  onCreateOrganizationFromQuery,
  overviewHeaderAccessory,
  relationshipsSlot,
  activitySlot,
  section: controlledSection,
  onSectionChange,
  initialSection = "overview",
  renderSection,
  showSectionNav = true,
  sections = CONTACT_SECTIONS,
  onMore,
}: ContactDetailViewProps) {
  const [uncontrolledSection, setUncontrolledSection] =
    useState<ContactSectionId>(initialSection);
  const section = controlledSection ?? uncontrolledSection;
  const setSection = (next: ContactSectionId) => {
    onSectionChange?.(next);
    if (controlledSection === undefined) {
      setUncontrolledSection(next);
    }
  };

  useEffect(() => {
    rememberContactSection(section);
  }, [section]);

  type NavValue = ContactSectionId | "more";
  const showMoreTab = Boolean(onMore) || isCardOnlySections(sections);
  const sectionItems: { value: NavValue; label: string }[] = [
    ...sections.map((entry) => ({
      value: entry.id as NavValue,
      label: entry.label,
    })),
    ...(showMoreTab ? [CONTACT_MORE_TAB] : []),
  ];
  const navSection: NavValue = sections.some((entry) => entry.id === section)
    ? section
    : "overview";

  const mode =
    section === "overview" ||
    (section !== "details" && !sections.some((entry) => entry.id === section))
      ? "overview"
      : section === "details"
        ? "details"
        : "section";

  function handleNavChange(next: NavValue) {
    if (next === "more") {
      onMore?.();
      return;
    }
    setSection(next);
  }

  return (
    <div className="contact-detail" data-content-detail>
      <div className="contact-detail__overview">
        <ContactOverviewView
          mode={mode}
          contact={contact}
          organizationOptions={organizationOptions}
          groupOptions={groupOptions}
          memberGroupIds={memberGroupIds}
          onMemberGroupIdsChange={onMemberGroupIdsChange}
          onSaveName={onSaveName}
          onSaveFirstName={onSaveFirstName}
          onSaveLastName={onSaveLastName}
          onSaveDetails={onSaveDetails}
          onAfterLocationSave={onAfterLocationSave}
          mapImageSrc={mapImageSrc}
          mapLoading={mapLoading}
          mapHint={mapHint}
          onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
          headerAccessory={
            overviewHeaderAccessory ?? (
              <span className="contact-detail__avatar" aria-hidden="true">
                <ContactPersonIcon size={28} />
              </span>
            )
          }
          relationshipsSlot={relationshipsSlot}
          activitySlot={activitySlot}
          sectionNavSlot={
            showSectionNav ? (
              <div className="contact-section-tabs">
                <PillNav
                  className="contact-section-tabs__nav"
                  ariaLabel="Contact sections"
                  items={sectionItems}
                  value={navSection}
                  onChange={handleNavChange}
                />
              </div>
            ) : null
          }
          sectionBody={
            mode === "section"
              ? (renderSection?.(section) ?? (
                  <div className="contact-detail__placeholder">
                    <p className="overview-empty">
                      {
                        CONTACT_SECTIONS.find((entry) => entry.id === section)
                          ?.label
                      }{" "}
                      will sync here next.
                    </p>
                  </div>
                ))
              : null
          }
        />
      </div>
    </div>
  );
}
