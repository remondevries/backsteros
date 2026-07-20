import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { JournalDetailScreen } from "../../../components/journal-detail-screen";
import { isValidJournalDateSlug } from "../../../lib/journal";
import { ui } from "../../../lib/ui";

export default function JournalDetailRoute() {
  const { dateSlug: rawSlug } = useLocalSearchParams<{ dateSlug: string }>();
  const dateSlug = typeof rawSlug === "string" ? rawSlug : rawSlug?.[0] ?? "";

  if (!isValidJournalDateSlug(dateSlug)) {
    return (
      <View style={ui.screen}>
        <Text style={ui.error}>Invalid journal date.</Text>
      </View>
    );
  }

  return <JournalDetailScreen dateSlug={dateSlug} />;
}
