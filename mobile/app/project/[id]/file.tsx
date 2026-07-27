import { Stack, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { ProjectFsFileEditor } from "../../../components/codebase/project-fs-file-editor";
import { colors } from "../../../lib/theme";
import { ui } from "../../../lib/ui";

/** Phone stack route: edit a project working-directory file via Core FS API. */
export default function ProjectFileEditorScreen() {
  const { id, path: pathParam } = useLocalSearchParams<{
    id: string;
    path?: string;
  }>();
  const projectId = typeof id === "string" ? id : "";
  const filePath =
    typeof pathParam === "string"
      ? pathParam
      : Array.isArray(pathParam)
        ? (pathParam[0] ?? "")
        : "";

  const title = filePath.split("/").pop() || "File";

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      {!projectId || !filePath ? (
        <View style={[ui.screen, { padding: 16 }]}>
          <Text style={{ color: colors.danger }}>Missing file path.</Text>
        </View>
      ) : (
        <ProjectFsFileEditor projectId={projectId} openPath={filePath} />
      )}
    </>
  );
}
