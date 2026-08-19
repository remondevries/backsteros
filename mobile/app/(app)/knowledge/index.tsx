import { Text, View } from "react-native";

import { DocumentsListPanel } from "../../../components/documents-list-panel";
import { isPadDevice } from "../../../lib/device";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen knowledge tree.
 * iPad: detail pane placeholder — list lives in the layout.
 */
export default function KnowledgeScreen() {
  if (isPadDevice()) {
    return (
      <View style={styles.empty}>
        <Text style={ui.empty}>Select a document from the list.</Text>
      </View>
    );
  }

  return (
    <DocumentsListPanel
      documentType="knowledge"
      includeFolders
      showListSearch
      emptyMessage="No knowledge documents yet."
      sectionRoute="knowledge"
      pageTitle="Knowledge Base"
      pageTitleSafeArea
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
