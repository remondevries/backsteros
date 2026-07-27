"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  CONTACT_SECTIONS,
  getActiveContactSection,
  getContactSectionHref,
  shouldShowContactNav,
} from "@/lib/contact-sections";
import { rememberContactSection } from "@/lib/entity-section-memory";
import {
  APP_PILL_NAV_ITEM_CLASS,
  appPillNavItemStateClass,
} from "@/lib/ui/app-pill-nav";

type ContactNavProps = {
  contactRouteParam: string;
};

export function ContactNav({ contactRouteParam }: ContactNavProps) {
  const pathname = usePathname();
  const activeId = getActiveContactSection(pathname, contactRouteParam);

  useEffect(() => {
    rememberContactSection(activeId);
  }, [activeId]);

  if (!shouldShowContactNav(pathname, contactRouteParam)) {
    return null;
  }

  return (
    <div
      className="app-pill-nav flex shrink-0 gap-2 p-2 pb-0"
      aria-label="Contact sections"
    >
      {CONTACT_SECTIONS.map((section) => {
        const isActive = section.id === activeId;
        const href = getContactSectionHref(
          contactRouteParam,
          section.id,
          pathname,
        );

        return (
          <Link
            key={section.id}
            href={href}
            scroll={false}
            className={`${APP_PILL_NAV_ITEM_CLASS} ${appPillNavItemStateClass(isActive)}`}
            aria-current={isActive ? "page" : undefined}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}
