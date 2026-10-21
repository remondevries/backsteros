"use client";

import type { SearchableDropdownOption } from "../components/dropdowns/searchable-dropdown.js";
import { InboxItemTypeIcon } from "../components/inbox/inbox-item-type-icon.js";
import { buildEmailRelatedPropertyOptionData } from "./email-related-property-option-data.js";
import type { EmailListItem } from "./email.js";

export function buildEmailRelatedPropertyOptions(
  messages: readonly EmailListItem[],
): SearchableDropdownOption<string>[] {
  return buildEmailRelatedPropertyOptionData(messages).map((option) => ({
    ...option,
    icon: <InboxItemTypeIcon kind="email" size={14} />,
  }));
}
