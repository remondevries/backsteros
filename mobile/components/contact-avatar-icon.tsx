import { useEffect, useState } from "react";
import { Image } from "react-native";

import { colors } from "../lib/theme";
import { ContactPersonIcon } from "./contact-person-icon";

type Props = {
  src?: string | null;
  size?: number;
  color?: string;
};

/**
 * Round contact avatar for property rows / pickers — uploaded image when
 * present, otherwise the person glyph (desktop `EntityAvatarIcon` parity).
 */
export function ContactAvatarIcon({
  src,
  size = 14,
  color = colors.muted,
}: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      <Image
        source={{ uri: src }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        accessibilityIgnoresInvertColors
        onError={() => setFailed(true)}
      />
    );
  }

  return <ContactPersonIcon size={size} color={color} />;
}
