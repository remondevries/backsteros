import { Image as ExpoImage } from "expo-image";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SvgUri } from "react-native-svg";

import { isSvgAvatarUri } from "../lib/avatar-uri";

type Props = {
  src: string;
  size: number;
  /** Defaults to a circle. */
  borderRadius?: number;
  /** Called when neither raster nor SVG rendering succeeds. */
  onFail?: () => void;
};

/**
 * Uploaded avatar — raster via `expo-image` (disk/memory cache), `.svg` via
 * `SvgUri`. Raster failures retry as SVG before giving up.
 */
export function AvatarImage({ src, size, borderRadius, onFail }: Props) {
  const radius = borderRadius ?? size / 2;
  const [mode, setMode] = useState<"image" | "svg">(() =>
    isSvgAvatarUri(src) ? "svg" : "image",
  );

  useEffect(() => {
    setMode(isSvgAvatarUri(src) ? "svg" : "image");
  }, [src]);

  if (mode === "svg") {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: "hidden",
        }}
        accessibilityIgnoresInvertColors
      >
        <SvgUri uri={src} width={size} height={size} onError={onFail} />
      </View>
    );
  }

  return (
    <ExpoImage
      source={{ uri: src }}
      recyclingKey={src}
      cachePolicy="memory-disk"
      style={{ width: size, height: size, borderRadius: radius }}
      accessibilityIgnoresInvertColors
      onError={() => setMode("svg")}
    />
  );
}
