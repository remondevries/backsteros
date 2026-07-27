import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useLayoutEffect } from "react";
import { View } from "react-native";

import { DocumentsListPanel } from "../../../components/documents-list-panel";
import { DocumentIcon } from "../../../components/document-icon";
import { FolderIcon } from "../../../components/folder-icon";
import { HeaderPlusMenuButton } from "../../../components/header-plus-menu-button";
import { SectionListHeader } from "../../../components/section-list-header";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";

export default function KnowledgeScreen() {
  const navigation = useNavigation();
  const router = useRouter();

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <SectionListHeader
          title="Knowledge Base"
          plusControl={
            <HeaderPlusMenuButton
              accessibilityLabel="Create in Knowledge Base"
              items={[
                {
                  key: "folder",
                  label: "Folder",
                  icon: <FolderIcon size={16} color={colors.foreground} />,
                  onPress: () =>
                    router.push({
                      pathname: "/create/folder",
                      params: { type: "knowledge" },
                    }),
                },
                {
                  key: "document",
                  label: "Document",
                  icon: <DocumentIcon size={16} color={colors.foreground} />,
                  onPress: () =>
                    router.push({
                      pathname: "/create/document",
                      params: { type: "knowledge" },
                    }),
                },
              ]}
            />
          }
        />
      ),
    });
  }, [navigation, router]);

  return (
    <View style={ui.screen}>
      <DocumentsListPanel
        documentType="knowledge"
        includeFolders
        showListSearch
        emptyMessage="No knowledge documents yet."
      />
    </View>
  );
}
