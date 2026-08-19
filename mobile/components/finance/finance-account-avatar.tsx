import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";

import { colors } from "../../lib/theme";

type Props = {
  src?: string | null;
  name: string;
  size?: number;
};

function isSvgUri(uri: string): boolean {
  const path = uri.split("?")[0]?.toLowerCase() ?? "";
  return path.endsWith(".svg");
}

/**
 * Bank-account list avatar — uploaded logo when present, otherwise the
 * first letter of the name (desktop `EntityListAvatar` + fallback parity).
 * Always a rounded square, never a color dot.
 * SVG logos use `SvgUri` because RN `Image` cannot render them.
 */
export function FinanceAccountAvatar({ src, name, size = 28 }: Props) {
  const [mode, setMode] = useState<"image" | "svg" | "fallback">("image");
  const radius = Math.max(3, Math.round(size * 0.22));
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setMode(src && isSvgUri(src) ? "svg" : "image");
  }, [src]);

  if (src && mode !== "fallback") {
    return (
      <View
        style={[
          styles.wrap,
          { width: size, height: size, borderRadius: radius },
        ]}
        accessibilityElementsHidden
      >
        {mode === "svg" ? (
          <SvgUri
            uri={src}
            width={size}
            height={size}
            onError={() => setMode("fallback")}
          />
        ) : (
          <Image
            source={{ uri: src }}
            style={{ width: size, height: size, borderRadius: radius }}
            onError={() => setMode("svg")}
            accessibilityIgnoresInvertColors
          />
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        styles.fallback,
        { width: size, height: size, borderRadius: radius },
      ]}
      accessibilityElementsHidden
    >
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.45) }]}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  initial: {
    color: colors.muted,
    fontWeight: "600",
    includeFontPadding: false,
  },
});
