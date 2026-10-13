"use client";

import { useEffect, useState, type ReactNode } from "react";

import { rememberOrganizationSection } from "../../navigation/entity-section-memory.js";
import {
  ORGANIZATION_CARD_SECTIONS,
  ORGANIZATION_SECTIONS,
  type OrganizationSectionConfig,
  type OrganizationSectionId,
} from "../../organizations/organization-sections.js";
import { OrganizationIcon } from "./organization-icon.js";
import {
  OrganizationOverviewView,
  type OrganizationOverviewDetails,
  type OrganizationOverviewViewOrganization,
  type OrganizationOverviewViewProps,
} from "./organization-overview-view.js";
import { PillNav } from "../shared/pill-nav.js";

const ORGANIZATION_MORE_TAB = {
  value: "more" as const,
  label: "More...",
};

function isCardOnlySections(
  sections: readonly OrganizationSectionConfig[],
): boolean {
  return (
    sections === ORGANIZATION_CARD_SECTIONS ||
    (sections.length === ORGANIZATION_CARD_SECTIONS.length &&
      sections.every(
        (entry, index) => entry.id === ORGANIZATION_CARD_SECTIONS[index]?.id,
      ))
  );
}

export type OrganizationDetailViewProps = {
  organization: OrganizationOverviewViewOrganization;
  onSaveName?: OrganizationOverviewViewProps["onSaveName"];
  onSaveDetails?: (
    details: OrganizationOverviewDetails,
  ) => void | Promise<void>;
  onAfterLocationSave?: OrganizationOverviewViewProps["onAfterLocationSave"];
  mapImageSrc?: OrganizationOverviewViewProps["mapImageSrc"];
  mapLoading?: OrganizationOverviewViewProps["mapLoading"];
  mapHint?: OrganizationOverviewViewProps["mapHint"];
  moneybirdHref?: OrganizationOverviewViewProps["moneybirdHref"];
  overviewHeaderAccessory?: ReactNode;
  groupOptions?: OrganizationOverviewViewProps["groupOptions"];
  memberGroupIds?: OrganizationOverviewViewProps["memberGroupIds"];
  onMemberGroupIdsChange?: OrganizationOverviewViewProps["onMemberGroupIdsChange"];
  activitySlot?: ReactNode;
  section?: OrganizationSectionId;
  onSectionChange?: (section: OrganizationSectionId) => void;
  initialSection?: OrganizationSectionId;
  renderSection?: (sectionId: OrganizationSectionId) => ReactNode;
  /**
   * Tabs on the profile card. Standalone orgs use
   * `ORGANIZATION_CARD_SECTIONS` (Activity / Details).
   */
  sections?: readonly OrganizationSectionConfig[];
  /**
   * When set, appends a "More..." tab after Details that expands the overlay
   * (same as the expand control). Only for the narrow card.
   */
  onMore?: () => void;
  /** When false, hide section tabs (e.g. nested detail). Default true. */
  showSectionNav?: boolean;
};

/**
 * Organization detail shell — avatar header + tabs stay put; only the tab body scrolls.
 */
export function OrganizationDetailView({
  organization,
  onSaveName,
  onSaveDetails,
  onAfterLocationSave,
  mapImageSrc,
  mapLoading,
  mapHint,
  moneybirdHref,
  overviewHeaderAccessory,
  groupOptions,
  memberGroupIds,
  onMemberGroupIdsChange,
  activitySlot,
  section: controlledSection,
  onSectionChange,
  initialSection = "overview",
  renderSection,
  sections = ORGANIZATION_CARD_SECTIONS,
  onMore,
  showSectionNav = true,
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

  type NavValue = OrganizationSectionId | "more";
  const showMoreTab = Boolean(onMore) || isCardOnlySections(sections);
  const sectionItems: { value: NavValue; label: string }[] = [
    ...sections.map((entry) => ({
      value: entry.id as NavValue,
      label: entry.label,
    })),
    ...(showMoreTab ? [ORGANIZATION_MORE_TAB] : []),
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
    <div className="organization-detail" data-content-detail>
      <div className="organization-detail__overview">
        <OrganizationOverviewView
          mode={mode}
          organization={organization}
          onSaveName={onSaveName}
          onSaveDetails={onSaveDetails}
          onAfterLocationSave={onAfterLocationSave}
          mapImageSrc={mapImageSrc}
          mapLoading={mapLoading}
          mapHint={mapHint}
          moneybirdHref={moneybirdHref}
          groupOptions={groupOptions}
          memberGroupIds={memberGroupIds}
          onMemberGroupIdsChange={onMemberGroupIdsChange}
          headerAccessory={
            overviewHeaderAccessory ?? (
              <span className="organization-detail__avatar" aria-hidden="true">
                <OrganizationIcon size={28} />
              </span>
            )
          }
          activitySlot={activitySlot}
          sectionNavSlot={
            showSectionNav ? (
              <div className="organization-section-tabs">
                <PillNav
                  className="organization-section-tabs__nav"
                  ariaLabel="Organization sections"
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
                  <div className="organization-detail__placeholder">
                    <p className="overview-empty">
                      {
                        ORGANIZATION_SECTIONS.find(
                          (entry) => entry.id === section,
                        )?.label
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
