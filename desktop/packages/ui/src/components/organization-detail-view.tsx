"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { rememberOrganizationSection } from "../entity-section-memory.js";
import {
  getOrganizationSectionHref,
  ORGANIZATION_SECTIONS,
  resolveVisibleOrganizationSections,
  type OrganizationSectionConfig,
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
  /**
   * Visible pill tabs. Defaults to base sections only (no finance tabs).
   * Pass {@link resolveVisibleOrganizationSections} when invoices/transactions exist.
   */
  sections?: readonly OrganizationSectionConfig[];
  /** Route slug used for ⌥[/] section-tab shortcuts via data attribute. */
  organizationSlug?: string;
};

/**
 * Organization detail shell — Overview / Projects / Letters / Contacts
 * (+ Transactions / Invoices when linked finance data exists).
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
  sections: sectionsProp,
  organizationSlug,
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

  const sections = sectionsProp ?? resolveVisibleOrganizationSections();

  useEffect(() => {
    rememberOrganizationSection(section);
  }, [section]);

  const sectionItems = sections.map((entry) => ({
    value: entry.id,
    label: entry.label,
  }));

  const sectionTabHrefs = useMemo(() => {
    if (!organizationSlug) return null;
    return sections
      .map((entry) => getOrganizationSectionHref(organizationSlug, entry.id))
      .join("|");
  }, [organizationSlug, sections]);

  return (
    <div
      className="organization-detail"
      data-content-detail
      data-organization-detail=""
      {...(sectionTabHrefs
        ? { "data-organization-section-hrefs": sectionTabHrefs }
        : {})}
    >
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
