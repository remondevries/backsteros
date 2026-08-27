import { useNavigation } from "@react-navigation/native";
import { useLayoutEffect } from "react";
import { Text, View } from "react-native";

import { DocumentsListPanel } from "../../../components/documents-list-panel";
import { KnowledgeHeader } from "../../../components/knowledge-header";
import { isPadDevice } from "../../../lib/device";
import { ui } from "../../../lib/ui";

/**
 * Phone: full-screen knowledge tree.
 * iPad: detail pane placeholder — list lives in the layout.
 */
export default function KnowledgeScreen() {
  const navigation = useNavigation();
  const isPad = isPadDevice();

  useLayoutEffect(() => {
    if (isPad) return;
    navigation.setOptions({
      header: () => <KnowledgeHeader />,
    });
  }, [isPad, navigation]);

  if (isPad) {
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
