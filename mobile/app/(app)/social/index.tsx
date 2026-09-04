import { useNavigation } from "expo-router/react-navigation";
import { useLayoutEffect } from "react";
import { Text, View } from "react-native";

import { SocialHeader } from "../../../components/social-header";
import { SocialListPane } from "../../../components/social-list-pane";
import { isPadDevice } from "../../../lib/device";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen social list.
 * iPad: detail pane placeholder — list lives in the layout.
 */
export default function SocialScreen() {
  const navigation = useNavigation();
  const isPad = isPadDevice();

  useLayoutEffect(() => {
    if (isPad) return;
    navigation.setOptions({
      header: () => <SocialHeader />,
    });
  }, [isPad, navigation]);

  if (isPad) {
    return (
      <View style={styles.empty}>
        <Text style={ui.empty}>Select a contact from the list.</Text>
      </View>
    );
  }

  return <SocialListPane />;
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
