"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
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
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "../list-nav/list-board-view-shell.js";

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
  /** When false, hide section toggle (e.g. nested task/letter detail). Default true. */
  showSectionNav?: boolean;
  /**
   * Sections on the profile card. Standalone contacts use
   * `resolveContactCardSections` (Activity / Details, plus Portal / Logs for
   * clients); org-scoped keeps all sections. Expand is the chrome icon + the
   * next digit after the last card section — not a toggle option.
   */
  sections?: readonly ContactSectionConfig[];
  /** Hover chevron beside first/last name that opens a contact picker. */
  contactSwitcher?: ContactOverviewViewProps["contactSwitcher"];
};

/**
 * Contact detail shell — cover + section toggle stay put; only the body scrolls.
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
  contactSwitcher = null,
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

  const sectionOptions = useMemo<SegmentedPillToggleOption<ContactSectionId>[]>(
    () =>
      sections.map((entry, index) => ({
        value: entry.id,
        label: entry.label,
        // Digits 1…N match visible card sections; N+1 expands (chrome / shortcuts).
        shortcut: String(index + 1),
      })),
    [sections],
  );
  const cardSectionIdsAttr = useMemo(
    () => sections.map((entry) => entry.id).join(","),
    [sections],
  );

  const navSection: ContactSectionId = sections.some(
    (entry) => entry.id === section,
  )
    ? section
    : "overview";

  const mode =
    section === "overview" ||
    (section !== "details" && !sections.some((entry) => entry.id === section))
      ? "overview"
      : section === "details"
        ? "details"
        : "section";

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
          contactSwitcher={contactSwitcher}
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
              <div
                className="contact-section-tabs"
                data-contact-card-section-ids={cardSectionIdsAttr}
              >
                <SegmentedPillToggle
                  ariaLabel="Contact sections"
                  value={navSection}
                  options={sectionOptions}
                  onChange={setSection}
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
