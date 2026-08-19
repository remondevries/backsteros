import { usePathname, useRouter, type Href } from "expo-router";
import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FinanceAccountAvatar } from "./finance-account-avatar";
import { FinanceSectionNavIcon } from "./finance-section-nav-icons";
import { PadSidePanelCollapseButton } from "../../lib/pad-side-panel-collapse";
import { groupBankAccounts } from "../../lib/bank-account-groups";
import {
  MOBILE_FINANCE_SECTIONS,
  financeSectionForPathname,
} from "../../lib/finance-sections";
import type { FinanceGoNavigationItem } from "../../lib/finance-go-navigation";
import { colors, spacing } from "../../lib/theme";
import {
  useFinanceAccountAvatarSrcMap,
  useFinanceAccounts,
} from "../../lib/use-finance-accounts";
import { useFinanceNavigationShortcuts } from "../../lib/use-finance-navigation-shortcuts";

/**
 * iPad finance nav pane — sections + grouped bank accounts, mirroring
 * desktop's finance side panel. F then letter switches sections.
 */
export function FinanceSideNav({
  onToggleCollapse,
}: {
  onToggleCollapse?: () => void;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const accounts = useFinanceAccounts();
  const avatarSrcById = useFinanceAccountAvatarSrcMap(accounts.rows);

  const activeSection = financeSectionForPathname(pathname);
  const activeAccountId = useMemo(() => {
    const match = /^\/finance\/account\/([^/]+)/.exec(pathname);
    return match?.[1] ?? null;
  }, [pathname]);

  const onFinanceGo = useCallback(
    (item: FinanceGoNavigationItem) => {
      router.navigate(item.href as Href);
    },
    [router],
  );

  useFinanceNavigationShortcuts({
    onNavigate: onFinanceGo,
  });

  const groups = useMemo(
    () => groupBankAccounts(accounts.rows),
    [accounts.rows],
  );

  return (
    <ScrollView
      style={styles.pane}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: 24,
      }}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Finance</Text>
        {onToggleCollapse ? (
          <PadSidePanelCollapseButton
            onCollapse={onToggleCollapse}
            accessibilityLabel="Hide Finance navigation"
          />
        ) : null}
      </View>

      <View style={styles.sectionList}>
        {MOBILE_FINANCE_SECTIONS.map((section) => {
          // Account detail keeps "Accounts" highlighted, matching desktop.
          const selected =
            activeSection === section.id && activeAccountId == null
              ? true
              : section.id === "accounts" && activeAccountId != null;
          return (
            <Pressable
              key={section.id}
              accessibilityRole="button"
              accessibilityState={selected ? { selected: true } : {}}
              accessibilityLabel={section.label}
              onPress={() => router.navigate(section.href as Href)}
              style={({ pressed }) => [
                styles.navRow,
                selected ? styles.navRowSelected : null,
                pressed ? { backgroundColor: colors.rowPressed } : null,
              ]}
            >
              <View style={styles.navIcon} accessibilityElementsHidden>
                <FinanceSectionNavIcon
                  id={section.id}
                  color={selected ? colors.foreground : colors.muted}
                  size={16}
                />
              </View>
              <Text
                style={[
                  styles.navLabel,
                  selected ? styles.navLabelSelected : null,
                ]}
              >
                {section.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {groups.map((group) => (
        <View key={group.id} style={styles.group}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          {group.accounts.map((account) => {
            const selected = activeAccountId === account.id;
            return (
              <Pressable
                key={account.id}
                accessibilityRole="button"
                accessibilityState={selected ? { selected: true } : {}}
                accessibilityLabel={account.name}
                onPress={() =>
                  router.navigate({
                    pathname: "/finance/account/[id]",
                    params: { id: account.id },
                  })
                }
                style={({ pressed }) => [
                  styles.navRow,
                  selected ? styles.navRowSelected : null,
                  pressed ? { backgroundColor: colors.rowPressed } : null,
                ]}
              >
                <FinanceAccountAvatar
                  src={avatarSrcById[account.id] ?? null}
                  name={account.name}
                  size={18}
                />
                <Text
                  style={[
                    styles.navLabel,
                    selected ? styles.navLabelSelected : null,
                  ]}
                  numberOfLines={1}
                >
                  {account.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    backgroundColor: colors.background,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: spacing.screenX,
    paddingBottom: 10,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 22,
    fontWeight: "600",
  },
  sectionList: {
    paddingHorizontal: 8,
    gap: 1,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
  },
  navIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  navRowSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  navLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
  navLabelSelected: {
    color: colors.foreground,
  },
  group: {
    marginTop: 18,
    paddingHorizontal: 8,
    gap: 1,
  },
  groupLabel: {
    paddingHorizontal: 10,
    paddingBottom: 4,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
