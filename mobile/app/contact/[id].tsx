import { Stack, useLocalSearchParams } from "expo-router";

import { ContactDetailRoute } from "../../components/contact-detail-route";
import { tabDetailScreenOptions } from "../../lib/tab-stack-options";

/** Root-stack contact detail — preserves back to the previous screen. */
export default function RootContactDetailRoute() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === "string" ? rawId : rawId?.[0] ?? "";

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <ContactDetailRoute contactId={id} />
    </>
  );
}
