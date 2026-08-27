import { useId, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export const CONTENT_HEADER_FADE_HEIGHT = 40;

const STOPS = [
  { offset: "0%", opacity: 1 },
  { offset: "45%", opacity: 0.7 },
  { offset: "100%", opacity: 0 },
] as const;

type Props = {
  color: string;
};

/**
 * Softens scrolling content as it passes under a sticky / native header.
 * Sit this 1px into the header (`top: headerHeight - 1`) so no seam shows.
 */
export function ContentHeaderFade({ color }: Props) {
  const reactId = useId().replace(/:/g, "");
  const gradientId = `content-header-fade-${reactId}`;
  const [width, setWidth] = useState(0);

  return (
    <View
      pointerEvents="none"
      style={styles.fill}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      {width > 0 ? (
        <Svg width={width} height={CONTENT_HEADER_FADE_HEIGHT}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {STOPS.map((stop) => (
                <Stop
                  key={stop.offset}
                  offset={stop.offset}
                  stopColor={color}
                  stopOpacity={stop.opacity}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={width}
            height={CONTENT_HEADER_FADE_HEIGHT}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
