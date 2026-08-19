import { Text, View } from "react-native";

import {
  getEntityIconColor,
  isEmojiProjectIconDisplay,
  parseDisplayEntityIcon,
} from "../lib/project-display-icon";
import { colors } from "../lib/theme";
import { DocumentIcon } from "./document-icon";

type Props = {
  icon: string | null | undefined;
  size?: number;
  color?: string;
};

/**
 * Document glyph — emoji / short glyph, else default DocumentIcon.
 * Matches desktop `DocumentOcticon` (octicon keys fall back until RN registry exists).
 */
export function DocumentOcticon({
  icon,
  size = 16,
  color,
}: Props) {
  const { display, color: payloadColor } = parseDisplayEntityIcon(icon);
  const paint = color ?? payloadColor ?? colors.foreground;

  if (!display) {
    return <DocumentIcon size={size} color={paint} />;
  }

  if (isEmojiProjectIconDisplay(display) || display.length <= 2) {
    return (
      <View
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          style={{
            fontSize: Math.round(size * 0.85),
            lineHeight: size,
            textAlign: "center",
          }}
        >
          {display}
        </Text>
      </View>
    );
  }

  return <DocumentIcon size={size} color={paint} />;
}
