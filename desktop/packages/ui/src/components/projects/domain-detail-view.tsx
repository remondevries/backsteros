"use client";

import { useMemo, useState } from "react";

import {
  resolveDomainCardSections,
  type DomainSectionId,
} from "../../projects/domain-sections.js";
import { PillNav } from "../shared/pill-nav.js";
import {
  DomainCloudflarePanel,
  type DomainCloudflareDnsResult,
} from "./domain-cloudflare-panel.js";
import {
  DomainOverviewView,
  type DomainOverviewViewProps,
} from "./domain-overview-view.js";

const DOMAIN_MORE_TAB = {
  value: "more" as const,
  label: "More...",
};

export type DomainDetailViewProps = Omit<
  DomainOverviewViewProps,
  "mode" | "sectionNavSlot" | "sectionBody"
> & {
  section?: DomainSectionId;
  onSectionChange?: (section: DomainSectionId) => void;
  initialSection?: DomainSectionId;
  showSectionNav?: boolean;
  loadCloudflareDnsRecords?: (
    zoneId: string,
  ) => Promise<DomainCloudflareDnsResult>;
  purgeCloudflareCache?: (zoneId: string) => Promise<void>;
  /**
   * When set, appends a "More..." tab (contacts/orgs pattern) that expands
   * the Catalog Domains card into the tasks + details workspace.
   */
  onMore?: () => void;
};

/**
 * Domains profile card — contacts-style chrome; Details is the default tab.
 * Cloudflare tab appears when the project has a linked zone id.
 */
export function DomainDetailView({
  section: controlledSection,
  onSectionChange,
  initialSection = "details",
  showSectionNav = true,
  loadCloudflareDnsRecords,
  purgeCloudflareCache,
  onMore,
  ...overviewProps
}: DomainDetailViewProps) {
  const zoneId = overviewProps.project.cloudflareZoneId?.trim() || null;
  const showCloudflare = Boolean(
    zoneId && loadCloudflareDnsRecords && purgeCloudflareCache,
  );
  const sections = useMemo(
    () => resolveDomainCardSections({ showCloudflare }),
    [showCloudflare],
  );

  const [uncontrolledSection, setUncontrolledSection] =
    useState<DomainSectionId>(initialSection);
  const section = controlledSection ?? uncontrolledSection;
  const activeSection = sections.some((entry) => entry.id === section)
    ? section
    : "details";

  function setSection(next: DomainSectionId) {
    onSectionChange?.(next);
    if (controlledSection === undefined) {
      setUncontrolledSection(next);
    }
  }

  type NavValue = DomainSectionId | "more";
  const showMoreTab = Boolean(onMore);
  const sectionItems: { value: NavValue; label: string }[] = [
    ...sections.map((entry) => ({
      value: entry.id as NavValue,
      label: entry.label,
    })),
    ...(showMoreTab ? [DOMAIN_MORE_TAB] : []),
  ];

  function handleNavChange(next: NavValue) {
    if (next === "more") {
      onMore?.();
      return;
    }
    setSection(next);
  }

  const mode = activeSection === "cloudflare" ? "cloudflare" : "details";
  const showTabs = showSectionNav && sectionItems.length > 1;

  return (
    <div className="contact-detail domain-detail" data-content-detail>
      <div className="contact-detail__overview">
        <DomainOverviewView
          {...overviewProps}
          mode={mode}
          sectionNavSlot={
            showTabs ? (
              <div className="contact-section-tabs">
                <PillNav
                  className="contact-section-tabs__nav"
                  ariaLabel="Domain sections"
                  items={sectionItems}
                  value={activeSection}
                  onChange={handleNavChange}
                />
              </div>
            ) : null
          }
          sectionBody={
            showCloudflare &&
            zoneId &&
            loadCloudflareDnsRecords &&
            purgeCloudflareCache ? (
              <DomainCloudflarePanel
                zoneId={zoneId}
                loadDnsRecords={loadCloudflareDnsRecords}
                purgeCache={purgeCloudflareCache}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}
