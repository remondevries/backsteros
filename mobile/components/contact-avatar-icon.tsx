import { useEffect, useState } from "react";

import { colors } from "../lib/theme";
import { AvatarImage } from "./avatar-image";
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
      <AvatarImage src={src} size={size} onFail={() => setFailed(true)} />
    );
  }

  return <ContactPersonIcon size={size} color={color} />;
}
