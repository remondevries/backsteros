import type { Contact } from "@backsteros/contracts";
import { ActivityIndicator, View } from "react-native";

import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { useMobileApiClient } from "../lib/use-mobile-api-client";
import { useSyncedOrRest } from "../lib/use-synced-or-rest";
import { ContactDetailScreen } from "./contact-detail-screen";

type ContactNameRow = {
  id: string;
  name: string | null;
};

type NameRow = {
  name: string | null;
};

type Props = {
  contactId: string;
};

const DETAIL_SQL = `SELECT id, name FROM contacts
 WHERE deleted_at IS NULL AND id = ?
 LIMIT 1`;

const EMPTY_SQL = `SELECT id, name FROM contacts WHERE 0`;

/** Loads contact title then renders detail (root-stack route). */
export function ContactDetailRoute({ contactId: id }: Props) {
  const client = useMobileApiClient();

  const { rows, loading } = useSyncedOrRest<ContactNameRow, NameRow>({
    sql: id ? DETAIL_SQL : EMPTY_SQL,
    params: id ? [id] : [],
    mapLocal: (synced) => synced.map((row) => ({ name: row.name })),
    fetchRest: async () => {
      if (!id) return [];
      const body = await client.requestJson<{ contacts: Contact[] }>(
        "/api/v1/contacts",
      );
      const match = (body.contacts ?? []).find((contact) => contact.id === id);
      return match ? [{ name: match.name ?? null }] : [];
    },
  });

  const title = rows[0]?.name ?? "Contact";

  if (loading) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <ContactDetailScreen contactId={id} title={title || "Untitled"} />
  );
}
