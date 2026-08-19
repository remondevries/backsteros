import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  MOBILE_FINANCE_SECTIONS,
  type MobileFinanceSectionId,
} from "../../lib/finance-sections";
import { colors } from "../../lib/theme";
import { PillNav } from "../pill-nav";

type Props = {
  section: MobileFinanceSectionId;
  onSectionChange: (section: MobileFinanceSectionId) => void;
};

/**
 * Phone Finance header — sticky section pills only.
 * Section titles + actions (add / filter) share a row in scrolling content.
 */
export function FinanceHeader({ section, onSectionChange }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 10,
        backgroundColor: colors.background,
      }}
    >
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
    </View>
  );
}
