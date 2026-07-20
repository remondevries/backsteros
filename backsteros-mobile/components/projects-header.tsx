import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabStackHeaderPlusButton } from "../lib/tab-stack-options";
import {
  getProjectAreaFilterLabel,
  PROJECT_AREA_FILTERS,
  type ProjectAreaFilter,
} from "../lib/project-areas";
import { colors, spacing } from "../lib/theme";
import { PillNav } from "./pill-nav";

type Props = {
  area: ProjectAreaFilter;
  onAreaChange: (area: ProjectAreaFilter) => void;
};

export function ProjectsHeader({ area, onAreaChange }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{
          paddingHorizontal: spacing.screenX,
          paddingBottom: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            color: colors.foreground,
            fontWeight: "600",
            fontSize: 22,
          }}
        >
          Projects
        </Text>
        <TabStackHeaderPlusButton
          onPress={() =>
            router.push({
              pathname: "/(app)/projects/new",
              params: { area },
            })
          }
          accessibilityLabel="Create project"
        />
      </View>
      <PillNav
        accessibilityLabel="Project area"
        value={area}
        onChange={onAreaChange}
        items={PROJECT_AREA_FILTERS.map((value) => ({
          value,
          label: getProjectAreaFilterLabel(value),
        }))}
      />
    </View>
  );
}
