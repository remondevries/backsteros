import { useNavigation } from "expo-router/react-navigation";
import { useLayoutEffect } from "react";
import { Text, View } from "react-native";

import { OrganizationsHeader } from "../../../components/organizations-header";
import { OrganizationsListPane } from "../../../components/organizations-list-pane";
import { isPadDevice } from "../../../lib/device";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen organizations list.
 * iPad: detail pane placeholder — list lives in the layout.
 */
export default function OrganizationsScreen() {
  const navigation = useNavigation();
  const isPad = isPadDevice();

  useLayoutEffect(() => {
    if (isPad) return;
    navigation.setOptions({
      header: () => <OrganizationsHeader />,
    });
  }, [isPad, navigation]);

  if (isPad) {
    return (
      <View style={styles.empty}>
        <Text style={ui.empty}>Select an organization from the list.</Text>
      </View>
    );
  }

  return <OrganizationsListPane />;
}

const styles = {
  empty: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "transparent",
    paddingHorizontal: 24,
  },
};
