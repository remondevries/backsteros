import { Stack, useLocalSearchParams } from "expo-router";

import { DocumentDetailScreen } from "../../components/document-detail-screen";
import { tabDetailScreenOptions } from "../../lib/tab-stack-options";

/** Root-stack document detail — preserves back to the previous screen. */
export default function RootDocumentDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const documentId = typeof id === "string" ? id : id?.[0];

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <DocumentDetailScreen documentId={documentId} />
    </>
  );
}
