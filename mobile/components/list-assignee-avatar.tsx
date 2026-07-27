import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { colors } from "../lib/theme";
import { ContactPersonIcon } from "./contact-person-icon";

const SIZE = 20;

type Props = {
  name?: string | null;
  src?: string | null;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/**
 * Compact circular assignee avatar for task list rows (desktop parity —
 * avatar only, no name label).
 */
export function ListAssigneeAvatar({ name, src }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const label = name?.trim() || "Assignee";
  const initials = name ? initialsFromName(name) : "";
  const showImage = Boolean(src) && !failed;

  return (
    <View
      style={styles.wrap}
      accessibilityLabel={label}
      accessibilityIgnoresInvertColors
    >
      {showImage ? (
        <Image
          source={{ uri: src! }}
          style={styles.image}
          onError={() => setFailed(true)}
        />
      ) : initials ? (
        <Text style={styles.initials}>{initials}</Text>
      ) : (
        <ContactPersonIcon size={12} color={colors.muted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  image: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  initials: {
    color: "rgba(237, 237, 237, 0.75)",
    fontSize: 8,
    fontWeight: "600",
    lineHeight: 10,
  },
});
