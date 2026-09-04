import {
  Gauge,
  HStack,
  Image,
  Link,
  Spacer,
  Text,
  VStack,
  ZStack,
} from "@expo/ui/swift-ui";
import {
  aspectRatio,
  clipped,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  offset,
  padding,
  resizable,
  scaleEffect,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

type HomeGlanceHeaderProps = {
  greeting: string;
  dateLabel: string;
  periodIcon: string;
  weatherIcon: string;
  temperatureLabel: string;
  backgroundImageUri: string;
  journalUrl: string;
  whoopVisible: boolean;
  whoopSleepProgress: number;
  whoopSleepLabel: string;
  whoopRecoveryProgress: number;
  whoopRecoveryLabel: string;
  whoopStrainProgress: number;
  whoopStrainLabel: string;
};

const HomeGlanceHeaderWidget = (
  props: HomeGlanceHeaderProps,
  _environment: WidgetEnvironment,
) => {
  "widget";

  // Must live inside the widget fn — expo-widgets only serializes the body.
  const fallbackBackground = "#F4F1EA";
  const ink = "#111111";
  const sleepColor = "#1C1C1E";
  const recoveryColor = "#1C1C1E";
  const strainColor = "#1C1C1E";
  const greeting = props.greeting || "Good morning";
  const dateLabel = props.dateLabel || "—";
  const periodIcon = props.periodIcon || "sunrise.fill";
  const weatherIcon = props.weatherIcon || "cloud.sun.fill";
  const temperatureLabel = props.temperatureLabel || "—";
  const backgroundImageUri = props.backgroundImageUri || "";
  const journalUrl = props.journalUrl || "backsteros-v2://journal";
  const whoopVisible = props.whoopVisible === true;
  const whoopSleepProgress =
    typeof props.whoopSleepProgress === "number" ? props.whoopSleepProgress : 0;
  const whoopRecoveryProgress =
    typeof props.whoopRecoveryProgress === "number"
      ? props.whoopRecoveryProgress
      : 0;
  const whoopStrainProgress =
    typeof props.whoopStrainProgress === "number"
      ? props.whoopStrainProgress
      : 0;

  return (
    <Link destination={journalUrl}>
      <ZStack
        alignment="topLeading"
        modifiers={[
          containerBackground(fallbackBackground, "widget"),
          frame({ maxWidth: 9999, maxHeight: 9999 }),
        ]}
      >
        <Image
          uiImage={backgroundImageUri}
          modifiers={[
            resizable(),
            aspectRatio({ contentMode: "fill" }),
            frame({ maxWidth: 9999, maxHeight: 9999 }),
            clipped(),
          ]}
        />
        <VStack
          spacing={6}
          alignment="leading"
          modifiers={[
            padding({ all: 16 }),
            frame({
              maxWidth: 9999,
              maxHeight: 9999,
              alignment: "bottomLeading",
            }),
          ]}
        >
          <Spacer />
          <HStack
            spacing={8}
            alignment="bottom"
            modifiers={[frame({ maxWidth: 9999 })]}
          >
            <VStack spacing={6} alignment="leading">
              <Image
                systemName={periodIcon as "sunrise.fill"}
                size={36}
                color={ink}
              />
              <Text
                modifiers={[
                  font({ size: 26, weight: "bold" }),
                  foregroundStyle(ink),
                ]}
              >
                {greeting}
              </Text>
              <Text
                modifiers={[
                  font({ size: 14, weight: "regular" }),
                  foregroundStyle(ink),
                ]}
              >
                {dateLabel}
              </Text>
            </VStack>
            <Spacer />
            <VStack spacing={16} alignment="trailing">
              <HStack spacing={4} alignment="center">
                <Image
                  systemName={weatherIcon as "cloud.sun.fill"}
                  size={14}
                  color={ink}
                />
                <Text
                  modifiers={[
                    font({ size: 14, weight: "regular" }),
                    foregroundStyle(ink),
                  ]}
                >
                  {temperatureLabel}
                </Text>
              </HStack>
              {whoopVisible ? (
                <HStack
                  spacing={16}
                  alignment="center"
                  modifiers={[offset({ x: -8 })]}
                >
                  <ZStack
                    alignment="center"
                    modifiers={[
                      scaleEffect(0.5),
                      frame({ width: 20, height: 20 }),
                    ]}
                  >
                    <Gauge
                      value={whoopSleepProgress}
                      min={0}
                      max={1}
                      modifiers={[
                        gaugeStyle("circularCapacity"),
                        tint(sleepColor),
                        frame({ width: 40, height: 40 }),
                      ]}
                    />
                    <Image
                      systemName={"moon.fill" as "moon.fill"}
                      size={18}
                      color={sleepColor}
                    />
                  </ZStack>
                  <ZStack
                    alignment="center"
                    modifiers={[
                      scaleEffect(0.5),
                      frame({ width: 20, height: 20 }),
                    ]}
                  >
                    <Gauge
                      value={whoopRecoveryProgress}
                      min={0}
                      max={1}
                      modifiers={[
                        gaugeStyle("circularCapacity"),
                        tint(recoveryColor),
                        frame({ width: 40, height: 40 }),
                      ]}
                    />
                    <Image
                      systemName={"heart.fill" as "heart.fill"}
                      size={18}
                      color={recoveryColor}
                    />
                  </ZStack>
                  <ZStack
                    alignment="center"
                    modifiers={[
                      scaleEffect(0.5),
                      frame({ width: 20, height: 20 }),
                    ]}
                  >
                    <Gauge
                      value={whoopStrainProgress}
                      min={0}
                      max={1}
                      modifiers={[
                        gaugeStyle("circularCapacity"),
                        tint(strainColor),
                        frame({ width: 40, height: 40 }),
                      ]}
                    />
                    <Image
                      systemName={"flame.fill" as "flame.fill"}
                      size={18}
                      color={strainColor}
                    />
                  </ZStack>
                </HStack>
              ) : null}
            </VStack>
          </HStack>
        </VStack>
      </ZStack>
    </Link>
  );
};

export default createWidget("HomeGlanceHeaderWidget", HomeGlanceHeaderWidget);
