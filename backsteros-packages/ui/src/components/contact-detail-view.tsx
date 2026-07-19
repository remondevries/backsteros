"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  CONTACT_SECTIONS,
  type ContactSectionId,
} from "../contact-sections.js";
import { rememberContactSection } from "../entity-section-memory.js";
import {
  ContactOverviewView,
  type ContactOverviewDetails,
  type ContactOverviewViewContact,
  type ContactOverviewViewProps,
} from "./contact-overview-view.js";
import { ContactPersonIcon } from "./contact-person-icon.js";
import { PillNav } from "./pill-nav.js";

export type ContactDetailViewProps = {
  contact: ContactOverviewViewContact;
  organizationOptions?: ContactOverviewViewProps["organizationOptions"];
  onSaveName?: ContactOverviewViewProps["onSaveName"];
  onSaveDetails?: (
    details: ContactOverviewDetails,
  ) => void | Promise<void>;
  overviewHeaderAccessory?: ReactNode;
  section?: ContactSectionId;
  onSectionChange?: (section: ContactSectionId) => void;
  initialSection?: ContactSectionId;
  renderSection?: (sectionId: ContactSectionId) => ReactNode;
  /** When false, hide PillNav (e.g. nested task/letter detail). Default true. */
  showSectionNav?: boolean;
};

/**
 * Contact detail shell — Overview / Tasks / Letters
 * matching Next.js ContactNav + section screens.
 */
export function ContactDetailView({
  contact,
  organizationOptions,
  onSaveName,
  onSaveDetails,
  overviewHeaderAccessory,
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

  return (
    <div className="contact-detail" data-content-detail>
      {showSectionNav ? (
        <div className="contact-detail__nav">
          <PillNav
            ariaLabel="Contact sections"
            items={sectionItems}
            value={section}
            onChange={setSection}
          />
        </div>
      ) : null}

      {section !== "overview" ? (
        <div className="contact-detail__section" data-section={section}>
          {renderSection?.(section) ?? (
            <div className="contact-detail__placeholder">
              <p className="overview-empty">
                {
                  CONTACT_SECTIONS.find((entry) => entry.id === section)?.label
                }{" "}
                will sync here next.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="contact-detail__overview">
          <ContactOverviewView
            contact={contact}
            organizationOptions={organizationOptions}
            onSaveName={onSaveName}
            onSaveDetails={onSaveDetails}
            headerAccessory={
              overviewHeaderAccessory ?? (
                <span className="contact-detail__avatar" aria-hidden="true">
                  <ContactPersonIcon size={28} />
                </span>
              )
            }
          />
        </div>
      )}
    </div>
  );
}
