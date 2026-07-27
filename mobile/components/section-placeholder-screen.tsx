import { Text, View } from "react-native";

import { FLOATING_TAB_BAR_CLEARANCE } from "../lib/tab-bar-inset";
import {
  TabStackHeader,
  tabRootScreenOptions,
} from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";

/** Simple placeholder list shell for More-menu destinations. */
export function SectionPlaceholderScreen({ body }: { body: string }) {
  return (
    <View
      style={[
        ui.screen,
        {
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
        },
      ]}
    >
      <Text style={[ui.body, { color: colors.muted }]}>{body}</Text>
    </View>
  );
}

export function sectionPlaceholderOptions(title: string) {
  return {
    ...tabRootScreenOptions(title),
    header: () => <TabStackHeader title={title} />,
  };
}
