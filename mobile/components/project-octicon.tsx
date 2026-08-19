import { Text, View } from "react-native";

import {
  isEmojiProjectIconDisplay,
  parseDisplayEntityIcon,
} from "../lib/project-display-icon";
import { migrateLegacyProjectType } from "../lib/project-type";
import { colors } from "../lib/theme";
import {
  CustomEntityIcon,
  hasCustomEntityIcon,
} from "./custom-entity-icon";
import { hasPrimerOcticon, PrimerOcticon } from "./primer-octicon";
import { ProjectIcon } from "./project-icon";
import { TerminalConsoleIcon } from "./terminal-console-icon";

type Props = {
  icon: string | null | undefined;
  type?: string | null;
  size?: number;
  color?: string;
};

function DefaultGlyphForType({
  type,
  size,
  color,
}: {
  type: string | null | undefined;
  size: number;
  color: string;
}) {
  if (migrateLegacyProjectType(type) === "codebase") {
    return <TerminalConsoleIcon size={size} color={color} />;
  }
  return <ProjectIcon size={size} color={color} />;
}

/**
 * Project / habit glyph — emoji, custom entity key, Primer octicon, type default
 * (terminal for codebase), or default project mark. Parity with desktop
 * `ProjectOcticon` (including desktop-only keys like apple / water / gym).
 */
export function ProjectOcticon({
  icon,
  type,
  size = 16,
  color,
}: Props) {
  const { display, color: payloadColor } = parseDisplayEntityIcon(icon);
  const paint = color ?? payloadColor ?? colors.foreground;

  if (!display) {
    return <DefaultGlyphForType type={type} size={size} color={paint} />;
  }

  if (isEmojiProjectIconDisplay(display)) {
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

  if (display === "terminal") {
    return <TerminalConsoleIcon size={size} color={paint} />;
  }

  if (hasCustomEntityIcon(display)) {
    return <CustomEntityIcon name={display} size={size} color={paint} />;
  }

  if (hasPrimerOcticon(display)) {
    return <PrimerOcticon name={display} size={size} color={paint} />;
  }

  return <DefaultGlyphForType type={type} size={size} color={paint} />;
}
