import { Button, Chart, HStack, Image, Link, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  Animation,
  animation,
  aspectRatio,
  background,
  buttonStyle,
  clipped,
  containerBackground,
  contentShape,
  contentTransition,
  font,
  foregroundStyle,
  frame,
  padding,
  resizable,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

type HomeGlanceTab = "inbox" | "tasks" | "email" | "finance";

type HomeGlanceSectionsProps = {
  selectedTab: HomeGlanceTab;
  backgroundImageUri: string;
  inboxCountLabel: string;
  /** Empty = hide; else hex for the Inbox tab attention dot. */
  inboxIndicatorColor: string;
  inboxListUrl: string;
  inboxUrl0: string;
  inboxTitle0: string;
  inboxMeta0: string;
  inboxIcon0: string;
  inboxIconColor0: string;
  inboxPriorityIcon0: string;
  inboxPriorityIconColor0: string;
  inboxUrl1: string;
  inboxTitle1: string;
  inboxMeta1: string;
  inboxIcon1: string;
  inboxIconColor1: string;
  inboxPriorityIcon1: string;
  inboxPriorityIconColor1: string;
  inboxUrl2: string;
  inboxTitle2: string;
  inboxMeta2: string;
  inboxIcon2: string;
  inboxIconColor2: string;
  inboxPriorityIcon2: string;
  inboxPriorityIconColor2: string;
  inboxUrl3: string;
  inboxTitle3: string;
  inboxMeta3: string;
  inboxIcon3: string;
  inboxIconColor3: string;
  inboxPriorityIcon3: string;
  inboxPriorityIconColor3: string;
  inboxUrl4: string;
  inboxTitle4: string;
  inboxMeta4: string;
  inboxIcon4: string;
  inboxIconColor4: string;
  inboxPriorityIcon4: string;
  inboxPriorityIconColor4: string;
  todayCountLabel: string;
  todayListUrl: string;
  todayUrl0: string;
  todayTitle0: string;
  todayMeta0: string;
  todayIcon0: string;
  todayIconColor0: string;
  todayPriorityIcon0: string;
  todayPriorityIconColor0: string;
  todayUrl1: string;
  todayTitle1: string;
  todayMeta1: string;
  todayIcon1: string;
  todayIconColor1: string;
  todayPriorityIcon1: string;
  todayPriorityIconColor1: string;
  todayUrl2: string;
  todayTitle2: string;
  todayMeta2: string;
  todayIcon2: string;
  todayIconColor2: string;
  todayPriorityIcon2: string;
  todayPriorityIconColor2: string;
  todayUrl3: string;
  todayTitle3: string;
  todayMeta3: string;
  todayIcon3: string;
  todayIconColor3: string;
  todayPriorityIcon3: string;
  todayPriorityIconColor3: string;
  todayUrl4: string;
  todayTitle4: string;
  todayMeta4: string;
  todayIcon4: string;
  todayIconColor4: string;
  todayPriorityIcon4: string;
  todayPriorityIconColor4: string;
  financeMonthKey: string;
  financeMonthLabel: string;
  financeCanGoPrev: string;
  financeCanGoNext: string;
  financeIncomeTotalLabel: string;
  financeBalanceTotalLabel: string;
  financeBalanceColor: string;
  financeExpenseTotalLabel: string;
  financeIncomeSeries: string;
  financeExpenseSeries: string;
  financeDayCount: number;
  financeViewMoreUrl: string;
  financeIndex: number;
  financeMonthCount: number;
  financeMonthsPack: string;
};

const HomeGlanceSectionsWidget = (
  props: HomeGlanceSectionsProps,
  _environment: WidgetEnvironment,
) => {
  "widget";

  // Native AudioPlaybackIntent tab bar overlays this layout; spacer clears it.
  // Keep locals flat — nested helpers are unreliable in the widget runtime.
  const fallbackBackground = "#0D1A12";
  const selectedTab: HomeGlanceTab = props.selectedTab || "inbox";
  const backgroundImageUri = props.backgroundImageUri || "";
  const inboxCountLabel = props.inboxCountLabel || "";
  const inboxIndicatorColor = props.inboxIndicatorColor || "";
  const inboxListUrl = props.inboxListUrl || "backsteros-v2://inbox";
  const inboxUrl0 = props.inboxUrl0 || "";
  const inboxTitle0 = props.inboxTitle0 || "";
  const inboxMeta0 = props.inboxMeta0 || "";
  const inboxIcon0 = props.inboxIcon0 || "circle";
  const inboxIconColor0 = props.inboxIconColor0 || "#4A4A4E";
  const inboxPriorityIcon0 = props.inboxPriorityIcon0 || "";
  const inboxPriorityIconColor0 = props.inboxPriorityIconColor0 || "#1C1C1E66";
  const inboxUrl1 = props.inboxUrl1 || "";
  const inboxTitle1 = props.inboxTitle1 || "";
  const inboxMeta1 = props.inboxMeta1 || "";
  const inboxIcon1 = props.inboxIcon1 || "circle";
  const inboxIconColor1 = props.inboxIconColor1 || "#4A4A4E";
  const inboxPriorityIcon1 = props.inboxPriorityIcon1 || "";
  const inboxPriorityIconColor1 = props.inboxPriorityIconColor1 || "#1C1C1E66";
  const inboxUrl2 = props.inboxUrl2 || "";
  const inboxTitle2 = props.inboxTitle2 || "";
  const inboxMeta2 = props.inboxMeta2 || "";
  const inboxIcon2 = props.inboxIcon2 || "circle";
  const inboxIconColor2 = props.inboxIconColor2 || "#4A4A4E";
  const inboxPriorityIcon2 = props.inboxPriorityIcon2 || "";
  const inboxPriorityIconColor2 = props.inboxPriorityIconColor2 || "#1C1C1E66";
  const inboxUrl3 = props.inboxUrl3 || "";
  const inboxTitle3 = props.inboxTitle3 || "";
  const inboxMeta3 = props.inboxMeta3 || "";
  const inboxIcon3 = props.inboxIcon3 || "circle";
  const inboxIconColor3 = props.inboxIconColor3 || "#4A4A4E";
  const inboxPriorityIcon3 = props.inboxPriorityIcon3 || "";
  const inboxPriorityIconColor3 = props.inboxPriorityIconColor3 || "#1C1C1E66";
  const inboxUrl4 = props.inboxUrl4 || "";
  const inboxTitle4 = props.inboxTitle4 || "";
  const inboxMeta4 = props.inboxMeta4 || "";
  const inboxIcon4 = props.inboxIcon4 || "circle";
  const inboxIconColor4 = props.inboxIconColor4 || "#4A4A4E";
  const inboxPriorityIcon4 = props.inboxPriorityIcon4 || "";
  const inboxPriorityIconColor4 = props.inboxPriorityIconColor4 || "#1C1C1E66";
  const todayCountLabel = props.todayCountLabel || "";
  const todayListUrl = props.todayListUrl || "backsteros-v2://tasks";
  const todayUrl0 = props.todayUrl0 || "";
  const todayTitle0 = props.todayTitle0 || "";
  const todayMeta0 = props.todayMeta0 || "";
  const todayIcon0 = props.todayIcon0 || "circle";
  const todayIconColor0 = props.todayIconColor0 || "#4A4A4E";
  const todayPriorityIcon0 = props.todayPriorityIcon0 || "";
  const todayPriorityIconColor0 = props.todayPriorityIconColor0 || "#1C1C1E66";
  const todayUrl1 = props.todayUrl1 || "";
  const todayTitle1 = props.todayTitle1 || "";
  const todayMeta1 = props.todayMeta1 || "";
  const todayIcon1 = props.todayIcon1 || "circle";
  const todayIconColor1 = props.todayIconColor1 || "#4A4A4E";
  const todayPriorityIcon1 = props.todayPriorityIcon1 || "";
  const todayPriorityIconColor1 = props.todayPriorityIconColor1 || "#1C1C1E66";
  const todayUrl2 = props.todayUrl2 || "";
  const todayTitle2 = props.todayTitle2 || "";
  const todayMeta2 = props.todayMeta2 || "";
  const todayIcon2 = props.todayIcon2 || "circle";
  const todayIconColor2 = props.todayIconColor2 || "#4A4A4E";
  const todayPriorityIcon2 = props.todayPriorityIcon2 || "";
  const todayPriorityIconColor2 = props.todayPriorityIconColor2 || "#1C1C1E66";
  const todayUrl3 = props.todayUrl3 || "";
  const todayTitle3 = props.todayTitle3 || "";
  const todayMeta3 = props.todayMeta3 || "";
  const todayIcon3 = props.todayIcon3 || "circle";
  const todayIconColor3 = props.todayIconColor3 || "#4A4A4E";
  const todayPriorityIcon3 = props.todayPriorityIcon3 || "";
  const todayPriorityIconColor3 = props.todayPriorityIconColor3 || "#1C1C1E66";
  const todayUrl4 = props.todayUrl4 || "";
  const todayTitle4 = props.todayTitle4 || "";
  const todayMeta4 = props.todayMeta4 || "";
  const todayIcon4 = props.todayIcon4 || "circle";
  const todayIconColor4 = props.todayIconColor4 || "#4A4A4E";
  const todayPriorityIcon4 = props.todayPriorityIcon4 || "";
  const todayPriorityIconColor4 = props.todayPriorityIconColor4 || "#1C1C1E66";
  const financeMonthKey = props.financeMonthKey || "";
  const financeMonthLabel = props.financeMonthLabel || "";
  const financeCanGoPrev = props.financeCanGoPrev || "0";
  const financeCanGoNext = props.financeCanGoNext || "0";
  const financeIncomeTotalLabel = props.financeIncomeTotalLabel || "€0,00";
  const financeBalanceTotalLabel = props.financeBalanceTotalLabel || "€0,00";
  const financeBalanceColor = props.financeBalanceColor || "#FFFFFF";
  const financeExpenseTotalLabel = props.financeExpenseTotalLabel || "€0,00";
  const financeIncomeSeries = props.financeIncomeSeries || "";
  const financeExpenseSeries = props.financeExpenseSeries || "";
  const financeDayCount = Number(props.financeDayCount) || 0;
  const financeViewMoreUrl = props.financeViewMoreUrl || "backsteros-v2://finance";
  const financeIndex = Number(props.financeIndex) || 0;
  const financeMonthCount = Number(props.financeMonthCount) || 0;
  const financeMonthsPack = props.financeMonthsPack || "";

  // Numeric key so tab content can fade instead of the default blur morph.
  const tabAnimKey =
    selectedTab === "inbox"
      ? 0
      : selectedTab === "tasks"
        ? 1
        : selectedTab === "email"
          ? 2
          : 3;

  const showingToday = selectedTab === "tasks";
  const showingInbox = selectedTab === "inbox";
  const listCountLabel = showingToday ? todayCountLabel : inboxCountLabel;
  const listListUrl = showingToday ? todayListUrl : inboxListUrl;
  const listUrl0 = showingToday ? todayUrl0 : inboxUrl0;
  const listTitle0 = showingToday ? todayTitle0 : inboxTitle0;
  const listMeta0 = showingToday ? todayMeta0 : inboxMeta0;
  const listIcon0 = showingToday ? todayIcon0 : inboxIcon0;
  const listIconColor0 = showingToday ? todayIconColor0 : inboxIconColor0;
  const listPriorityIcon0 = showingToday ? todayPriorityIcon0 : inboxPriorityIcon0;
  const listPriorityIconColor0 = showingToday
    ? todayPriorityIconColor0
    : inboxPriorityIconColor0;
  const listUrl1 = showingToday ? todayUrl1 : inboxUrl1;
  const listTitle1 = showingToday ? todayTitle1 : inboxTitle1;
  const listMeta1 = showingToday ? todayMeta1 : inboxMeta1;
  const listIcon1 = showingToday ? todayIcon1 : inboxIcon1;
  const listIconColor1 = showingToday ? todayIconColor1 : inboxIconColor1;
  const listPriorityIcon1 = showingToday ? todayPriorityIcon1 : inboxPriorityIcon1;
  const listPriorityIconColor1 = showingToday
    ? todayPriorityIconColor1
    : inboxPriorityIconColor1;
  const listUrl2 = showingToday ? todayUrl2 : inboxUrl2;
  const listTitle2 = showingToday ? todayTitle2 : inboxTitle2;
  const listMeta2 = showingToday ? todayMeta2 : inboxMeta2;
  const listIcon2 = showingToday ? todayIcon2 : inboxIcon2;
  const listIconColor2 = showingToday ? todayIconColor2 : inboxIconColor2;
  const listPriorityIcon2 = showingToday ? todayPriorityIcon2 : inboxPriorityIcon2;
  const listPriorityIconColor2 = showingToday
    ? todayPriorityIconColor2
    : inboxPriorityIconColor2;
  const listUrl3 = showingToday ? todayUrl3 : inboxUrl3;
  const listTitle3 = showingToday ? todayTitle3 : inboxTitle3;
  const listMeta3 = showingToday ? todayMeta3 : inboxMeta3;
  const listIcon3 = showingToday ? todayIcon3 : inboxIcon3;
  const listIconColor3 = showingToday ? todayIconColor3 : inboxIconColor3;
  const listPriorityIcon3 = showingToday ? todayPriorityIcon3 : inboxPriorityIcon3;
  const listPriorityIconColor3 = showingToday
    ? todayPriorityIconColor3
    : inboxPriorityIconColor3;
  const listUrl4 = showingToday ? todayUrl4 : inboxUrl4;
  const listTitle4 = showingToday ? todayTitle4 : inboxTitle4;
  const listMeta4 = showingToday ? todayMeta4 : inboxMeta4;
  const listIcon4 = showingToday ? todayIcon4 : inboxIcon4;
  const listIconColor4 = showingToday ? todayIconColor4 : inboxIconColor4;
  const listPriorityIcon4 = showingToday ? todayPriorityIcon4 : inboxPriorityIcon4;
  const listPriorityIconColor4 = showingToday
    ? todayPriorityIconColor4
    : inboxPriorityIconColor4;

  const showTaskList =
    (showingInbox || showingToday) && listTitle0 !== "";

  let emptyIcon = "tray";
  let emptyLabel = "Inbox is empty";
  if (selectedTab === "tasks") {
    emptyIcon = "checklist";
    emptyLabel = "No tasks due today";
  } else if (selectedTab === "email") {
    emptyIcon = "envelope";
    emptyLabel = "E-mail space";
  } else if (selectedTab === "finance") {
    emptyIcon = "chart.line.uptrend.xyaxis";
    emptyLabel = "No finance data";
  }

  const showingFinance = selectedTab === "finance";
  const incomeParts = financeIncomeSeries.split(",");
  const expenseParts = financeExpenseSeries.split(",");
  const incomeChartData = [];
  const expenseChartData = [];
  let financeChartMax = 1;
  for (let dayIndex = 0; dayIndex < financeDayCount; dayIndex++) {
    const incomeValue = Number(incomeParts[dayIndex]) || 0;
    const expenseValue = Number(expenseParts[dayIndex]) || 0;
    if (incomeValue > financeChartMax) financeChartMax = incomeValue;
    if (expenseValue > financeChartMax) financeChartMax = expenseValue;
  }
  for (let dayIndex = 0; dayIndex < financeDayCount; dayIndex++) {
    const xLabel = String(dayIndex + 1);
    const incomeValue = Number(incomeParts[dayIndex]) || 0;
    const expenseValue = Number(expenseParts[dayIndex]) || 0;
    incomeChartData.push({
      x: xLabel,
      y: (incomeValue / financeChartMax) * 100,
    });
    expenseChartData.push({
      x: xLabel,
      y: (expenseValue / financeChartMax) * 100,
    });
  }


  return (
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
        spacing={10}
        alignment="leading"
        modifiers={[
          padding({ top: 0, leading: 0, trailing: 0, bottom: 0 }),
          frame({ maxWidth: 9999, maxHeight: 9999, alignment: "topLeading" }),
          contentShape(shapes.rectangle()),
        ]}
      >
        <HStack
          spacing={2}
          alignment="center"
          modifiers={[
            // Clear the native overlay tab bar (top inset + capsule + gap).
            padding({ leading: 12, trailing: 12, top: 0, bottom: 8 }),
            frame({ maxWidth: 9999, minHeight: 52 }),
          ]}
        >
          <Spacer />
        </HStack>

        <VStack
          spacing={0}
          alignment="leading"
          modifiers={[
            frame({ maxWidth: 9999, maxHeight: 9999, alignment: "topLeading" }),
            contentTransition("opacity"),
            animation(Animation.easeInOut({ duration: 0.22 }), tabAnimKey),
          ]}
        >
        {showTaskList ? (
          <VStack
            spacing={2}
            alignment="leading"
            modifiers={[
              frame({ maxWidth: 9999, maxHeight: 9999, alignment: "topLeading" }),
              contentTransition("opacity"),
            ]}
          >
            {listTitle0 !== "" ? (
              <Link destination={listUrl0}>
              <HStack
                spacing={8}
                alignment="center"
                modifiers={[
                  frame({ maxWidth: 9999, alignment: "leading" }),
                  padding({ leading: 12, trailing: 12, top: 8, bottom: 8 }),
                  background(
                    "#FFFFFF40",
                    shapes.roundedRectangle({ cornerRadius: 12 }),
                  ),
                ]}
              >
                <Image
                  systemName={listIcon0 as "circle"}
                  size={14}
                  color={listIconColor0 || "#4A4A4E"}
                />
                <VStack
                  spacing={1}
                  alignment="leading"
                  modifiers={[frame({ maxWidth: 9999, alignment: "leading" })]}
                >
                  <Text
                    modifiers={[
                      font({ size: 14, weight: "semibold" }),
                      foregroundStyle("#1C1C1E"),
                    ]}
                  >
                    {listTitle0}
                  </Text>
                  <HStack
                    spacing={4}
                    alignment="center"
                    modifiers={[frame({ maxWidth: 9999, alignment: "leading" })]}
                  >
                    {listPriorityIcon0 !== "" ? (
                      <Image
                        systemName={listPriorityIcon0 as "chart.bar.fill"}
                        size={11}
                        color={listPriorityIconColor0 || "#1C1C1E66"}
                      />
                    ) : null}
                    {listMeta0 !== "" ? (
                      <Text
                        modifiers={[
                          font({ size: 11, weight: "regular" }),
                          foregroundStyle("#3A3A3C"),
                        ]}
                      >
                        {listMeta0}
                      </Text>
                    ) : null}
                  </HStack>
                </VStack>
              </HStack>
            
              </Link>
            ) : null}
            {listTitle1 !== "" ? (
              <Link destination={listUrl1}>
              <HStack
                spacing={8}
                alignment="center"
                modifiers={[
                  frame({ maxWidth: 9999, alignment: "leading" }),
                  padding({ leading: 12, trailing: 12, top: 8, bottom: 8 }),
                  background(
                    "#FFFFFF40",
                    shapes.roundedRectangle({ cornerRadius: 12 }),
                  ),
                ]}
              >
                <Image
                  systemName={listIcon1 as "circle"}
                  size={14}
                  color={listIconColor1 || "#4A4A4E"}
                />
                <VStack
                  spacing={1}
                  alignment="leading"
                  modifiers={[frame({ maxWidth: 9999, alignment: "leading" })]}
                >
                  <Text
                    modifiers={[
                      font({ size: 14, weight: "semibold" }),
                      foregroundStyle("#1C1C1E"),
                    ]}
                  >
                    {listTitle1}
                  </Text>
                  <HStack
                    spacing={4}
                    alignment="center"
                    modifiers={[frame({ maxWidth: 9999, alignment: "leading" })]}
                  >
                    {listPriorityIcon1 !== "" ? (
                      <Image
                        systemName={listPriorityIcon1 as "chart.bar.fill"}
                        size={11}
                        color={listPriorityIconColor1 || "#1C1C1E66"}
                      />
                    ) : null}
                    {listMeta1 !== "" ? (
                      <Text
                        modifiers={[
                          font({ size: 11, weight: "regular" }),
                          foregroundStyle("#3A3A3C"),
                        ]}
                      >
                        {listMeta1}
                      </Text>
                    ) : null}
                  </HStack>
                </VStack>
              </HStack>
            
              </Link>
            ) : null}
            {listTitle2 !== "" ? (
              <Link destination={listUrl2}>
              <HStack
                spacing={8}
                alignment="center"
                modifiers={[
                  frame({ maxWidth: 9999, alignment: "leading" }),
                  padding({ leading: 12, trailing: 12, top: 8, bottom: 8 }),
                  background(
                    "#FFFFFF40",
                    shapes.roundedRectangle({ cornerRadius: 12 }),
                  ),
                ]}
              >
                <Image
                  systemName={listIcon2 as "circle"}
                  size={14}
                  color={listIconColor2 || "#4A4A4E"}
                />
                <VStack
                  spacing={1}
                  alignment="leading"
                  modifiers={[frame({ maxWidth: 9999, alignment: "leading" })]}
                >
                  <Text
                    modifiers={[
                      font({ size: 14, weight: "semibold" }),
                      foregroundStyle("#1C1C1E"),
                    ]}
                  >
                    {listTitle2}
                  </Text>
                  <HStack
                    spacing={4}
                    alignment="center"
                    modifiers={[frame({ maxWidth: 9999, alignment: "leading" })]}
                  >
                    {listPriorityIcon2 !== "" ? (
                      <Image
                        systemName={listPriorityIcon2 as "chart.bar.fill"}
                        size={11}
                        color={listPriorityIconColor2 || "#1C1C1E66"}
                      />
                    ) : null}
                    {listMeta2 !== "" ? (
                      <Text
                        modifiers={[
                          font({ size: 11, weight: "regular" }),
                          foregroundStyle("#3A3A3C"),
                        ]}
                      >
                        {listMeta2}
                      </Text>
                    ) : null}
                  </HStack>
                </VStack>
              </HStack>
            
              </Link>
            ) : null}
            {listTitle3 !== "" ? (
              <Link destination={listUrl3}>
              <HStack
                spacing={8}
                alignment="center"
                modifiers={[
                  frame({ maxWidth: 9999, alignment: "leading" }),
                  padding({ leading: 12, trailing: 12, top: 8, bottom: 8 }),
                  background(
                    "#FFFFFF40",
                    shapes.roundedRectangle({ cornerRadius: 12 }),
                  ),
                ]}
              >
                <Image
                  systemName={listIcon3 as "circle"}
                  size={14}
                  color={listIconColor3 || "#4A4A4E"}
                />
                <VStack
                  spacing={1}
                  alignment="leading"
                  modifiers={[frame({ maxWidth: 9999, alignment: "leading" })]}
                >
                  <Text
                    modifiers={[
                      font({ size: 14, weight: "semibold" }),
                      foregroundStyle("#1C1C1E"),
                    ]}
                  >
                    {listTitle3}
                  </Text>
                  <HStack
                    spacing={4}
                    alignment="center"
                    modifiers={[frame({ maxWidth: 9999, alignment: "leading" })]}
                  >
                    {listPriorityIcon3 !== "" ? (
                      <Image
                        systemName={listPriorityIcon3 as "chart.bar.fill"}
                        size={11}
                        color={listPriorityIconColor3 || "#1C1C1E66"}
                      />
                    ) : null}
                    {listMeta3 !== "" ? (
                      <Text
                        modifiers={[
                          font({ size: 11, weight: "regular" }),
                          foregroundStyle("#3A3A3C"),
                        ]}
                      >
                        {listMeta3}
                      </Text>
                    ) : null}
                  </HStack>
                </VStack>
              </HStack>
            
              </Link>
            ) : null}
            {listTitle4 !== "" ? (
              <Link destination={listUrl4}>
              <HStack
                spacing={8}
                alignment="center"
                modifiers={[
                  frame({ maxWidth: 9999, alignment: "leading" }),
                  padding({ leading: 12, trailing: 12, top: 8, bottom: 8 }),
                  background(
                    "#FFFFFF40",
                    shapes.roundedRectangle({ cornerRadius: 12 }),
                  ),
                ]}
              >
                <Image
                  systemName={listIcon4 as "circle"}
                  size={14}
                  color={listIconColor4 || "#4A4A4E"}
                />
                <VStack
                  spacing={1}
                  alignment="leading"
                  modifiers={[frame({ maxWidth: 9999, alignment: "leading" })]}
                >
                  <Text
                    modifiers={[
                      font({ size: 14, weight: "semibold" }),
                      foregroundStyle("#1C1C1E"),
                    ]}
                  >
                    {listTitle4}
                  </Text>
                  <HStack
                    spacing={4}
                    alignment="center"
                    modifiers={[frame({ maxWidth: 9999, alignment: "leading" })]}
                  >
                    {listPriorityIcon4 !== "" ? (
                      <Image
                        systemName={listPriorityIcon4 as "chart.bar.fill"}
                        size={11}
                        color={listPriorityIconColor4 || "#1C1C1E66"}
                      />
                    ) : null}
                    {listMeta4 !== "" ? (
                      <Text
                        modifiers={[
                          font({ size: 11, weight: "regular" }),
                          foregroundStyle("#3A3A3C"),
                        ]}
                      >
                        {listMeta4}
                      </Text>
                    ) : null}
                  </HStack>
                </VStack>
              </HStack>
            
              </Link>
            ) : null}
            <Spacer />
            <Link destination={listListUrl}>
              <HStack
                spacing={8}
                alignment="center"
                modifiers={[
                  padding({ leading: 12, trailing: 12, top: 4, bottom: 10 }),
                  frame({ maxWidth: 9999 }),
                ]}
              >
                <Text
                  modifiers={[
                    font({ size: 12, weight: "medium" }),
                    foregroundStyle("#FFFFFF"),
                  ]}
                >
                  View more
                </Text>
                <Spacer />
                {listCountLabel !== "" ? (
                  <Text
                    modifiers={[
                      font({ size: 12, weight: "medium" }),
                      foregroundStyle("#FFFFFF"),
                    ]}
                  >
                    {listCountLabel}
                  </Text>
                ) : null}
              </HStack>
            </Link>
          </VStack>

        ) : showingFinance ? (
          <VStack
            spacing={8}
            alignment="leading"
            modifiers={[
              padding({ leading: 12, trailing: 12, top: 4, bottom: 8 }),
              frame({ maxWidth: 9999, maxHeight: 9999, alignment: "topLeading" }),
              contentTransition("opacity"),
            ]}
          >
            {financeDayCount > 0 ? (
              <ZStack
                alignment="center"
                modifiers={[
                  frame({ maxWidth: 9999, height: 88 }),
                  background(
                    "#FFFFFF22",
                    shapes.roundedRectangle({ cornerRadius: 12 }),
                  ),
                ]}
              >
                <Chart
                  data={expenseChartData}
                  type="area"
                  showGrid={false}
                  animate={false}
                  areaStyle={{
                    color: "#00000028",
                  }}
                  modifiers={[frame({ maxWidth: 9999, height: 80 })]}
                />
                <Chart
                  data={incomeChartData}
                  type="area"
                  showGrid={false}
                  animate={false}
                  areaStyle={{
                    color: "#00000018",
                  }}
                  modifiers={[frame({ maxWidth: 9999, height: 80 })]}
                />
                <Chart
                  data={expenseChartData}
                  type="line"
                  showGrid={false}
                  animate={false}
                  lineStyle={{
                    color: "#111111",
                    width: 2.5,
                    pointSize: 0,
                  }}
                  modifiers={[frame({ maxWidth: 9999, height: 80 })]}
                />
                <Chart
                  data={incomeChartData}
                  type="line"
                  showGrid={false}
                  animate={false}
                  lineStyle={{
                    color: "#111111",
                    width: 2,
                    dashArray: [5, 4],
                    pointSize: 0,
                  }}
                  modifiers={[frame({ maxWidth: 9999, height: 80 })]}
                />
              </ZStack>
            ) : (
              <HStack
                modifiers={[
                  frame({ maxWidth: 9999, height: 88 }),
                  background(
                    "#FFFFFF22",
                    shapes.roundedRectangle({ cornerRadius: 12 }),
                  ),
                  padding({ all: 12 }),
                ]}
              >
                <Text
                  modifiers={[
                    font({ size: 13, weight: "regular" }),
                    foregroundStyle("#FFFFFFCC"),
                  ]}
                >
                  No income or expense this month yet.
                </Text>
              </HStack>
            )}
            <HStack
              spacing={12}
              alignment="center"
              modifiers={[frame({ maxWidth: 9999 })]}
            >
              <VStack spacing={2} alignment="leading" modifiers={[frame({ maxWidth: 9999 })]}>
                <Text
                  modifiers={[
                    font({ size: 11, weight: "regular" }),
                    foregroundStyle("#FFFFFFAA"),
                  ]}
                >
                  Income
                </Text>
                <Text
                  modifiers={[
                    font({ size: 15, weight: "semibold" }),
                    foregroundStyle("#22c55e"),
                  ]}
                >
                  {financeIncomeTotalLabel}
                </Text>
              </VStack>
              <VStack spacing={2} alignment="leading" modifiers={[frame({ maxWidth: 9999 })]}>
                <Text
                  modifiers={[
                    font({ size: 11, weight: "regular" }),
                    foregroundStyle("#FFFFFFAA"),
                  ]}
                >
                  Balance
                </Text>
                <Text
                  modifiers={[
                    font({ size: 15, weight: "semibold" }),
                    foregroundStyle(financeBalanceColor || "#FFFFFF"),
                  ]}
                >
                  {financeBalanceTotalLabel}
                </Text>
              </VStack>
              <VStack spacing={2} alignment="leading" modifiers={[frame({ maxWidth: 9999 })]}>
                <Text
                  modifiers={[
                    font({ size: 11, weight: "regular" }),
                    foregroundStyle("#FFFFFFAA"),
                  ]}
                >
                  Expenses
                </Text>
                <Text
                  modifiers={[
                    font({ size: 15, weight: "semibold" }),
                    foregroundStyle("#ef4444"),
                  ]}
                >
                  {financeExpenseTotalLabel}
                </Text>
              </VStack>
            </HStack>
            <Spacer />
            <HStack
              spacing={4}
              alignment="center"
              modifiers={[frame({ maxWidth: 9999, alignment: "center" })]}
            >
              <Spacer />
              <HStack
                spacing={2}
                alignment="center"
                modifiers={[
                  padding({ horizontal: 8, vertical: 4 }),
                  background("#1C1C1ECC", shapes.capsule()),
                ]}
              >
              <Button
                target="finance-prev-month"
                label="<"
                onPress={() => {
                  if (financeCanGoPrev !== "1") {
                    return {};
                  }
                  const packRows = financeMonthsPack.split(";;");
                  const nextIndex = financeIndex - 1;
                  const packParts = (packRows[nextIndex] || "").split("|");
                  return {
                    financeMonthKey: packParts[0] || "",
                    financeMonthLabel: packParts[1] || "",
                    financeCanGoPrev: nextIndex > 0 ? "1" : "0",
                    financeCanGoNext: nextIndex < financeMonthCount - 1 ? "1" : "0",
                    financeIncomeTotalLabel: packParts[2] || "€0,00",
                    financeBalanceTotalLabel: packParts[3] || "€0,00",
                    financeBalanceColor: packParts[4] || "#FFFFFF",
                    financeExpenseTotalLabel: packParts[5] || "€0,00",
                    financeDayCount: Number(packParts[6]) || 0,
                    financeIncomeSeries: packParts[7] || "",
                    financeExpenseSeries: packParts[8] || "",
                    financeIndex: nextIndex,
                  };
                }}
              />
              <Text
                modifiers={[
                  font({ size: 14, weight: "semibold" }),
                  foregroundStyle("#FFFFFF"),
                  frame({ minWidth: 118 }),
                ]}
              >
                {financeMonthLabel}
              </Text>
              <Button
                target="finance-next-month"
                label=">"
                onPress={() => {
                  if (financeCanGoNext !== "1") {
                    return {};
                  }
                  const packRows = financeMonthsPack.split(";;");
                  const nextIndex = financeIndex + 1;
                  const packParts = (packRows[nextIndex] || "").split("|");
                  return {
                    financeMonthKey: packParts[0] || "",
                    financeMonthLabel: packParts[1] || "",
                    financeCanGoPrev: nextIndex > 0 ? "1" : "0",
                    financeCanGoNext: nextIndex < financeMonthCount - 1 ? "1" : "0",
                    financeIncomeTotalLabel: packParts[2] || "€0,00",
                    financeBalanceTotalLabel: packParts[3] || "€0,00",
                    financeBalanceColor: packParts[4] || "#FFFFFF",
                    financeExpenseTotalLabel: packParts[5] || "€0,00",
                    financeDayCount: Number(packParts[6]) || 0,
                    financeIncomeSeries: packParts[7] || "",
                    financeExpenseSeries: packParts[8] || "",
                    financeIndex: nextIndex,
                  };
                }}
              />
              </HStack>
              <Spacer />
            </HStack>

          </VStack>

        ) : (
          <VStack
            spacing={10}
            alignment="center"
            modifiers={[
              padding({ leading: 12, trailing: 12 }),
              frame({ maxWidth: 9999, maxHeight: 9999 }),
              contentTransition("opacity"),
            ]}
          >
            <Spacer />
            <Image
              systemName={emptyIcon as "tray"}
              size={44}
              color="#FFFFFF"
              modifiers={[contentTransition("opacity")]}
            />
            <Text
              modifiers={[
                font({ size: 15, weight: "regular" }),
                foregroundStyle("#FFFFFF"),
                contentTransition("opacity"),
              ]}
            >
              {emptyLabel}
            </Text>
            <Spacer />
          </VStack>
        )}
        </VStack>
      </VStack>
    </ZStack>
  );
};

export default createWidget(
  "HomeGlanceSectionsWidget",
  HomeGlanceSectionsWidget,
);

/** Re-write the App Group layout string (createWidget only stores it on init). */
export function reregisterHomeGlanceSectionsWidgetLayout() {
  createWidget("HomeGlanceSectionsWidget", HomeGlanceSectionsWidget);
}
