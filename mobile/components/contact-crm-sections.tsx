import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { ContactRelationshipType } from "@backsteros/contracts";

import {
  useContactRelationships,
  useCrmGroupsForSubject,
} from "../lib/use-crm-data";
import { formatMobileUserFacingError } from "../lib/probe-core-health";
import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useLocalQuery } from "../lib/use-local-query";
import {
  PropertyOptionSheet,
  type PropertyOption,
} from "./property-option-sheet";

const RELATIONSHIP_TYPES: readonly {
  value: ContactRelationshipType;
  label: string;
}[] = [
  { value: "spouse", label: "Spouse" },
  { value: "partner", label: "Partner" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "friend", label: "Friend" },
  { value: "colleague", label: "Colleague" },
  { value: "reports_to", label: "Reports to" },
  { value: "other", label: "Other" },
];

const CONTACTS_SQL = `SELECT id, name FROM contacts
  WHERE deleted_at IS NULL AND id != ?
  ORDER BY name COLLATE NOCASE ASC`;

type ContactOptionRow = { id: string; name: string | null };

type Props = {
  contactId: string;
};

/**
 * Relationships + CRM groups for the contact Details tab.
 */
export function ContactCrmSections({ contactId }: Props) {
  const relationships = useContactRelationships(contactId, true);
  const groups = useCrmGroupsForSubject("contact", contactId, true);
  const { data: contactRows } = useLocalQuery<ContactOptionRow>(CONTACTS_SQL, [
    contactId,
  ]);

  const [relPickerOpen, setRelPickerOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [pendingRelatedId, setPendingRelatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberIds = useMemo(
    () => new Set(groups.memberGroups.map((group) => group.id)),
    [groups.memberGroups],
  );

  const contactOptions: PropertyOption<string>[] = (contactRows ?? []).map(
    (row) => ({
      value: row.id,
      label: row.name?.trim() || "Untitled",
    }),
  );

  const typeOptions: PropertyOption<ContactRelationshipType>[] =
    RELATIONSHIP_TYPES.map((entry) => ({
      value: entry.value,
      label: entry.label,
    }));

  const groupOptions: PropertyOption<string>[] = groups.allGroups.map(
    (group) => ({
      value: group.id,
      label: memberIds.has(group.id) ? `✓ ${group.name}` : group.name,
    }),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Relationships</Text>
        {relationships.loading && relationships.items.length === 0 ? (
          <ActivityIndicator color={colors.muted} />
        ) : null}
        {relationships.items.length === 0 && !relationships.loading ? (
          <Text style={ui.hint}>No relationships yet.</Text>
        ) : null}
        <View style={styles.list}>
          {relationships.items.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.labelChip}>
                <Text style={styles.labelText}>{item.typeLabel}</Text>
              </View>
              <Text style={styles.value} numberOfLines={1}>
                {item.relatedContactName}
              </Text>
              <Pressable
                onPress={() => {
                  setBusy(true);
                  setError(null);
                  void relationships
                    .remove(item.id)
                    .catch((reason) => {
                      setError(
                        formatMobileUserFacingError(
                          reason,
                          "Could not remove.",
                        ),
                      );
                    })
                    .finally(() => setBusy(false));
                }}
                disabled={busy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove relationship with ${item.relatedContactName}`}
              >
                <Text style={styles.remove}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
        <Pressable
          onPress={() => setRelPickerOpen(true)}
          style={styles.add}
          accessibilityRole="button"
          accessibilityLabel="Add relationship"
        >
          <Text style={styles.addLabel}>+ Relationship</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Groups</Text>
          <Pressable
            onPress={() => setGroupPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Manage groups"
          >
            <Text style={styles.headerAction}>Manage</Text>
          </Pressable>
        </View>
        {groups.memberGroups.length === 0 ? (
          <Text style={ui.hint}>Not in any group.</Text>
        ) : (
          <View style={styles.chips}>
            {groups.memberGroups.map((group) => (
              <View key={group.id} style={styles.chip}>
                <Text style={styles.chipLabel}>{group.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {error ? <Text style={ui.error}>{error}</Text> : null}
      {relationships.error ? (
        <Text style={ui.error}>{relationships.error}</Text>
      ) : null}

      <PropertyOptionSheet
        visible={relPickerOpen}
        title="Related contact"
        options={contactOptions}
        selected={null}
        onSelect={(value) => {
          if (!value) return;
          setPendingRelatedId(value);
          setRelPickerOpen(false);
          setTypePickerOpen(true);
        }}
        onClose={() => setRelPickerOpen(false)}
      />
      <PropertyOptionSheet
        visible={typePickerOpen}
        title="Relationship type"
        options={typeOptions}
        selected={null}
        onSelect={(value) => {
          if (!value || !pendingRelatedId) {
            setTypePickerOpen(false);
            setPendingRelatedId(null);
            return;
          }
          setTypePickerOpen(false);
          setBusy(true);
          setError(null);
          void relationships
            .add({ toContactId: pendingRelatedId, type: value })
            .catch((reason) => {
              setError(
                formatMobileUserFacingError(
                  reason,
                  "Could not add relationship.",
                ),
              );
            })
            .finally(() => {
              setBusy(false);
              setPendingRelatedId(null);
            });
        }}
        onClose={() => {
          setTypePickerOpen(false);
          setPendingRelatedId(null);
        }}
      />
      <PropertyOptionSheet
        visible={groupPickerOpen}
        title="CRM groups"
        options={groupOptions}
        selected={null}
        onSelect={(value) => {
          if (!value) return;
          const nextMember = !memberIds.has(value);
          setBusy(true);
          setError(null);
          void groups
            .toggleMembership(value, nextMember)
            .catch((reason) => {
              setError(
                formatMobileUserFacingError(
                  reason,
                  "Could not update group.",
                ),
              );
            })
            .finally(() => setBusy(false));
        }}
        onClose={() => setGroupPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 24,
    paddingHorizontal: 16,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },
  headerAction: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "500",
  },
  list: {
    gap: 8,
  },
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
  labelChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.background,
    flexShrink: 0,
    maxWidth: 120,
  },
  labelText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  value: {
    flex: 1,
    minWidth: 0,
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
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.surface,
  },
  chipLabel: {
    color: colors.foreground,
    fontSize: 13,
  },
});
