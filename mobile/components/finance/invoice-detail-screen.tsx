import { useNavigation } from "expo-router/react-navigation";
import { Stack, useLocalSearchParams } from "expo-router";
import { useLayoutEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { PadSlideOverPanel } from "../pad-slide-over-panel";
import { InvoiceDetailDocument } from "./invoice-detail-document";
import { isPadDevice } from "../../lib/device";
import { PadDetailChromeActions } from "../../lib/pad-detail-chrome-actions";
import { padAwareDetailHeaderOptions } from "../../lib/pad-aware-detail-header";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import { tabDetailScreenOptions } from "../../lib/tab-stack-options";
import { ui } from "../../lib/ui";
import { useFinanceDetailBack } from "../../lib/use-finance-detail-back";
import { useFinanceInvoiceDetail } from "../../lib/use-finance-invoices";

/**
 * Invoice detail.
 * - Phone: full-screen stack push with document layout.
 * - iPad: full-window slide-over card from the right (same shell as transactions),
 *   document UI matching desktop FinanceInvoiceDetailDocument.
 */
export function InvoiceDetailScreen() {
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoiceId = typeof id === "string" ? id : null;
  const onBack = useFinanceDetailBack("invoices");
  const isPad = isPadDevice();

  const { detail, loading, error } = useFinanceInvoiceDetail(invoiceId);
  const [slideVisible, setSlideVisible] = useState(true);

  useLayoutEffect(() => {
    if (isPad) {
      navigation.setOptions({
        presentation: "transparentModal",
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
        animation: "none",
        gestureEnabled: false,
      });
      return;
    }
    navigation.setOptions(
      padAwareDetailHeaderOptions({
        title: "Invoice",
        onBack,
      }),
    );
  }, [isPad, navigation, onBack]);

  const document = (
    <InvoiceDetailDocument
      detail={detail}
      loading={loading}
      error={error}
    />
  );

  if (isPad) {
    return (
      <>
        <Stack.Screen
          options={{
            presentation: "transparentModal",
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
            animation: "none",
            gestureEnabled: false,
          }}
        />
        <View style={styles.padStackPlaceholder} pointerEvents="none" />
        <PadSlideOverPanel
          visible={slideVisible}
          onClose={() => {
            setSlideVisible(false);
            onBack();
          }}
          accessibilityLabel="Invoice details"
        >
          {(requestClose) => (
            <View style={styles.slideRoot}>
              <View style={styles.padChrome}>
                <PadDetailChromeActions
                  embedded
                  onCollapse={requestClose}
                  collapseAccessibilityLabel="Hide invoice details"
                />
              </View>
              <ScrollView
                style={styles.slideScroll}
                contentContainerStyle={styles.slideScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {document}
              </ScrollView>
            </View>
          )}
        </PadSlideOverPanel>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <ScrollView
        style={ui.screen}
        contentContainerStyle={styles.phoneContent}
        keyboardShouldPersistTaps="handled"
      >
        {document}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  padStackPlaceholder: {
    flex: 1,
    backgroundColor: "transparent",
  },
  slideRoot: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  padChrome: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
    alignItems: "flex-end",
  },
  slideScroll: {
    flex: 1,
  },
  slideScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  phoneContent: {
    flexGrow: 1,
    paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
  },
});
