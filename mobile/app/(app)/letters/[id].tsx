import { useLocalSearchParams } from "expo-router";

import { LetterDetailScreen } from "../../../components/letter-detail-screen";

export default function LettersDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const letterId = typeof id === "string" ? id : id?.[0];
  return <LetterDetailScreen letterId={letterId} />;
}
