"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  CONTACT_SECTIONS,
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
  onAddTask?: ContactOverviewViewProps["onAddTask"];
  onAddMeeting?: ContactOverviewViewProps["onAddMeeting"];
  onSendEmail?: ContactOverviewViewProps["onSendEmail"];
  section?: ContactSectionId;
  onSectionChange?: (section: ContactSectionId) => void;
  initialSection?: ContactSectionId;
  renderSection?: (sectionId: ContactSectionId) => ReactNode;
  /** When false, hide section tabs (e.g. nested task/letter detail). Default true. */
  showSectionNav?: boolean;
};

/**
 * Contact detail shell — chrome (name + actions) stays put; underline tabs
 * switch Activity / Details / Tasks / Letters.
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
  onAddTask,
  onAddMeeting,
  onSendEmail,
  section: controlledSection,
  onSectionChange,
  initialSection = "overview",
  renderSection,
  showSectionNav = true,
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

  const sectionItems = CONTACT_SECTIONS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));

  const mode =
    section === "overview"
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
                  value={section}
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
          onAddTask={onAddTask}
          onAddMeeting={onAddMeeting}
          onSendEmail={onSendEmail}
        />
      </div>
    </div>
  );
}
