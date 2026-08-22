import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AvatarImage } from "./avatar-image";

/**
 * Optional list-row avatar — uploaded image only, never a fallback icon
 * (desktop `EntityListAvatar` parity).
 */
export function EntityListAvatar({
  src,
  size = 18,
  shape = "circle",
}: {
  src?: string | null;
  size?: number;
  /** Defaults to circle; bank-account logos use rounded-square. */
  shape?: "circle" | "rounded-square";
}) {
  const [failed, setFailed] = useState(false);
  const radius =
    shape === "rounded-square" ? Math.max(3, Math.round(size * 0.22)) : size / 2;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return null;

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      <AvatarImage
        src={src}
        size={size}
        borderRadius={radius}
        onFail={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 2,
    overflow: "hidden",
    flexShrink: 0,
  },
});
