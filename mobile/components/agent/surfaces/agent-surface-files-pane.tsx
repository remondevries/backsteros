import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "../../../lib/theme";
import { ProjectFsFileEditor } from "../../codebase/project-fs-file-editor";
import { ProjectFsTree } from "../../codebase/project-fs-tree";

type Props = {
  projectId: string | null;
  cwd: string | null;
};

/**
 * Files surface — project FS tree + editor (codebase / cwd required).
 */
export function AgentSurfaceFilesPane({ projectId, cwd }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  if (!projectId || !cwd?.trim()) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No working directory</Text>
        <Text style={styles.emptyBody}>
          Set a project working directory to browse workspace files.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root} accessibilityLabel="Workspace files">
      <View style={styles.tree}>
        <ProjectFsTree
          projectId={projectId}
          selectedPath={selectedPath}
          onSelectFile={setSelectedPath}
          onClearSelection={() => setSelectedPath(null)}
          onTreeChanged={() => setRefreshToken((value) => value + 1)}
        />
      </View>
      <View style={styles.editor}>
        {selectedPath ? (
          <ProjectFsFileEditor
            projectId={projectId}
            openPath={selectedPath}
            refreshToken={refreshToken}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyBody}>Select a file to open.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  tree: {
    width: 220,
    flexShrink: 0,
    minHeight: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  editor: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
