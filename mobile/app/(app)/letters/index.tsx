import { useNavigation } from "expo-router/react-navigation";
import { useLayoutEffect } from "react";
import { Text, View } from "react-native";

import { LettersHeader } from "../../../components/letters-header";
import { LettersListPane } from "../../../components/letters-list-pane";
import { isPadDevice } from "../../../lib/device";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen letters list.
 * iPad: detail pane placeholder — list lives in the layout; selection
 * auto-opens the first letter (desktop letters side-panel parity).
 */
export default function LettersScreen() {
  const navigation = useNavigation();
  const isPad = isPadDevice();

  useLayoutEffect(() => {
    if (isPad) return;
    navigation.setOptions({
      header: () => <LettersHeader />,
    });
  }, [isPad, navigation]);

  if (isPad) {
    return (
      <View style={styles.empty}>
        <Text style={ui.empty}>Select a letter from the list.</Text>
      </View>
    );
  }

  return <LettersListPane />;
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
