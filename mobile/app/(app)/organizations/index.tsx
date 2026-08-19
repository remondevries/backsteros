import { Text, View } from "react-native";

import { OrganizationsHeaderPlus } from "../../../components/organizations-header";
import { OrganizationsListPane } from "../../../components/organizations-list-pane";
import { isPadDevice } from "../../../lib/device";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen organizations list.
 * iPad: detail pane placeholder — list lives in the layout.
 */
export default function OrganizationsScreen() {
  if (isPadDevice()) {
    return (
      <View style={styles.empty}>
        <Text style={ui.empty}>Select an organization from the list.</Text>
      </View>
    );
  }

  return (
    <OrganizationsListPane
      pageTitle="Organizations"
      pageTitleSafeArea
      pageTitleTrailing={<OrganizationsHeaderPlus chrome="glass" />}
    />
  );
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
