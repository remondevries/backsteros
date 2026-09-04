import { useNavigation } from "expo-router/react-navigation";
import { useLayoutEffect } from "react";
import { Text, View } from "react-native";

import { ContactsHeader } from "../../../components/contacts-header";
import { ContactsListPane } from "../../../components/contacts-list-pane";
import { isPadDevice } from "../../../lib/device";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen contacts list.
 * iPad: detail pane placeholder — list lives in the layout.
 */
export default function ContactsScreen() {
  const navigation = useNavigation();
  const isPad = isPadDevice();

  useLayoutEffect(() => {
    if (isPad) return;
    navigation.setOptions({
      header: () => <ContactsHeader />,
    });
  }, [isPad, navigation]);

  if (isPad) {
    return (
      <View style={styles.empty}>
        <Text style={ui.empty}>Select a contact from the list.</Text>
      </View>
    );
  }

  return <ContactsListPane />;
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
