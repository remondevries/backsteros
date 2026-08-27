import { useRouter } from "expo-router";

import { DocumentIcon } from "./document-icon";
import { FolderIcon } from "./folder-icon";
import {
  HeaderPlusMenuButton,
} from "./header-plus-menu-button";
import { PadSidePanelCollapseButton } from "../lib/pad-side-panel-collapse";
import { colors } from "../lib/theme";
import { CommandPaletteSearchButton } from "./command-palette/command-palette-search-button";
import { SectionListHeader } from "./section-list-header";

/** Plus menu — folder / document create for Knowledge Base. */
export function KnowledgeHeaderPlus() {
  const router = useRouter();

  return (
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
  );
}

/** iPad list-pane header (outside the detail stack). */
export function KnowledgeHeader({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
} = {}) {
  return (
    <SectionListHeader
      title="Knowledge Base"
      showGlobalSearch
      plusControl={<KnowledgeHeaderPlus />}
      trailingControl={
        onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Knowledge list"
          />
        ) : null
      }
    />
  );
}
