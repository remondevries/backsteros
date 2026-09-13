import { Stack } from "expo-router";

import { iosStackGestureOptions } from "../../../lib/tab-stack-options";

import { colors } from "../../../lib/theme";

export default function CatalogLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        ...iosStackGestureOptions,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Catalog",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
