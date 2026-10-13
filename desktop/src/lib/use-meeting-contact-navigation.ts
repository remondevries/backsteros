import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  getContactOverlayHref,
  getUniqueListItemRouteParam,
} from "@backsteros/ui";

import { navigateToHref } from "../router/navigate-href";

type ContactRouteRow = {
  id: string;
  number?: number | null;
  key?: string | null;
};

export function useMeetingContactNavigation(
  contacts: readonly ContactRouteRow[],
) {
  const navigate = useNavigate();

  const resolveContactHref = useCallback(
    (contactId: string) => {
      const contact = contacts.find((entry) => entry.id === contactId);
      if (!contact) return null;
      const slug = getUniqueListItemRouteParam(contact, contacts);
      return getContactOverlayHref(slug, { layout: "page" });
    },
    [contacts],
  );

  const onNavigateHref = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
  );

  return { resolveContactHref, onNavigateHref };
}
