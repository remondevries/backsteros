import { StyleSheet, View } from "react-native";

import { ProjectOcticon } from "./project-octicon";

type Props = {
  icon: string | null | undefined;
  type?: string | null;
  /** Glyph size in px. Default 28 — matches desktop overview. */
  size?: number;
};

/**
 * Project overview icon tile — bordered 36×36 chrome around the glyph
 * (parity with desktop `.project-overview-icon`).
 */
export function ProjectOverviewIcon({ icon, type, size = 28 }: Props) {
  return (
    <View style={styles.tile} accessibilityElementsHidden>
      <ProjectOcticon icon={icon} type={type} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
});
