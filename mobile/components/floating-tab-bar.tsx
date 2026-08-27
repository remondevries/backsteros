import { BlurView } from "expo-blur";
import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";

import { CALENDAR_PAGE_MODE_OPTIONS } from "../lib/calendar/calendar-page-mode";
import { isPadDevice } from "../lib/device";
import { useTabBarVisibility } from "../lib/tab-bar-visibility";
import { colors } from "../lib/theme";
import { useCalendarPageMode } from "../lib/use-calendar-page-mode";
import { PrimerOcticon } from "./primer-octicon";
import {
  CalendarNavIcon,
  FinanceNavIcon,
  HabitsNavIcon,
  KnowledgeBaseNavIcon,
  LettersNavIcon,
  MoreNavIcon,
  SettingsNavIcon,
  TasksNavIcon,
} from "./nav-icons";
import { ContactPersonIcon } from "./contact-person-icon";
import { OrganizationIcon } from "./organization-icon";
import { ProjectIcon } from "./project-icon";

const ICON_SIZE = 22;
const PILL_HEIGHT = 56;
const SIDE_INSET = 16;
const PILL_GAP = 10;
const HIGHLIGHT_INSET = 4;
const COMPOSE_ROUTE = "compose";
/** iPhone: Inbox → Journal → Calendar → Tasks → More. */
const PHONE_PRIMARY_ROUTES = ["inbox", "journal", "calendar", "tasks"] as const;
/**
 * iPad: promote workspace destinations into the tray (extra width).
 * Projects takes the former Areas slot (includes codebase projects).
 */
const IPAD_PRIMARY_ROUTES = [
  "inbox",
  "email",
  "journal",
  "calendar",
  "tasks",
  "projects",
  "letters",
  "finance",
  "knowledge",
] as const;
const IPAD_MORE_SECTION_ROUTES = new Set([
  "habits",
  "contacts",
  "organizations",
]);
const PHONE_MORE_SECTION_ROUTES = new Set([
  "habits",
  "projects",
  "letters",
  "finance",
  "knowledge",
  "contacts",
  "organizations",
]);
const IS_IPAD = isPadDevice();
const PRIMARY_ROUTE_NAMES = IS_IPAD
  ? IPAD_PRIMARY_ROUTES
  : PHONE_PRIMARY_ROUTES;
const PRIMARY_ROUTES = new Set<string>(PRIMARY_ROUTE_NAMES);
const MORE_SECTION_ROUTES = IS_IPAD
  ? IPAD_MORE_SECTION_ROUTES
  : PHONE_MORE_SECTION_ROUTES;
/** Primary icons + trailing More button. */
const PRIMARY_SLOT_COUNT = PRIMARY_ROUTE_NAMES.length + 1;
const CALENDAR_PRIMARY_INDEX = PRIMARY_ROUTE_NAMES.indexOf("calendar");
const ROW_MAX_WIDTH = IS_IPAD ? 760 : 480;

const VISIBILITY_MS = 220;
const VISIBILITY_EASING = Easing.out(Easing.cubic);
const MORE_MENU_CLOSE_MS = 180;
const HIGHLIGHT_SPRING = {
  damping: 22,
  stiffness: 280,
  mass: 0.75,
};
const MORE_MENU_SPRING = {
  damping: 20,
  stiffness: 320,
  mass: 0.7,
};

type TabRoute = {
  key: string;
  name: string;
  params?: object;
};

type TabOptions = {
  title?: string;
  tabBarAccessibilityLabel?: string;
  tabBarIcon?: (props: {
    focused: boolean;
    color: string;
    size: number;
  }) => ReactNode;
};

/** Minimal props — avoids duplicate @react-navigation/bottom-tabs type roots in the monorepo. */
export type FloatingTabBarProps = {
  state: {
    index: number;
    routes: readonly TabRoute[];
  };
  descriptors: Record<string, { options: TabOptions }>;
  navigation: {
    emit: (event: {
      type: "tabPress" | "tabLongPress";
      target?: string;
      canPreventDefault?: boolean;
    }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
};

type MoreMenuItem = {
  key: string;
  label: string;
  onPress: () => void;
  icon: (color: string) => ReactNode;
};

function BlurPill({
  children,
  style,
  cornerRadius = PILL_HEIGHT / 2,
  fixedHeight = true,
}: {
  children: ReactNode;
  style?: object;
  cornerRadius?: number;
  fixedHeight?: boolean;
}) {
  return (
    <View
      style={[
        styles.pillShell,
        fixedHeight
          ? { height: PILL_HEIGHT }
          : { height: undefined, minHeight: 0 },
        { borderRadius: cornerRadius },
        style,
      ]}
    >
      <View style={styles.backdrop} pointerEvents="none">
        <BlurView
          intensity={55}
          tint="systemChromeMaterialDark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.pillFill} />
        <View
          style={[styles.pillBorder, { borderRadius: cornerRadius }]}
        />
      </View>
      {children}
    </View>
  );
}

function TabItem({
  route,
  focused,
  options,
  navigation,
  compact,
  onPressExtra,
  onPressOverride,
}: {
  route: TabRoute;
  focused: boolean;
  options: TabOptions;
  navigation: FloatingTabBarProps["navigation"];
  compact?: boolean;
  onPressExtra?: () => void;
  onPressOverride?: () => void;
}) {
  const router = useRouter();
  const color = focused ? colors.foreground : colors.muted;
  const label =
    options.tabBarAccessibilityLabel ?? options.title ?? route.name;

  const onPress = () => {
    if (onPressOverride) {
      onPressOverride();
      return;
    }
    onPressExtra?.();
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    // Expo Router href navigation (same as Go shortcuts) — tab
    // `navigation.navigate` no-ops from the floating bar while deep in a tab stack.
    if (!event.defaultPrevented) {
      router.navigate(`/${route.name}` as Href);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={compact ? styles.composeItem : styles.item}
    >
      {options.tabBarIcon?.({
        focused,
        color,
        size: ICON_SIZE,
      })}
    </Pressable>
  );
}

/**
 * Floating pill tab bar rendered in a FullWindowOverlay on iOS so nested
 * native stacks cannot steal hits from the JS tab bar layer.
 *
 * Phone primary: Inbox → Journal → Calendar → Tasks → More.
 * iPad primary: + Projects, Letters, Knowledge (More: people/settings).
 * Compose is a separate pill.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hidden } = useTabBarVisibility();
  const [moreOpen, setMoreOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [hasSlotWidth, setHasSlotWidth] = useState(false);
  const [overflowMenuWidth, setOverflowMenuWidth] = useState(0);
  // RN Modal can detach FullWindowOverlay on iOS — remount when becoming visible again.
  const [overlayEpoch, setOverlayEpoch] = useState(0);
  const wasHiddenRef = useRef(hidden);
  // iPad: flush to the bottom edge. Phone keeps a small gap above the home indicator.
  const bottom = IS_IPAD ? 0 : Math.max(insets.bottom, 10);

  const visibility = useSharedValue(hidden ? 0 : 1);
  const menuProgress = useSharedValue(0);
  const slotWidth = useSharedValue(0);
  const highlightIndex = useSharedValue(0);
  const highlightOpacity = useSharedValue(1);
  const composeHighlight = useSharedValue(0);

  const { setMode: setCalendarPageMode } = useCalendarPageMode();
  const overlayOpen = moreOpen || calendarOpen;
  const activeRouteName = state.routes[state.index]?.name ?? "";
  const moreSectionActive = MORE_SECTION_ROUTES.has(activeRouteName);
  const calendarRouteActive = activeRouteName === "calendar";

  const primaryRoutes = useMemo(() => {
    const byName = new Map(
      state.routes.map((route, index) => [route.name, { route, index }]),
    );
    return PRIMARY_ROUTE_NAMES.flatMap((name) => {
      const entry = byName.get(name);
      return entry ? [entry] : [];
    });
  }, [state.routes]);

  const composeEntry = useMemo(
    () =>
      state.routes
        .map((route, index) => ({ route, index }))
        .find(({ route }) => route.name === COMPOSE_ROUTE),
    [state.routes],
  );

  const focusedPrimaryIndex = useMemo(() => {
    if (moreOpen || moreSectionActive) return PRIMARY_SLOT_COUNT - 1;
    if (calendarOpen && CALENDAR_PRIMARY_INDEX >= 0) {
      return CALENDAR_PRIMARY_INDEX;
    }
    const idx = primaryRoutes.findIndex(
      ({ index }) => state.index === index,
    );
    return idx;
  }, [
    calendarOpen,
    moreOpen,
    moreSectionActive,
    primaryRoutes,
    state.index,
  ]);

  const composeFocused =
    composeEntry != null && state.index === composeEntry.index;

  useEffect(() => {
    setMoreOpen(false);
    setCalendarOpen(false);
  }, [activeRouteName]);

  useEffect(() => {
    if (hidden) {
      setMoreOpen(false);
      setCalendarOpen(false);
    } else if (wasHiddenRef.current) {
      setOverlayEpoch((epoch) => epoch + 1);
    }
    wasHiddenRef.current = hidden;
    visibility.value = withTiming(hidden ? 0 : 1, {
      duration: VISIBILITY_MS,
      easing: VISIBILITY_EASING,
    });
  }, [hidden, visibility]);

  useEffect(() => {
    if (overlayOpen) {
      setMenuMounted(true);
      menuProgress.value = withSpring(1, MORE_MENU_SPRING);
      return;
    }
    menuProgress.value = withTiming(
      0,
      { duration: MORE_MENU_CLOSE_MS, easing: VISIBILITY_EASING },
      (finished) => {
        if (finished) {
          runOnJS(setMenuMounted)(false);
        }
      },
    );
  }, [menuProgress, overlayOpen]);

  useEffect(() => {
    if (focusedPrimaryIndex >= 0) {
      highlightIndex.value = withSpring(focusedPrimaryIndex, HIGHLIGHT_SPRING);
      highlightOpacity.value = withTiming(1, {
        duration: 160,
        easing: VISIBILITY_EASING,
      });
    } else {
      highlightOpacity.value = withTiming(0, {
        duration: 160,
        easing: VISIBILITY_EASING,
      });
    }
  }, [focusedPrimaryIndex, highlightIndex, highlightOpacity]);

  useEffect(() => {
    composeHighlight.value = withTiming(composeFocused ? 1 : 0, {
      duration: 180,
      easing: VISIBILITY_EASING,
    });
  }, [composeFocused, composeHighlight]);

  const moreItems = useMemo<MoreMenuItem[]>(() => {
    const go = (name: string) => {
      router.navigate(`/${name}` as Href);
    };
    // No phone Email entry — email lives in Inbox there (desktop parity);
    // the iPad tray shows Email as a primary route.
    const overflow: MoreMenuItem[] = [];
    if (!PRIMARY_ROUTES.has("calendar")) {
      overflow.push({
        key: "calendar",
        label: "Calendar",
        onPress: () => go("calendar"),
        icon: (color) => <CalendarNavIcon color={color} size={18} />,
      });
    }
    overflow.push({
      key: "habits",
      label: "Habit Tracker",
      onPress: () => go("habits"),
      icon: (color) => <HabitsNavIcon color={color} size={18} />,
    });
    if (!PRIMARY_ROUTES.has("projects")) {
      overflow.push({
        key: "projects",
        label: "Projects",
        onPress: () => go("projects"),
        icon: (color) => <ProjectIcon size={18} color={color} />,
      });
    }
    if (!PRIMARY_ROUTES.has("letters")) {
      overflow.push({
        key: "letters",
        label: "Letters",
        onPress: () => go("letters"),
        icon: (color) => <LettersNavIcon color={color} size={18} />,
      });
    }
    if (!PRIMARY_ROUTES.has("finance")) {
      overflow.push({
        key: "finance",
        label: "Finance",
        onPress: () => go("finance"),
        icon: (color) => <FinanceNavIcon color={color} size={18} />,
      });
    }
    if (!PRIMARY_ROUTES.has("knowledge")) {
      overflow.push({
        key: "knowledge",
        label: "Knowledge Base",
        onPress: () => go("knowledge"),
        icon: (color) => <KnowledgeBaseNavIcon color={color} size={18} />,
      });
    }
    overflow.push(
      {
        key: "contacts",
        label: "Contacts",
        onPress: () => go("contacts"),
        icon: (color) => <ContactPersonIcon size={18} color={color} />,
      },
      {
        key: "organizations",
        label: "Organizations",
        onPress: () => go("organizations"),
        icon: (color) => <OrganizationIcon size={18} color={color} />,
      },
      {
        key: "settings",
        label: "Settings",
        onPress: () => router.push("/settings"),
        icon: (color) => <SettingsNavIcon color={color} size={18} />,
      },
    );
    return overflow;
  }, [router]);

  const hostAnimatedStyle = useAnimatedStyle(() => ({
    opacity: visibility.value,
    transform: [{ translateY: (1 - visibility.value) * 14 }],
  }));

  const moreScrimStyle = useAnimatedStyle(() => ({
    opacity: menuProgress.value,
  }));

  const moreMenuStyle = useAnimatedStyle(() => ({
    opacity: menuProgress.value,
    transform: [{ translateY: (1 - menuProgress.value) * 12 }],
  }));

  const highlightStyle = useAnimatedStyle(() => {
    const width = Math.max(slotWidth.value - HIGHLIGHT_INSET * 2, 0);
    return {
      opacity: highlightOpacity.value,
      width,
      transform: [
        {
          translateX:
            highlightIndex.value * slotWidth.value + HIGHLIGHT_INSET,
        },
      ],
    };
  });

  const composeHighlightStyle = useAnimatedStyle(() => ({
    opacity: composeHighlight.value,
  }));

  const onHitLayerLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width / PRIMARY_SLOT_COUNT;
    if (next > 0) {
      slotWidth.value = next;
      if (!hasSlotWidth) {
        setHasSlotWidth(true);
        // Snap to the current tab on first measure — no slide from 0.
        if (focusedPrimaryIndex >= 0) {
          highlightIndex.value = focusedPrimaryIndex;
        }
      }
    }
  };

  const closeMenus = () => {
    setMoreOpen(false);
    setCalendarOpen(false);
  };

  const onOverflowMenuSize = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== overflowMenuWidth) {
      setOverflowMenuWidth(next);
    }
  };

  const menuPillStyle = [
    styles.moreMenuPill,
    overflowMenuWidth > 0 ? { width: overflowMenuWidth } : null,
  ];

  const bar = (
    <Animated.View
      pointerEvents={hidden ? "none" : "box-none"}
      style={[styles.host, { paddingBottom: bottom }, hostAnimatedStyle]}
    >
      {menuMounted ? (
        <Animated.View
          pointerEvents={overlayOpen ? "auto" : "none"}
          style={[styles.dismissScrim, moreScrimStyle]}
        >
          <Pressable
            accessibilityLabel={
              calendarOpen ? "Dismiss calendar menu" : "Dismiss more menu"
            }
            onPress={closeMenus}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}

      <View style={styles.row} pointerEvents="box-none">
        <View style={styles.primaryWrap} pointerEvents="box-none">
          <View
            pointerEvents="none"
            style={styles.menuWidthSizer}
            onLayout={onOverflowMenuSize}
          >
            <View style={styles.moreMenuList}>
              {moreItems.map((item) => (
                <View key={item.key} style={styles.moreMenuItem}>
                  <View style={styles.moreMenuItemIcon}>
                    {item.icon(colors.muted)}
                  </View>
                  <Text style={styles.moreMenuItemLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
          {menuMounted && moreOpen ? (
            <Animated.View
              pointerEvents="box-none"
              style={[styles.moreMenuHost, moreMenuStyle]}
            >
              <BlurPill
                fixedHeight={false}
                cornerRadius={16}
                style={menuPillStyle}
              >
                <View style={styles.moreMenuList}>
                  {moreItems.map((item) => (
                    <Pressable
                      key={item.key}
                      accessibilityRole="menuitem"
                      accessibilityLabel={item.label}
                      onPress={() => {
                        closeMenus();
                        item.onPress();
                      }}
                      style={({ pressed }) => [
                        styles.moreMenuItem,
                        pressed ? styles.moreMenuItemPressed : null,
                      ]}
                    >
                      <View style={styles.moreMenuItemIcon}>
                        {item.icon(colors.muted)}
                      </View>
                      <Text style={styles.moreMenuItemLabel}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </BlurPill>
            </Animated.View>
          ) : null}

          {menuMounted && calendarOpen ? (
            <Animated.View
              pointerEvents="box-none"
              style={[styles.moreMenuHost, moreMenuStyle]}
            >
              <BlurPill
                fixedHeight={false}
                cornerRadius={16}
                style={menuPillStyle}
              >
                <View style={styles.moreMenuList}>
                  {CALENDAR_PAGE_MODE_OPTIONS.map((option) => {
                    const iconName =
                      option.value === "timetracking"
                        ? "stopwatch"
                        : option.value === "availability"
                          ? "clock"
                          : "calendar";
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="menuitem"
                        accessibilityLabel={option.label}
                        onPress={() => {
                          setCalendarPageMode(option.value);
                          closeMenus();
                          router.navigate("/calendar");
                        }}
                        style={({ pressed }) => [
                          styles.moreMenuItem,
                          pressed ? styles.moreMenuItemPressed : null,
                        ]}
                      >
                        <View style={styles.moreMenuItemIcon}>
                          <PrimerOcticon
                            name={iconName}
                            size={18}
                            color={colors.muted}
                          />
                        </View>
                        <Text style={styles.moreMenuItemLabel}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </BlurPill>
            </Animated.View>
          ) : null}

          <BlurPill style={styles.mainPill}>
            <View style={styles.hitLayer} onLayout={onHitLayerLayout}>
              {hasSlotWidth ? (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.selectionHighlight, highlightStyle]}
                />
              ) : null}
              {primaryRoutes.map(({ route, index }) => (
                <TabItem
                  key={route.key}
                  route={route}
                  focused={
                    route.name === "calendar"
                      ? calendarRouteActive || calendarOpen
                      : state.index === index
                  }
                  options={descriptors[route.key].options}
                  navigation={navigation}
                  onPressExtra={closeMenus}
                  onPressOverride={
                    route.name === "calendar"
                      ? () => {
                          setMoreOpen(false);
                          setCalendarOpen((open) => !open);
                        }
                      : undefined
                  }
                />
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More"
                accessibilityState={{
                  expanded: moreOpen,
                  selected: moreSectionActive,
                }}
                onPress={() => {
                  setCalendarOpen(false);
                  setMoreOpen((open) => !open);
                }}
                hitSlop={8}
                style={styles.item}
              >
                <MoreNavIcon
                  color={
                    moreOpen || moreSectionActive
                      ? colors.foreground
                      : colors.muted
                  }
                  size={ICON_SIZE}
                />
              </Pressable>
            </View>
          </BlurPill>
        </View>

        {composeEntry ? (
          <BlurPill style={styles.composePill}>
            <Animated.View
              pointerEvents="none"
              style={[styles.composeHighlight, composeHighlightStyle]}
            />
            <TabItem
              route={composeEntry.route}
              focused={composeFocused}
              options={descriptors[composeEntry.route.key].options}
              navigation={navigation}
              onPressExtra={closeMenus}
              compact
            />
          </BlurPill>
        ) : null}
      </View>
    </Animated.View>
  );

  if (Platform.OS === "ios") {
    return <FullWindowOverlay key={overlayEpoch}>{bar}</FullWindowOverlay>;
  }

  return bar;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SIDE_INSET,
    paddingTop: 8,
  },
  dismissScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: PILL_GAP,
    width: "100%",
    maxWidth: ROW_MAX_WIDTH,
    alignSelf: "center",
  },
  primaryWrap: {
    flex: 1,
    minWidth: 0,
    position: "relative",
    zIndex: 2,
  },
  mainPill: {
    width: "100%",
  },
  composePill: {
    width: PILL_HEIGHT,
    flexShrink: 0,
  },
  moreMenuHost: {
    position: "absolute",
    right: 0,
    bottom: PILL_HEIGHT + 10,
    zIndex: 3,
    alignItems: "flex-end",
  },
  moreMenuPill: {
    alignSelf: "flex-end",
  },
  menuWidthSizer: {
    position: "absolute",
    opacity: 0,
    left: 0,
    bottom: 0,
  },
  moreMenuList: {
    zIndex: 2,
    padding: 6,
    gap: 2,
  },
  moreMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  moreMenuItemPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  moreMenuItemIcon: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  moreMenuItemLabel: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 18,
  },
  pillShell: {
    borderRadius: PILL_HEIGHT / 2,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  pillFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 20, 22, 0.45)",
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  hitLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectionHighlight: {
    position: "absolute",
    top: HIGHLIGHT_INSET,
    bottom: HIGHLIGHT_INSET,
    left: 0,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  composeHighlight: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  item: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    zIndex: 1,
  },
  composeItem: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    elevation: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
});
