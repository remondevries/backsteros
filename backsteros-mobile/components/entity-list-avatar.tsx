import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

/**
 * Optional list-row avatar — uploaded image only, never a fallback icon
 * (desktop `EntityListAvatar` parity).
 */
export function EntityListAvatar({
  src,
  size = 18,
}: {
  src?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return null;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 2,
    borderRadius: 999,
    overflow: "hidden",
    flexShrink: 0,
  },
});
