import { useLocalSearchParams } from "expo-router";

import { DocumentDetailScreen } from "../../../components/document-detail-screen";

export default function KnowledgeDocumentDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const documentId = typeof id === "string" ? id : id?.[0];
  return <DocumentDetailScreen documentId={documentId} />;
}
