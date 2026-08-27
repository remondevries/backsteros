import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { TabStackHeaderPlusButton } from "../../lib/tab-stack-options";
import { colors } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { CommandPaletteSearchButton } from "../command-palette/command-palette-search-button";

type Props = {
  title?: string;
  selectedDay?: Date;
};

export function CalendarHeader({
  title = "Calendar",
  selectedDay = new Date(),
}: Props) {
  const router = useRouter();
  const weekLabel = selectedDay.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text style={[ui.detailTitle, { flex: 1 }]}>{title}</Text>
        <CommandPaletteSearchButton accessibilityLabel="Search" />
        <TabStackHeaderPlusButton
          onPress={() => router.push("/create/meeting")}
          accessibilityLabel="Create meeting"
        />
      </View>
      <Text style={[ui.body, { color: colors.muted, marginTop: 4 }]}>
        {weekLabel}
      </Text>
    </View>
  );
}
