import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";

import { colors } from "../lib/theme";
import { ContactPersonIcon } from "./contact-person-icon";
import { OrganizationIcon } from "./organization-icon";
import { PencilIcon } from "./pencil-icon";

type Kind = "contact" | "organization";

type Props = {
  kind: Kind;
  name: string;
  src?: string | null;
  size?: number;
  /** When set, shows a pencil overlay and opens the picker on press. */
  onPressEdit?: () => void;
  uploading?: boolean;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** Large circular avatar for contact/organization profile headers. */
export function EntityProfileAvatar({
  kind,
  name,
  src,
  size = 88,
  onPressEdit,
  uploading = false,
}: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const radius = size / 2;
  const showImage = Boolean(src) && !failed;
  const initials = initialsFromName(name);
  const editable = Boolean(onPressEdit);

  const avatar = (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
      ]}
      accessibilityIgnoresInvertColors
    >
      {showImage ? (
        <Image
          source={{ uri: src! }}
          style={{ width: size, height: size, borderRadius: radius }}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.fallback}>
          {initials !== "?" ? (
            <Text style={[styles.initials, { fontSize: size * 0.32 }]}>
              {initials}
            </Text>
          ) : kind === "organization" ? (
            <OrganizationIcon size={size * 0.4} color={colors.muted} />
          ) : (
            <ContactPersonIcon size={size * 0.4} color={colors.muted} />
          )}
        </View>
      )}
      {editable ? (
        <View style={styles.editOverlay} pointerEvents="none">
          <View style={styles.editBadge}>
            <PencilIcon size={16} color={colors.foreground} />
          </View>
        </View>
      ) : null}
    </View>
  );

  if (!editable) return avatar;

  return (
    <Pressable
      onPress={onPressEdit}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel="Change photo"
      style={({ pressed }) => [
        { opacity: uploading ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {avatar}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    backgroundColor: colors.faint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: colors.foreground,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  editBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(20, 20, 22, 0.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
});
