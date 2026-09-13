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

  const mode = activeSection === "cloudflare" ? "cloudflare" : "details";

  return (
    <div className="contact-detail domain-detail" data-content-detail>
      <div className="contact-detail__overview">
        <DomainOverviewView
          {...overviewProps}
          mode={mode}
          sectionNavSlot={
            showSectionNav && sections.length > 1 ? (
              <div className="contact-section-tabs">
                <PillNav
                  className="contact-section-tabs__nav"
                  ariaLabel="Domain sections"
                  items={sections.map((entry) => ({
                    value: entry.id,
                    label: entry.label,
                  }))}
                  value={activeSection}
                  onChange={setSection}
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
