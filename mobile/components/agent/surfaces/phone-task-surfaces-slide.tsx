import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { FullWindowOverlay } from "react-native-screens";

import { useHideTabBar } from "../../../lib/tab-bar-visibility";
import { colors } from "../../../lib/theme";
import { PhoneSurfacesNavHeader } from "./phone-surfaces-nav-header";
import {
  TaskAgentSurfacesHost,
  type SurfaceTabsController,
  type TaskAgentSurfacesHostProps,
} from "./task-agent-surfaces-host";

/** Match iOS UINavigationController push timing / curve. */
const OPEN_MS = 350;
const CLOSE_MS = 350;
const IOS_PUSH_EASING = Easing.bezier(0.32, 0.72, 0, 1);

type Props = TaskAgentSurfacesHostProps & {
  visible: boolean;
  /** Keep the host mounted (hidden) so tabs/session stay hot for the pulse indicator. */
  keepMounted?: boolean;
  onBack: () => void;
  controller: SurfaceTabsController | null;
};

/**
 * iPhone full-screen surfaces — UINavigation-style push from the right
 * (pop exits to the right). Uses FullWindowOverlay so the slide covers the
 * stack header without collapsing it (which reads as a bottom-up motion).
 */
export function PhoneTaskSurfacesSlide({
  visible,
  keepMounted = false,
  onBack,
  controller,
  ...hostProps
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible || keepMounted);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useHideTabBar(visible);

  useEffect(() => {
    if (visible || keepMounted) setMounted(true);
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? OPEN_MS : CLOSE_MS,
      easing: IOS_PUSH_EASING,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visibleRef.current && !keepMounted) {
        setMounted(false);
      }
    });
  }, [keepMounted, progress, visible]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [windowWidth, 0],
  });

  if (!mounted) return null;

  const panel = (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.root,
        {
          transform: [{ translateX }],
        },
      ]}
      accessibilityViewIsModal={visible}
      accessibilityLabel="Task surfaces"
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    >
      <PhoneSurfacesNavHeader onBack={onBack} controller={controller} />
      <View style={styles.body}>
        <TaskAgentSurfacesHost {...hostProps} />
      </View>
    </Animated.View>
  );

  if (Platform.OS === "ios") {
    return <FullWindowOverlay>{panel}</FullWindowOverlay>;
  }

  return panel;
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
