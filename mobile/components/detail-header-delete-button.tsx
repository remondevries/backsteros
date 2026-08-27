import { Alert } from "react-native";

import { TabStackHeaderIconButton } from "../lib/tab-stack-options";
import { colors } from "../lib/theme";
import { MoreHorizontalIcon } from "./more-horizontal-icon";

type Props = {
  onDelete: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** Native stack header ⋯ — opens delete confirmation (single destructive action). */
export function DetailHeaderDeleteButton({
  onDelete,
  disabled = false,
  accessibilityLabel = "Entity actions",
}: Props) {
  return (
    <TabStackHeaderIconButton
      accessibilityLabel={accessibilityLabel}
      chrome="plain"
      disabled={disabled}
      onPress={() => {
        Alert.alert("Actions", undefined, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: onDelete },
        ]);
      }}
    >
      <MoreHorizontalIcon size={18} color={colors.foreground} />
    </TabStackHeaderIconButton>
  );
}
