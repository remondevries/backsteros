import { useMemo } from "react";
import {
  buildAssigneeDropdownOptions,
  buildContactDropdownOptions,
  type AssigneeDropdownContact,
  type SearchableDropdownOption,
} from "@backsteros/ui";

import { useDesktopAvatarSrcMap } from "./avatar-src";

type ContactAvatarEntity = AssigneeDropdownContact & {
  avatarStorageKey?: string | null;
  avatarUpdatedAt?: number | null;
};

export type UseAssigneeDropdownOptionsArgs = {
  /** When false, skip avatar downloads (keep-alive freeze / hidden surfaces). */
  enabled?: boolean;
  iconSize?: number;
};

/**
 * Canonical assignee dropdown options for desktop — always resolves contact
 * avatar blob URLs the same way so task rails, lists, compose, and side panels
 * never show person glyphs when an upload exists.
 */
export function useAssigneeDropdownOptions(
  contacts: readonly ContactAvatarEntity[],
  options: UseAssigneeDropdownOptionsArgs = {},
): SearchableDropdownOption<string>[] {
  const enabled = options.enabled !== false;
  const avatarTargets = useMemo(
    () => (enabled ? [...contacts] : []),
    [contacts, enabled],
  );
  const avatarSrcById = useDesktopAvatarSrcMap("contact", avatarTargets);

  return useMemo(
    () =>
      buildAssigneeDropdownOptions([...contacts], {
        iconSize: options.iconSize,
        avatarSrcById,
      }),
    [avatarSrcById, contacts, options.iconSize],
  );
}

/** Same avatar resolution as assignee, with the “No contact” empty row. */
export function useContactDropdownOptions(
  contacts: readonly ContactAvatarEntity[],
  options: UseAssigneeDropdownOptionsArgs = {},
): SearchableDropdownOption<string>[] {
  const enabled = options.enabled !== false;
  const avatarTargets = useMemo(
    () => (enabled ? [...contacts] : []),
    [contacts, enabled],
  );
  const avatarSrcById = useDesktopAvatarSrcMap("contact", avatarTargets);

  return useMemo(
    () =>
      buildContactDropdownOptions([...contacts], {
        iconSize: options.iconSize,
        avatarSrcById,
      }),
    [avatarSrcById, contacts, options.iconSize],
  );
}
