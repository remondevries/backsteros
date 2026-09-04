import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { formatContactDisplayName } from "@backsteros/contracts";

import {
  RegisterPageTitle,
  SocialContactDetailView,
  getSocialHref,
  getUniqueListItemRouteParam,
  groupItemsByAlphaLetter,
  normalizeContactSocialAccounts,
  primeTabTitle,
  resolveListItemFromSlug,
  routeCopy,
  type SocialContactListItem,
} from "@backsteros/ui";

import { useDesktopAvatarSrcMap, withAvatarSrc } from "../lib/avatar-src";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

export function SocialPage() {
  const active = useKeepAliveActive();
  if (!active) return null;
  return <SocialPageBody />;
}

function SocialPageBody() {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const { pathname } = useShellLocation();
  const keepAliveActive = useKeepAliveActive();
  const keepAliveFrozen = useKeepAliveFrozen();
  const { slug: routedSlug } = useShellParams() as { slug?: string };
  const workspace = useDesktopWorkspaceData();

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : workspace.contacts,
  );

  const socialContacts = useMemo((): SocialContactListItem[] => {
    const withAvatars = keepAliveFrozen
      ? workspace.contacts
      : withAvatarSrc(workspace.contacts, contactAvatarSrc);
    const rows: SocialContactListItem[] = [];
    for (const contact of withAvatars) {
      const details = workspace.contactDetails[contact.id];
      const socialAccounts = normalizeContactSocialAccounts(
        details?.socialAccounts ??
          (details as { social_accounts?: unknown } | undefined)
            ?.social_accounts,
      );
      if (socialAccounts.length === 0) continue;
      rows.push({
        ...contact,
        socialAccounts,
        summary: details?.summary ?? null,
        address: details?.address ?? null,
        city: details?.city ?? null,
        postalCode: details?.postalCode ?? null,
        region: details?.region ?? null,
        country: details?.country ?? null,
        title: details?.title ?? contact.title ?? null,
      });
    }
    return rows;
  }, [
    contactAvatarSrc,
    keepAliveFrozen,
    workspace.contactDetails,
    workspace.contacts,
  ]);

  const selected =
    routedSlug != null
      ? resolveListItemFromSlug(socialContacts, routedSlug)
      : null;

  useEffect(() => {
    if (!keepAliveActive) return;
    if (routedSlug) return;
    const first =
      groupItemsByAlphaLetter(socialContacts).flatMap(
        ([, entries]) => entries,
      )[0] ?? null;
    if (first) {
      navigate(
        getSocialHref(getUniqueListItemRouteParam(first, socialContacts)),
        { replace: true },
      );
    }
  }, [keepAliveActive, navigate, routedSlug, socialContacts]);

  const displayName = selected
    ? formatContactDisplayName(
        selected.firstName ?? "",
        selected.lastName,
      ) || selected.name
    : "Social";

  useDesktopSectionBreadcrumb(
    selected
      ? [
          { label: "Social", href: "/social" },
          {
            label: displayName,
            href: getSocialHref(
              getUniqueListItemRouteParam(selected, socialContacts),
            ),
          },
        ]
      : [{ label: "Social", href: "/social" }],
  );

  if (selected) {
    primeTabTitle(pathname, displayName);
  }

  return (
    <>
      <RegisterPageTitle
        active={keepAliveActive}
        href={pathname}
        title={selected ? displayName : routeCopy.social.title}
      />
      {selected ? (
        <SocialContactDetailView
          contact={{
            id: selected.id,
            name: displayName,
            title: selected.title,
            summary: selected.summary,
            socialAccounts: selected.socialAccounts,
            city: selected.city,
            region: selected.region,
            country: selected.country,
            organizationName: selected.organizationName,
            avatarSrc: selected.avatarSrc,
          }}
        />
      ) : (
        <div className="social-contact-detail">
          <p className="social-contact-detail__title">
            {socialContacts.length === 0
              ? "No contacts with social accounts yet."
              : "Select a contact."}
          </p>
        </div>
      )}
    </>
  );
}
