import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PAD_CONTENT_INSET } from "../lib/pad-side-panel-collapse";
import { colors } from "../lib/theme";

const OPEN_MS = 280;
const CLOSE_MS = 220;

type Props = {
  visible: boolean;
  /** Called after the slide-out animation finishes (e.g. `router.back()`). */
  onClose: () => void;
  /**
   * Panel body. Receives `requestClose` so headers can animate out before
   * navigation pops.
   */
  children: (requestClose: () => void) => ReactNode;
  /** Fraction of window width for the card (clamped). Default ~0.52. */
  widthRatio?: number;
  maxWidth?: number;
  minWidth?: number;
  accessibilityLabel?: string;
};

/**
 * iPad detail card that slides in from the right over the full window
 * (covers side nav + content frame). Floated below the status bar with the
 * same top inset language as `PadContentFrame`, flush to the bottom of the
 * viewport. Uses FullWindowOverlay so the list underneath stays mounted.
 */
export function PadSlideOverPanel({
  visible,
  onClose,
  children,
  widthRatio = 0.55,
  maxWidth = 680,
  minWidth = 400,
  accessibilityLabel = "Detail panel",
}: Props) {
  const insets = useSafeAreaInsets();
  const windowWidth = Dimensions.get("window").width;
  const panelWidth = Math.min(
    maxWidth,
    Math.max(minWidth, Math.round(windowWidth * widthRatio)),
  );

  const progress = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      closingRef.current = false;
      return;
    }
    closingRef.current = false;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      useNativeDriver: true,
    }).start();
  }, [progress, visible]);

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
      else closingRef.current = false;
    });
  };

  if (!visible) return null;

  const topInset = Math.max(insets.top, PAD_CONTENT_INSET) + PAD_CONTENT_INSET;
  const rightInset = PAD_CONTENT_INSET;
  // Use screen height so FullWindowOverlay reaches the physical bottom edge.
  const panelHeight = Dimensions.get("screen").height - topInset;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [panelWidth + rightInset + 24, 0],
  });
  const scrimOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const overlay = (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View
        style={[styles.scrim, { opacity: scrimOpacity }]}
        pointerEvents="none"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss detail"
        onPress={requestClose}
        style={styles.dismiss}
      />
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.panel,
          {
            width: panelWidth,
            top: topInset,
            height: panelHeight,
            right: rightInset,
            transform: [{ translateX }],
          },
        ]}
      >
        {children(requestClose)}
      </Animated.View>
    </View>
  );

  if (Platform.OS === "ios") {
    return <FullWindowOverlay>{overlay}</FullWindowOverlay>;
  }

  return overlay;
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  dismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: -4, height: 4 },
    elevation: 16,
    overflow: "hidden",
  },
});
