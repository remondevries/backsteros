"use client";

import { MailIcon } from "@primer/octicons-react";

import type { SearchableDropdownOption } from "../components/dropdowns/searchable-dropdown.js";
import { buildEmailRelatedPropertyOptionData } from "./email-related-property-option-data.js";
import type { EmailListItem } from "./email.js";

export function buildEmailRelatedPropertyOptions(
  messages: readonly EmailListItem[],
): SearchableDropdownOption<string>[] {
  return buildEmailRelatedPropertyOptionData(messages).map((option) => ({
    ...option,
    icon: <MailIcon size={14} />,
  }));
}
