import {
  buildAssigneeDropdownOptions,
  DROPDOWN_NONE_VALUE,
  type AssigneeDropdownContact,
} from "../dropdowns/dropdown-options.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";

/**
 * Lead agent picker options — same roster styling as the project page Lead
 * field (name + muted job title via secondaryLabel).
 */
export function buildLeadAgentDropdownOptions(
  agentContacts: readonly AssigneeDropdownContact[],
  options?: {
    avatarSrcById?: Readonly<Record<string, string | null | undefined>>;
    /** Include the “No lead agent” sentinel (project page default). */
    includeNone?: boolean;
  },
): SearchableDropdownOption<string>[] {
  const includeNone = options?.includeNone ?? true;
  const titleById = new Map(
    agentContacts.map((contact) => [
      contact.id,
      contact.title?.trim() || null,
    ]),
  );
  const built = buildAssigneeDropdownOptions([...agentContacts], {
    avatarSrcById: options?.avatarSrcById,
  }).map((option) => {
    if (option.value === DROPDOWN_NONE_VALUE) {
      return {
        ...option,
        label: "No lead agent",
        searchTerms: "none no lead agent unassigned",
      };
    }
    const title = titleById.get(option.value) ?? null;
    if (!title) return option;
    return {
      ...option,
      secondaryLabel: title,
      searchTerms: `${option.searchTerms ?? ""} ${title}`.trim(),
    };
  });
  if (includeNone) return built;
  return built.filter((option) => option.value !== DROPDOWN_NONE_VALUE);
}
