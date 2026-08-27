import { Pressable } from "react-native";

import { useCommandPaletteOptional } from "../../lib/use-command-palette";
import { colors } from "../../lib/theme";
import { SearchNavIcon } from "../nav-icons";

type Props = {
  accessibilityLabel?: string;
};

export function CommandPaletteSearchButton({
  accessibilityLabel = "Search",
}: Props) {
  const palette = useCommandPaletteOptional();
  if (!palette) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={palette.openPalette}
      style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
    >
      <SearchNavIcon color={colors.foreground} size={20} />
    </Pressable>
  );
}
