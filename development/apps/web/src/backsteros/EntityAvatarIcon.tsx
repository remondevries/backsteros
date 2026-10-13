import { useState } from "react";

import { BacksterosContactPersonIcon } from "./ContactPersonIcon";
import { BacksterosOrganizationIcon } from "./OrganizationIcon";

/** Round avatar with person/org glyph fallback — matches desktop `EntityAvatarIcon`. */
export function BacksterosEntityAvatarIcon(props: {
  readonly src?: string | null | undefined;
  readonly size?: number;
  readonly className?: string | undefined;
  readonly kind?: "contact" | "organization";
}) {
  const size = props.size ?? 14;
  const kind = props.kind ?? "contact";
  const [failed, setFailed] = useState(false);

  if (props.src && !failed) {
    return (
      <img
        src={props.src}
        alt=""
        width={size}
        height={size}
        className={props.className}
        style={{
          borderRadius: "9999px",
          objectFit: "cover",
          width: size,
          height: size,
          display: "block",
        }}
        onError={() => setFailed(true)}
      />
    );
  }

  if (kind === "organization") {
    return <BacksterosOrganizationIcon size={size} className={props.className ?? "opacity-70"} />;
  }

  return <BacksterosContactPersonIcon size={size} className={props.className ?? "opacity-70"} />;
}
