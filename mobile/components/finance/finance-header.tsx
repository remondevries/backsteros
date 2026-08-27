import {
  MOBILE_FINANCE_SECTIONS,
  type MobileFinanceSectionId,
} from "../../lib/finance-sections";
import { PillNav } from "../pill-nav";
import { SectionListHeader } from "../section-list-header";

type Props = {
  section: MobileFinanceSectionId;
  onSectionChange: (section: MobileFinanceSectionId) => void;
};

/** Phone Finance header — title row + section pills (Tasks-style). */
export function FinanceHeader({ section, onSectionChange }: Props) {
  return (
    <SectionListHeader
      title="Finance"
      below={
        <PillNav
          accessibilityLabel="Finance section"
          value={section}
          onChange={onSectionChange}
          align="start"
          items={MOBILE_FINANCE_SECTIONS.map((item) => ({
            value: item.id,
            label: item.label,
          }))}
        />
      }
    />
  );
}
