import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";

import {
  HABIT_TIMELINE_MINIMAP_MIN_ITEMS,
  resolveHabitTimelineMinimapIndexFromPointer,
  resolveHabitTimelineMinimapTopPercent,
  type HabitTimelineMinimapItem,
} from "../../lib/habits/habit-timeline-minimap";
import { colors } from "../../lib/theme";

type Props = {
  items: readonly HabitTimelineMinimapItem[];
  inViewIds: ReadonlySet<string>;
  onSelect: (item: HabitTimelineMinimapItem) => void;
};

/** Left-rail section ticks (desktop habit timeline minimap parity). */
export function HabitTimelineMinimap({ items, inViewIds, onSelect }: Props) {
  const [railHeight, setRailHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const resolvedActive =
    activeIndex !== null && activeIndex < items.length ? activeIndex : null;
  const activeItem =
    resolvedActive === null ? null : (items[resolvedActive] ?? null);

  const hitHeight = useMemo(() => {
    const natural = Math.max(64, (items.length - 1) * 8);
    if (railHeight <= 0) return natural;
    return Math.min(natural, Math.max(64, railHeight - 48));
  }, [items.length, railHeight]);

  if (items.length < HABIT_TIMELINE_MINIMAP_MIN_ITEMS) return null;

  function indexFromEvent(event: GestureResponderEvent): number | null {
    return resolveHabitTimelineMinimapIndexFromPointer({
      itemCount: items.length,
      railTop: 0,
      railHeight: Math.max(1, hitHeight),
      pointerY: event.nativeEvent.locationY,
    });
  }

  return (
    <View
      style={styles.root}
      pointerEvents="box-none"
      onLayout={(event) => {
        setRailHeight(event.nativeEvent.layout.height);
      }}
    >
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Habit timeline"
        style={[styles.hit, { height: hitHeight }]}
        onPress={(event) => {
          const index = indexFromEvent(event);
          const item = index == null ? null : items[index];
          if (item) onSelect(item);
          setActiveIndex(null);
        }}
        onPressIn={(event) => {
          setActiveIndex(indexFromEvent(event));
        }}
        onPressOut={() => setActiveIndex(null)}
      >
        <View style={styles.rail} />
        {items.map((item, index) => {
          const top = resolveHabitTimelineMinimapTopPercent(
            index,
            items.length,
          );
          const distance =
            resolvedActive === null ? null : Math.abs(index - resolvedActive);
          const width =
            distance === 0 ? 18 : distance === 1 ? 12 : distance === 2 ? 8 : 6;
          const inView = inViewIds.has(item.id);
          return (
            <View
              key={item.id}
              style={[
                styles.tick,
                {
                  top: `${top}%`,
                  width,
                  backgroundColor: inView
                    ? "rgba(247,249,255,0.9)"
                    : distance === 0
                      ? "rgba(163,163,163,0.75)"
                      : "rgba(163,163,163,0.35)",
                },
              ]}
            />
          );
        })}
        {activeItem ? (
          <View
            style={[
              styles.preview,
              {
                top: `${resolveHabitTimelineMinimapTopPercent(resolvedActive ?? 0, items.length)}%`,
              },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.previewText} numberOfLines={1}>
              {activeItem.label}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 5,
    width: 56,
    justifyContent: "center",
  },
  hit: {
    marginLeft: 10,
    width: 44,
    justifyContent: "center",
  },
  rail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tick: {
    position: "absolute",
    left: 0,
    height: 2,
    borderRadius: 999,
    marginTop: -1,
  },
  preview: {
    position: "absolute",
    left: 22,
    marginTop: -12,
    maxWidth: 160,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  previewText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "500",
  },
});
