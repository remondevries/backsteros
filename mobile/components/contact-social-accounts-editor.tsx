import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  CONTACT_SOCIAL_PLATFORMS,
  formatSocialHandleInput,
  isContactSocialPlatform,
  isSocialUrlPrefixOnly,
  socialHandlePlaceholder,
  socialPlatformLabel,
  socialPlatformUrlPrefix,
  socialUrlForPlatform,
  socialUrlFromHandle,
} from "../lib/social-platforms";
import { colors } from "../lib/theme";
import { TextInput } from "./app-text-input";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";
import { SocialPlatformIcon } from "./social-platform-icon";

export type ContactSocialAccount = {
  platform: string;
  url: string;
};

export type ContactSocialAccountsEditorProps = {
  value: ContactSocialAccount[];
  disabled?: boolean;
  error?: string | null;
  onChange: (next: ContactSocialAccount[]) => void;
  onSave: (next: ContactSocialAccount[]) => void;
};

const PLATFORM_OPTIONS: PropertyOption<string>[] = CONTACT_SOCIAL_PLATFORMS.map(
  (value) => ({
    value,
    label: socialPlatformLabel(value),
  }),
);

function rowsKey(rows: ContactSocialAccount[]): string {
  return JSON.stringify(rows);
}

function dropdownValue(platform: string): string {
  if (isContactSocialPlatform(platform)) return platform;
  return platform.trim() ? "Other" : "LinkedIn";
}

function hasCompletableUrl(entry: ContactSocialAccount): boolean {
  const trimmed = entry.url.trim();
  if (!trimmed) return false;
  return !isSocialUrlPrefixOnly(trimmed);
}

/**
 * Social accounts editor — platform icon chip + @handle; full URL persisted.
 */
export function ContactSocialAccountsEditor({
  value,
  disabled = false,
  error,
  onChange,
  onSave,
}: ContactSocialAccountsEditorProps) {
  const remoteKey = rowsKey(value);
  const [rows, setRows] = useState(value);
  const [rowsSource, setRowsSource] = useState(remoteKey);
  const [draftHandles, setDraftHandles] = useState<Record<number, string>>({});
  const [platformIndex, setPlatformIndex] = useState<number | null>(null);

  if (remoteKey !== rowsSource) {
    setRowsSource(remoteKey);
    if (
      rowsKey(rows.filter(hasCompletableUrl)) === rowsSource ||
      rowsKey(rows) === rowsSource
    ) {
      setRows(value);
      setDraftHandles({});
    }
  }

  function persistCompleted(next: ContactSocialAccount[]) {
    const cleaned = next
      .map((entry) => ({
        platform: entry.platform.trim() || "Other",
        url: entry.url.trim(),
      }))
      .filter(hasCompletableUrl);
    const drafts = next.filter((entry) => !hasCompletableUrl(entry));
    setRows(drafts.length > 0 ? [...cleaned, ...drafts] : cleaned);
    setDraftHandles({});
    onChange(cleaned);
    onSave(cleaned);
  }

  function updateHandle(index: number, handleInput: string) {
    const platform = rows[index]?.platform ?? "LinkedIn";
    const url = socialUrlFromHandle(platform, handleInput);
    const next = rows.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, url } : entry,
    );
    setRows(next);
    setDraftHandles((prev) => ({ ...prev, [index]: handleInput }));
    onChange(next.filter(hasCompletableUrl));
  }

  function commitPlatform(index: number, platform: string) {
    const current = rows[index];
    if (!current) return;
    const nextPlatform =
      platform === "Other" &&
      current.platform.trim() &&
      !isContactSocialPlatform(current.platform)
        ? current.platform
        : platform;
    const nextUrl = socialUrlForPlatform(nextPlatform, current.url);
    const next = rows.map((row, rowIndex) =>
      rowIndex === index ? { platform: nextPlatform, url: nextUrl } : row,
    );
    setRows(next);
    setDraftHandles((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    onChange(next.filter(hasCompletableUrl));
    if (hasCompletableUrl({ platform: nextPlatform, url: nextUrl })) {
      persistCompleted(next);
    }
  }

  function commitHandle(index: number, handleInput: string) {
    const platform = rows[index]?.platform ?? "LinkedIn";
    const url = socialUrlFromHandle(platform, handleInput);
    persistCompleted(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, url } : row,
      ),
    );
  }

  function removeRow(index: number) {
    persistCompleted(rows.filter((_, entryIndex) => entryIndex !== index));
  }

  function addRow() {
    if (disabled || rows.length >= 20) return;
    const completed = rows.filter(hasCompletableUrl);
    const withDraft: ContactSocialAccount[] = [
      ...completed,
      {
        platform: "LinkedIn",
        url: socialPlatformUrlPrefix("LinkedIn") ?? "",
      },
    ];
    setRows(withDraft);
    setDraftHandles({});
    onChange(completed);
  }

  return (
    <View style={styles.wrap}>
      {rows.map((entry, index) => {
        const handleValue =
          draftHandles[index] ??
          formatSocialHandleInput(entry.platform, entry.url);
        const muted = !hasCompletableUrl(entry);
        const platformLabel = socialPlatformLabel(
          dropdownValue(entry.platform),
        );
        return (
          <View
            key={`social-${index}`}
            style={[styles.row, muted && styles.rowMuted]}
          >
            <Pressable
              disabled={disabled}
              onPress={() => setPlatformIndex(index)}
              style={styles.labelChip}
              accessibilityRole="button"
              accessibilityLabel={`Social platform: ${platformLabel}`}
            >
              <SocialPlatformIcon platform={entry.platform} size={14} />
            </Pressable>
            <TextInput
              value={handleValue}
              editable={!disabled}
              onChangeText={(value) => updateHandle(index, value)}
              onBlur={() => commitHandle(index, handleValue)}
              placeholder={socialHandlePlaceholder(entry.platform)}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.value}
            />
            <Pressable
              disabled={disabled}
              onPress={() => removeRow(index)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove social account"
            >
              <Text style={styles.remove}>×</Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable
        disabled={disabled || rows.length >= 20}
        onPress={addRow}
        style={styles.add}
        accessibilityRole="button"
        accessibilityLabel="Add social account"
      >
        <Text style={styles.addLabel}>+ Social</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PropertyOptionSheet
        visible={platformIndex != null}
        title="Platform"
        options={PLATFORM_OPTIONS}
        selected={
          platformIndex != null
            ? dropdownValue(rows[platformIndex]?.platform ?? "LinkedIn")
            : "LinkedIn"
        }
        onSelect={(value) => {
          const index = platformIndex;
          setPlatformIndex(null);
          if (index != null) commitPlatform(index, value);
        }}
        onClose={() => setPlatformIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rowMuted: { opacity: 0.7 },
  labelChip: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  value: {
    flex: 1,
    color: colors.foreground,
    fontSize: 15,
    paddingVertical: 2,
  },
  remove: {
    color: colors.muted,
    fontSize: 22,
    lineHeight: 24,
    paddingHorizontal: 4,
  },
  add: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  addLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
});
