import type { UpdateFinancialTransactionInput } from "@backsteros/contracts";
import { useNavigation } from "@react-navigation/native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { TextInput } from "../app-text-input";
import { DetailPropertiesInlineShell } from "../detail-properties-inline-shell";
import {
  DetailPropertyEditorRows,
  type EditablePropertyRow,
} from "../detail-property-editor-rows";
import { KeyboardAwareScrollView } from "../keyboard-aware-scroll-view";
import { PadSlideOverPanel } from "../pad-slide-over-panel";
import { PropertyOptionSheet, type PropertyOption } from "../property-option-sheet";
import { FinanceAccountAvatar } from "./finance-account-avatar";
import { TransactionLedgerTray } from "./transaction-ledger-tray";
import { InfoIcon } from "../info-icon";
import { isPadDevice } from "../../lib/device";
import { batchDeleteTransactions } from "../../lib/finance-api";
import {
  buildCategoryTree,
  categoryIconDisplay,
  type FinanceCategoryRow,
} from "../../lib/finance-categories";
import {
  formatCalendarDate,
  formatCents,
  formatFullTxDate,
  formatSignedCents,
  transactionDisplayTitle,
} from "../../lib/finance-format";
import { LETTER_PROJECTS_SQL } from "../../lib/letter-detail-model";
import { PadDetailChromeActions } from "../../lib/pad-detail-chrome-actions";
import { FLOATING_TAB_BAR_CLEARANCE } from "../../lib/tab-bar-inset";
import {
  TabStackHeaderIconButton,
  tabDetailScreenOptions,
} from "../../lib/tab-stack-options";
import { colors, spacing } from "../../lib/theme";
import { ui } from "../../lib/ui";
import { padAwareDetailHeaderOptions } from "../../lib/pad-aware-detail-header";
import { useFinanceDetailBack } from "../../lib/use-finance-detail-back";
import {
  useFinanceAccountAvatarSrcMap,
  useFinanceAccounts,
} from "../../lib/use-finance-accounts";
import { useFinanceCategories } from "../../lib/use-finance-categories";
import { useFinanceGoals } from "../../lib/use-finance-goals";
import { useFinanceRecurrings } from "../../lib/use-finance-recurrings";
import { useFinanceTransaction } from "../../lib/use-finance-transaction";
import { useLocalQuery } from "../../lib/use-local-query";
import { useMobileApiClient } from "../../lib/use-mobile-api-client";
import { useOrganizations } from "../../lib/use-organization-name-map";

type PickerKind =
  | "category"
  | "merchant"
  | "goal"
  | "account"
  | "project"
  | "recurring"
  | null;

type NamedOptionRow = { id: string; name: string | null };

function CategoryOptionIcon({ category }: { category: FinanceCategoryRow }) {
  const icon = categoryIconDisplay(category.icon);
  if (icon.emoji) {
    return <Text style={{ fontSize: 13 }}>{icon.emoji}</Text>;
  }
  return (
    <View
      style={{
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: icon.color ?? colors.faint,
      }}
    />
  );
}

function PropertyChip({
  label,
  icon,
  onPress,
  muted,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.propertyChip,
        pressed ? styles.propertyChipPressed : null,
      ]}
    >
      {icon ? <View style={styles.propertyChipIcon}>{icon}</View> : null}
      <Text
        style={[styles.propertyChipLabel, muted ? styles.propertyChipMuted : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Transaction detail.
 * - Phone: full-screen stack push.
 * - iPad: full-window slide-over card from the right (covers nav + content),
 *   styled to match desktop FinanceTransactionDetailPanel.
 */
export function TransactionDetailScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const onBack = useFinanceDetailBack("transactions");
  const isPad = isPadDevice();
  const client = useMobileApiClient();

  const detail = useFinanceTransaction(id);
  const categories = useFinanceCategories();
  const accounts = useFinanceAccounts();
  const goals = useFinanceGoals();
  const recurrings = useFinanceRecurrings();
  const organizations = useOrganizations();
  const { data: syncedProjects } =
    useLocalQuery<NamedOptionRow>(LETTER_PROJECTS_SQL);
  const projects = syncedProjects ?? [];
  const accountAvatarSrcById = useFinanceAccountAvatarSrcMap(accounts.rows);

  const [picker, setPicker] = useState<PickerKind>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [slideVisible, setSlideVisible] = useState(true);

  const transaction = detail.transaction;

  useEffect(() => {
    if (!transaction) return;
    setDraftTitle(transactionDisplayTitle(transaction));
    setDraftNotes(transaction.notes ?? "");
  }, [transaction]);

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
        title: "Transaction",
        onBack,
        headerRight: transaction
          ? () => (
              <TabStackHeaderIconButton
                accessibilityLabel="Ledger"
                chrome="plain"
                onPress={() =>
                  router.push(`/finance/ledger/${transaction.id}`)
                }
              >
                <InfoIcon color={colors.foreground} size={20} />
              </TabStackHeaderIconButton>
            )
          : undefined,
      }),
    );
  }, [isPad, navigation, onBack, router, transaction]);

  const patchProperty = useCallback(
    async (input: UpdateFinancialTransactionInput) => {
      setPropertyError(null);
      try {
        await detail.applyPatch(input);
      } catch (reason) {
        setPropertyError(
          reason instanceof Error ? reason.message : String(reason),
        );
      }
    },
    [detail],
  );

  const saveTitle = useCallback(async () => {
    if (!transaction) return;
    const next = draftTitle.trim();
    const current = transactionDisplayTitle(transaction);
    if (next === current) return;
    await patchProperty({ displayName: next.length > 0 ? next : null });
  }, [draftTitle, patchProperty, transaction]);

  const saveNotes = useCallback(async () => {
    if (!transaction) return;
    const next = draftNotes.trim();
    const current = (transaction.notes ?? "").trim();
    if (next === current) return;
    await patchProperty({ notes: next.length > 0 ? next : null });
  }, [draftNotes, patchProperty, transaction]);

  const confirmDelete = useCallback(
    (requestClose?: () => void) => {
      if (!transaction) return;
      const label = transactionDisplayTitle(transaction);
      Alert.alert("Delete transaction?", label, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await batchDeleteTransactions(client, [transaction.id]);
                if (requestClose) requestClose();
                else {
                  setSlideVisible(false);
                  onBack();
                }
              } catch (reason) {
                setPropertyError(
                  reason instanceof Error
                    ? reason.message
                    : "Could not delete transaction.",
                );
              }
            })();
          },
        },
      ]);
    },
    [client, onBack, transaction],
  );

  const categoryById = useMemo(
    () => new Map(categories.rows.map((row) => [row.id, row])),
    [categories.rows],
  );
  const accountById = useMemo(
    () => new Map(accounts.rows.map((row) => [row.id, row])),
    [accounts.rows],
  );
  const goalById = useMemo(
    () => new Map(goals.rows.map((row) => [row.id, row])),
    [goals.rows],
  );
  const orgById = useMemo(
    () => new Map(organizations.rows.map((row) => [row.id, row])),
    [organizations.rows],
  );
  const projectById = useMemo(
    () => new Map(projects.map((row) => [row.id, row])),
    [projects],
  );
  const recurringById = useMemo(
    () => new Map(recurrings.rows.map((row) => [row.id, row])),
    [recurrings.rows],
  );

  const categoryOptions = useMemo((): PropertyOption<string | null>[] => {
    const tree = buildCategoryTree(categories.rows);
    const options: PropertyOption<string | null>[] = [
      { value: null, label: "Uncategorized" },
    ];
    for (const root of tree) {
      options.push({
        value: root.id,
        label: root.name,
        icon: <CategoryOptionIcon category={root} />,
      });
      for (const child of root.children) {
        options.push({
          value: child.id,
          label: `  ${child.name}`,
          icon: <CategoryOptionIcon category={child} />,
        });
      }
    }
    return options;
  }, [categories.rows]);

  const merchantOptions = useMemo((): PropertyOption<string | null>[] => {
    return [
      { value: null, label: "No organization" },
      ...organizations.rows.map((row) => ({
        value: row.id,
        label: row.name,
      })),
    ];
  }, [organizations.rows]);

  const goalOptions = useMemo((): PropertyOption<string | null>[] => {
    return [
      { value: null, label: "No goal" },
      ...goals.rows.map((row) => ({
        value: row.id,
        label: row.name,
      })),
    ];
  }, [goals.rows]);

  const projectOptions = useMemo((): PropertyOption<string | null>[] => {
    return [
      { value: null, label: "No project" },
      ...projects.map((row) => ({
        value: row.id,
        label: row.name?.trim() || "Untitled",
      })),
    ];
  }, [projects]);

  const recurringOptions = useMemo((): PropertyOption<string | null>[] => {
    return [
      { value: null, label: "No recurring" },
      ...recurrings.rows
        .filter((row) => !row.archived)
        .map((row) => ({
          value: row.id,
          label: row.name,
        })),
    ];
  }, [recurrings.rows]);

  const accountOptions = useMemo((): PropertyOption<string>[] => {
    return accounts.rows.map((row) => ({
      value: row.id,
      label: row.name,
      icon: (
        <FinanceAccountAvatar
          src={accountAvatarSrcById[row.id] ?? null}
          name={row.name}
          size={16}
        />
      ),
    }));
  }, [accountAvatarSrcById, accounts.rows]);

  const categoryLabel = transaction?.categoryId
    ? (categoryById.get(transaction.categoryId)?.name ?? "Category")
    : "Uncategorized";
  const merchantLabel = transaction?.organizationId
    ? (orgById.get(transaction.organizationId)?.name ?? "Organization")
    : "No organization";
  const goalLabel = transaction?.goalId
    ? (goalById.get(transaction.goalId)?.name ?? "Goal")
    : "No goal";
  const projectLabel = transaction?.projectId
    ? (projectById.get(transaction.projectId)?.name?.trim() || "Project")
    : "No project";
  const recurringLabel = transaction?.recurringId
    ? (recurringById.get(transaction.recurringId)?.name ?? "Recurring")
    : "No recurring";
  const account = transaction
    ? (accountById.get(transaction.bankAccountId) ?? null)
    : null;
  const accountLabel = account?.name ?? "Account";

  const categoryChipIcon = useMemo(() => {
    if (!transaction?.categoryId) return null;
    const category = categoryById.get(transaction.categoryId);
    return category ? <CategoryOptionIcon category={category} /> : null;
  }, [categoryById, transaction?.categoryId]);

  const phonePropertyRows: EditablePropertyRow[] = [
    {
      key: "category",
      label: "Category",
      value: categoryLabel,
      icon: categoryChipIcon,
    },
    {
      key: "merchant",
      label: "Merchant",
      value: merchantLabel,
    },
    {
      key: "goal",
      label: "Goal",
      value: goalLabel,
    },
    {
      key: "account",
      label: "Account",
      value: accountLabel,
      icon: account ? (
        <FinanceAccountAvatar
          src={accountAvatarSrcById[account.id] ?? null}
          name={account.name}
          size={14}
        />
      ) : undefined,
      navigateHref: transaction
        ? `/finance/account/${transaction.bankAccountId}`
        : null,
      navigateLabel: account ? `Open ${account.name}` : "Open account",
    },
  ];

  const propertyChips = [
    {
      key: "category",
      label: categoryLabel,
      icon: categoryChipIcon ?? undefined,
    },
    ...(transaction?.organizationId
      ? [{ key: "merchant", label: merchantLabel }]
      : []),
    ...(transaction?.goalId ? [{ key: "goal", label: goalLabel }] : []),
    {
      key: "account",
      label: accountLabel,
      icon: account ? (
        <FinanceAccountAvatar
          src={accountAvatarSrcById[account.id] ?? null}
          name={account.name}
          size={12}
        />
      ) : undefined,
    },
  ];

  // Property sheets live inside a parent Modal (phone properties sheet or
  // iPad slide-over) — nested RN Modals do not stack reliably.
  const propertySheets = (
    <>
      <PropertyOptionSheet
        embedded
        visible={picker === "category"}
        title="Category"
        options={categoryOptions}
        selected={transaction?.categoryId ?? null}
        onSelect={(value) => {
          setPicker(null);
          void patchProperty({ categoryId: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "merchant"}
        title="Organization"
        options={merchantOptions}
        selected={transaction?.organizationId ?? null}
        onSelect={(value) => {
          setPicker(null);
          void patchProperty({ organizationId: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "project"}
        title="Project"
        options={projectOptions}
        selected={transaction?.projectId ?? null}
        onSelect={(value) => {
          setPicker(null);
          void patchProperty({ projectId: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "goal"}
        title="Goal"
        options={goalOptions}
        selected={transaction?.goalId ?? null}
        onSelect={(value) => {
          setPicker(null);
          void patchProperty({ goalId: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "recurring"}
        title="Recurring"
        options={recurringOptions}
        selected={transaction?.recurringId ?? null}
        onSelect={(value) => {
          setPicker(null);
          void patchProperty({ recurringId: value });
        }}
        onClose={() => setPicker(null)}
      />
      <PropertyOptionSheet
        embedded
        visible={picker === "account"}
        title="Account"
        options={accountOptions}
        selected={transaction?.bankAccountId ?? ""}
        onSelect={(value) => {
          setPicker(null);
          void patchProperty({ bankAccountId: value });
        }}
        onClose={() => setPicker(null)}
      />
    </>
  );

  const phonePropertyEditor = (
    <>
      <DetailPropertyEditorRows
        rows={phonePropertyRows}
        onPressRow={(key) => setPicker(key as PickerKind)}
      />
      {propertyError ? (
        <Text style={[ui.error, { paddingTop: 8 }]}>{propertyError}</Text>
      ) : null}
    </>
  );

  const phoneEditors = transaction ? (
    <View style={styles.phoneMainPad}>
      <View style={styles.phoneTitleBlock}>
        <TextInput
          value={draftTitle}
          onChangeText={setDraftTitle}
          onBlur={() => void saveTitle()}
          placeholder="Transaction title"
          placeholderTextColor={colors.muted}
          style={styles.phoneTitleInput}
        />
        <Text
          style={[
            styles.phoneAmount,
            transaction.amountCents > 0 ? styles.phoneAmountPositive : null,
          ]}
        >
          {formatSignedCents(transaction.amountCents, transaction.currency)}
        </Text>
        <Text style={styles.phoneMeta}>
          {formatCalendarDate(transaction.bookedOn)}
        </Text>
      </View>

      <DetailPropertiesInlineShell
        modalTitle="Transaction properties"
        chips={propertyChips}
        overlay={propertySheets}
      >
        {phonePropertyEditor}
      </DetailPropertiesInlineShell>

      <View style={styles.phoneNotesBlock}>
        <Text style={styles.phoneNotesLabel}>Notes</Text>
        <TextInput
          value={draftNotes}
          onChangeText={setDraftNotes}
          onBlur={() => void saveNotes()}
          placeholder="Add notes…"
          placeholderTextColor={colors.muted}
          multiline
          scrollEnabled={false}
          textAlignVertical="top"
          style={styles.phoneNotesInput}
        />
      </View>
    </View>
  ) : null;

  const padEditors = transaction ? (
    <View style={styles.padBody}>
      <View style={styles.padHero}>
        <Text style={styles.padDate}>
          {formatFullTxDate(transaction.bookedOn)}
        </Text>
        <View style={styles.padHeroPrimary}>
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            onBlur={() => void saveTitle()}
            placeholder="Transaction title"
            placeholderTextColor={colors.muted}
            style={styles.padTitleInput}
          />
          <Text
            style={[
              styles.padAmount,
              transaction.amountCents < 0
                ? styles.padAmountDebit
                : styles.padAmountCredit,
            ]}
          >
            {formatCents(transaction.amountCents, transaction.currency)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          onPress={() => setPicker("account")}
          style={({ pressed }) => [
            styles.padAccountTrigger,
            pressed ? styles.padAccountTriggerPressed : null,
          ]}
        >
          <FinanceAccountAvatar
            src={
              account
                ? (accountAvatarSrcById[account.id] ?? null)
                : null
            }
            name={accountLabel}
            size={18}
          />
          <Text style={styles.padAccountName} numberOfLines={1}>
            {accountLabel}
          </Text>
        </Pressable>
      </View>

      <View style={styles.padProps}>
        <View style={styles.padPropRow}>
          <Text style={styles.padPropLabel}>Category</Text>
          <PropertyChip
            label={categoryLabel}
            icon={categoryChipIcon}
            muted={!transaction.categoryId}
            onPress={() => setPicker("category")}
          />
        </View>
        <View style={styles.padPropRow}>
          <Text style={styles.padPropLabel}>Organization</Text>
          <PropertyChip
            label={merchantLabel}
            muted={!transaction.organizationId}
            onPress={() => setPicker("merchant")}
          />
        </View>
        <View style={styles.padPropRow}>
          <Text style={styles.padPropLabel}>Project</Text>
          <PropertyChip
            label={projectLabel}
            muted={!transaction.projectId}
            onPress={() => setPicker("project")}
          />
        </View>
        <View style={styles.padPropRow}>
          <Text style={styles.padPropLabel}>Goal</Text>
          <PropertyChip
            label={goalLabel}
            muted={!transaction.goalId}
            onPress={() => setPicker("goal")}
          />
        </View>
        <View style={styles.padPropRow}>
          <Text style={styles.padPropLabel}>Recurring</Text>
          <PropertyChip
            label={recurringLabel}
            muted={!transaction.recurringId}
            onPress={() => setPicker("recurring")}
          />
        </View>
        {propertyError ? (
          <Text style={[ui.error, { paddingHorizontal: 0, paddingTop: 4 }]}>
            {propertyError}
          </Text>
        ) : null}
      </View>

      <View style={styles.padNotes}>
        <Text style={styles.padNotesHeading}>Notes</Text>
        <TextInput
          value={draftNotes}
          onChangeText={setDraftNotes}
          onBlur={() => void saveNotes()}
          placeholder="Add notes…"
          placeholderTextColor={colors.muted}
          multiline
          scrollEnabled={false}
          textAlignVertical="top"
          style={styles.padNotesInput}
        />
      </View>
    </View>
  ) : null;

  const loadingBody =
    detail.loading && !transaction ? (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    ) : null;

  const missingBody =
    !transaction && !detail.loading ? (
      <View style={[ui.screen, styles.missingPad]}>
        <Text style={ui.error}>{detail.error ?? "Transaction not found."}</Text>
        <Text style={ui.hint} onPress={() => void detail.reload()}>
          Tap to retry
        </Text>
      </View>
    ) : null;

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
        {/* Transparent host so the previous list screen stays visible under the Modal. */}
        <View style={styles.padStackPlaceholder} pointerEvents="none" />
        <PadSlideOverPanel
          visible={slideVisible}
          onClose={() => {
            setSlideVisible(false);
            onBack();
          }}
          accessibilityLabel="Transaction details"
        >
          {(requestClose) => (
            <View style={styles.slideRoot}>
              {transaction || loadingBody || missingBody ? (
                <View style={styles.padChrome}>
                  <PadDetailChromeActions
                    embedded
                    onCollapse={requestClose}
                    collapseAccessibilityLabel="Hide transaction details"
                    menuAriaLabel="Transaction actions"
                    menuItems={
                      transaction
                        ? [
                            {
                              key: "delete",
                              label: "Delete transaction",
                              danger: true,
                              onPress: () => confirmDelete(requestClose),
                            },
                          ]
                        : []
                    }
                  />
                </View>
              ) : null}
              {loadingBody}
              {missingBody}
              {transaction ? (
                <>
                  <KeyboardAwareScrollView
                    style={styles.slideScroll}
                    bottomClearance={24}
                    keepEndVisibleWhileTyping
                  >
                    {padEditors}
                  </KeyboardAwareScrollView>
                  <TransactionLedgerTray transaction={transaction} />
                </>
              ) : null}
              {propertySheets}
            </View>
          )}
        </PadSlideOverPanel>
      </>
    );
  }

  if (detail.loading && !transaction) {
    return (
      <>
        <Stack.Screen
          options={{
            ...tabDetailScreenOptions(),
            ...padAwareDetailHeaderOptions({ onBack }),
          }}
        />
        <View style={ui.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </>
    );
  }

  if (!transaction) {
    return (
      <>
        <Stack.Screen
          options={{
            ...tabDetailScreenOptions(),
            ...padAwareDetailHeaderOptions({ onBack }),
          }}
        />
        <View style={ui.screen}>
          <Text style={ui.error}>{detail.error ?? "Transaction not found."}</Text>
          <Text style={ui.hint} onPress={() => void detail.reload()}>
            Tap to retry
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions(),
          ...padAwareDetailHeaderOptions({
            onBack,
            headerRight: () => (
              <TabStackHeaderIconButton
                accessibilityLabel="Ledger"
                chrome="plain"
                onPress={() =>
                  router.push(`/finance/ledger/${transaction.id}`)
                }
              >
                <InfoIcon color={colors.foreground} size={20} />
              </TabStackHeaderIconButton>
            ),
          }),
        }}
      />
      <KeyboardAwareScrollView
        style={ui.screen}
        bottomClearance={FLOATING_TAB_BAR_CLEARANCE}
        keepEndVisibleWhileTyping
      >
        {phoneEditors}
      </KeyboardAwareScrollView>
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
  missingPad: {
    padding: spacing.screenX,
  },

  // Desktop-parity iPad panel body
  padBody: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 20,
  },
  padHero: {
    gap: 6,
    minWidth: 0,
  },
  padDate: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.01,
  },
  padHeroPrimary: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    minWidth: 0,
  },
  padTitleInput: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.4,
    lineHeight: 32,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  padAmount: {
    flexShrink: 0,
    fontSize: 28,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.4,
    lineHeight: 32,
    textAlign: "right",
  },
  padAmountDebit: {
    color: "#c45b5b",
  },
  padAmountCredit: {
    color: "#3f9d6e",
  },
  padAccountTrigger: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    paddingVertical: 2,
    paddingLeft: 2,
    paddingRight: 6,
    borderRadius: 8,
  },
  padAccountTriggerPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  padAccountName: {
    flexShrink: 1,
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 13,
    fontWeight: "500",
  },
  padProps: {
    gap: 10,
  },
  padPropRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minWidth: 0,
  },
  padPropLabel: {
    flexShrink: 0,
    minWidth: 104,
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 12,
    fontWeight: "500",
  },
  propertyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "70%",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  propertyChipPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  propertyChipIcon: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  propertyChipLabel: {
    flexShrink: 1,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
  },
  propertyChipMuted: {
    color: colors.muted,
  },
  padNotes: {
    gap: 8,
    marginTop: 8,
  },
  padNotesHeading: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 12,
    fontWeight: "500",
  },
  padNotesInput: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 120,
    paddingVertical: 4,
  },

  // Phone layout (unchanged hierarchy)
  phoneMainPad: {
    paddingBottom: 24,
  },
  phoneTitleBlock: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 8,
    gap: 6,
  },
  phoneTitleInput: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
    paddingVertical: 4,
  },
  phoneAmount: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  phoneAmountPositive: {
    color: "#7fc8a9",
  },
  phoneMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  phoneNotesBlock: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 16,
    gap: 6,
  },
  phoneNotesLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  phoneNotesInput: {
    color: colors.foreground,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 120,
    paddingVertical: 4,
  },
});
