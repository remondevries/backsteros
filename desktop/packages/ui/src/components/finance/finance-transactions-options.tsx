"use client";

import { useMemo, type CSSProperties } from "react";

import type {
  FinancialCategory,
  FinancialGoal,
  FinancialRecurring,
} from "@backsteros/contracts";

import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_GOAL_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  DROPDOWN_NO_RECURRING_VALUE,
  buildOrganizationDropdownOptions,
} from "../dropdowns/dropdown-options.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { buildCategoryDropdownOptions } from "./finance-categories-view.js";
import {
  txCategoryColumnCssVars,
  useTxCategoryColumnWidthPx,
} from "../../finance/finance-tx-category-column-width.js";
import { FINANCE_FILTER_ALL_VALUE } from "./finance-transactions-filter-bar.js";
import { getEntityIconColor, ProjectOcticon } from "../projects/project-octicon.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";

export function useFinanceTransactionsOptions({
  organizations,
  projects,
  categories,
  goals,
  recurrings,
}: {
  organizations: Array<{
    id: string;
    name: string;
    key?: string | null;
    avatarSrc?: string | null;
  }>;
  projects: Array<{
    id: string;
    key: string;
    name: string;
    icon?: string | null;
    type?: string | null;
  }>;
  categories: FinancialCategory[];
  goals: FinancialGoal[];
  recurrings: FinancialRecurring[];
}): {
  orgOptions: SearchableDropdownOption[];
  projectOptions: SearchableDropdownOption[];
  goalOptions: SearchableDropdownOption[];
  recurringOptions: SearchableDropdownOption[];
  categoryOptions: SearchableDropdownOption[];
  categoryColumnStyle: CSSProperties;
  filterCategoryOptions: SearchableDropdownOption[];
  filterOrganizationOptions: SearchableDropdownOption[];
  filterGoalOptions: SearchableDropdownOption[];
  filterRecurringOptions: SearchableDropdownOption[];
} {
  const orgOptions = useMemo(
    () => buildOrganizationDropdownOptions(organizations),
    [organizations],
  );
  const projectOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NO_PROJECT_VALUE,
        label: "No project",
        searchTerms: "no project unassigned",
        icon: <DefaultProjectIcon size={14} className="text-foreground/70" />,
      },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
        searchTerms: `${project.key} ${project.name}`,
      })),
    ],
    [projects],
  );
  const goalOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NO_GOAL_VALUE,
        label: "No goal",
        searchTerms: "no goal unassigned",
        icon: <DefaultProjectIcon size={14} className="text-foreground/70" />,
      },
      ...[...goals]
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map((goal) => ({
          value: goal.id,
          label: goal.name,
          searchTerms: `${goal.name} ${goal.listing}`,
          icon: (
            <ProjectOcticon
              icon={goal.icon}
              size={14}
              style={
                getEntityIconColor(goal.icon)
                  ? { color: getEntityIconColor(goal.icon)! }
                  : undefined
              }
            />
          ),
        })),
    ],
    [goals],
  );
  const recurringOptions = useMemo(
    () => [
      {
        value: DROPDOWN_NO_RECURRING_VALUE,
        label: "No recurring",
        searchTerms: "no recurring unassigned none",
        icon: <DefaultProjectIcon size={14} className="text-foreground/70" />,
      },
      ...[...recurrings]
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        )
        .map((entry) => ({
          value: entry.id,
          label: entry.name,
          searchTerms: entry.name,
          icon: (
            <ProjectOcticon
              icon={entry.icon}
              size={14}
              style={
                getEntityIconColor(entry.icon)
                  ? { color: getEntityIconColor(entry.icon)! }
                  : undefined
              }
            />
          ),
        })),
    ],
    [recurrings],
  );
  const categoryOptions = useMemo(
    () => buildCategoryDropdownOptions(categories),
    [categories],
  );
  const categoryNames = useMemo(
    () => categories.map((entry) => entry.name),
    [categories],
  );
  const categoryColumnWidthPx = useTxCategoryColumnWidthPx(categoryNames);
  const categoryColumnStyle = useMemo(
    () => txCategoryColumnCssVars(categoryColumnWidthPx),
    [categoryColumnWidthPx],
  );
  const filterCategoryOptions = useMemo(
    () =>
      buildCategoryDropdownOptions(categories, { noneLabel: "Uncategorized" }),
    [categories],
  );
  const filterOrganizationOptions = useMemo(
    () => [
      {
        value: FINANCE_FILTER_ALL_VALUE,
        label: "Organizations",
        searchTerms: "all organizations any",
      },
      {
        value: DROPDOWN_NONE_VALUE,
        label: "No organization",
        searchTerms: "none unassigned no organization",
      },
      ...orgOptions.filter((option) => option.value !== DROPDOWN_NONE_VALUE),
    ],
    [orgOptions],
  );
  const filterGoalOptions = useMemo(
    () => [
      {
        value: FINANCE_FILTER_ALL_VALUE,
        label: "Goals",
        searchTerms: "all goals any",
      },
      {
        value: DROPDOWN_NO_GOAL_VALUE,
        label: "No goal",
        searchTerms: "none unassigned no goal",
      },
      ...goalOptions.filter((option) => option.value !== DROPDOWN_NO_GOAL_VALUE),
    ],
    [goalOptions],
  );
  const filterRecurringOptions = useMemo(
    () => [
      {
        value: FINANCE_FILTER_ALL_VALUE,
        label: "Recurrings",
        searchTerms: "all recurrings any",
      },
      {
        value: DROPDOWN_NO_RECURRING_VALUE,
        label: "No recurring",
        searchTerms: "none unassigned no recurring",
      },
      ...recurringOptions.filter(
        (option) => option.value !== DROPDOWN_NO_RECURRING_VALUE,
      ),
    ],
    [recurringOptions],
  );

  return {
    orgOptions,
    projectOptions,
    goalOptions,
    recurringOptions,
    categoryOptions,
    categoryColumnStyle,
    filterCategoryOptions,
    filterOrganizationOptions,
    filterGoalOptions,
    filterRecurringOptions,
  };
}
