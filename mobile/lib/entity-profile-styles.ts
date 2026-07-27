import { StyleSheet } from "react-native";

import { colors } from "./theme";

/** Shared contact / organization overview profile chrome styles. */
export const entityProfileStyles = StyleSheet.create({
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  displayId: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontFamily: "Menlo",
  },
  name: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
    textAlign: "center",
  },
  nameInput: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
    textAlign: "center",
    width: "100%",
    paddingVertical: 2,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
  },
  subtitleInput: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
    width: "100%",
    paddingVertical: 2,
  },
  summaryBlock: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "stretch",
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  summary: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "left",
  },
  summaryInput: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "left",
    width: "100%",
    minHeight: 44,
    paddingVertical: 2,
  },
  summaryEmpty: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "left",
  },
});
