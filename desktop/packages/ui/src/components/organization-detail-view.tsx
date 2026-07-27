"use client";

import { useEffect, useState, type ReactNode } from "react";

import { rememberOrganizationSection } from "../entity-section-memory.js";
import {
  ORGANIZATION_SECTIONS,
  type OrganizationSectionId,
} from "../organization-sections.js";
import { OrganizationIcon } from "./organization-icon.js";
import {
  OrganizationOverviewView,
  type OrganizationOverviewDetails,
  type OrganizationOverviewViewOrganization,
  type OrganizationOverviewViewProps,
} from "./organization-overview-view.js";
import { PillNav } from "./pill-nav.js";

export type OrganizationDetailViewProps = {
  organization: OrganizationOverviewViewOrganization;
  onSaveName?: OrganizationOverviewViewProps["onSaveName"];
  onSaveDetails?: (
    details: OrganizationOverviewDetails,
  ) => void | Promise<void>;
  overviewHeaderAccessory?: ReactNode;
  section?: OrganizationSectionId;
  onSectionChange?: (section: OrganizationSectionId) => void;
  initialSection?: OrganizationSectionId;
  renderSection?: (sectionId: OrganizationSectionId) => ReactNode;
  /** Optional create-contact control shown on the Contacts section nav. */
  contactsNavAction?: ReactNode;
};

/**
 * Organization detail shell — Overview / Projects / Letters / Contacts
 * matching Next.js OrganizationNav + section screens.
 */
export function OrganizationDetailView({
  organization,
  onSaveName,
  onSaveDetails,
  overviewHeaderAccessory,
  section: controlledSection,
  onSectionChange,
  initialSection = "overview",
  renderSection,
  contactsNavAction,
}: OrganizationDetailViewProps) {
  const [uncontrolledSection, setUncontrolledSection] =
    useState<OrganizationSectionId>(initialSection);
  const section = controlledSection ?? uncontrolledSection;
  const setSection = (next: OrganizationSectionId) => {
    onSectionChange?.(next);
    if (controlledSection === undefined) {
      setUncontrolledSection(next);
    }
  };

  useEffect(() => {
    rememberOrganizationSection(section);
  }, [section]);

  const sectionItems = ORGANIZATION_SECTIONS.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));

  return (
    <div className="organization-detail" data-content-detail>
      <div className="organization-detail__nav">
        <div className="organization-detail__nav-row">
          <PillNav
            ariaLabel="Organization sections"
            items={sectionItems}
            value={section}
            onChange={setSection}
          />
          {section === "contacts" && contactsNavAction ? (
            <div className="organization-detail__nav-action">
              {contactsNavAction}
            </div>
          ) : null}
        </div>
      </div>

      {section !== "overview" ? (
        <div className="organization-detail__section" data-section={section}>
          {renderSection?.(section) ?? (
            <div className="organization-detail__placeholder">
              <p className="overview-empty">
                {
                  ORGANIZATION_SECTIONS.find((entry) => entry.id === section)
                    ?.label
                }{" "}
                will sync here next.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="organization-detail__overview">
          <OrganizationOverviewView
            organization={organization}
            onSaveName={onSaveName}
            onSaveDetails={onSaveDetails}
            headerAccessory={
              overviewHeaderAccessory ?? (
                <span className="organization-detail__avatar" aria-hidden="true">
                  <OrganizationIcon size={28} />
                </span>
              )
            }
          />
        </div>
      )}
    </div>
  );
}
