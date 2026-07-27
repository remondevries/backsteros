import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * Desktop content columns use `max-width: 800px` (see
 * `.content-markdown-preview-column` / editor column in `@backsteros/ui`).
 */
export const DETAIL_CONTENT_MAX_WIDTH = 800;

type Props = {
  children: ReactNode;
  /** When false, children render full-bleed (phone). Default true. */
  constrained?: boolean;
  /** Stretch to fill the parent (lists / split panes). */
  fill?: boolean;
};

/**
 * Centers long-form detail content at a readable measure on wide layouts
 * (iPad split task view). Phone passes `constrained={false}`.
 */
export function DetailContentContainer({
  children,
  constrained = true,
  fill = false,
}: Props) {
  if (!constrained) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.outer, fill ? styles.fill : null]}>
      <View style={[styles.inner, fill ? styles.fill : null]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: "100%",
    alignItems: "center",
  },
  inner: {
    width: "100%",
    maxWidth: DETAIL_CONTENT_MAX_WIDTH,
  },
  fill: {
    flex: 1,
  },
});
