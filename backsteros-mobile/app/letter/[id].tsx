import { Stack, useLocalSearchParams } from "expo-router";

import { LetterDetailScreen } from "../../components/letter-detail-screen";
import { tabDetailScreenOptions } from "../../lib/tab-stack-options";

/** Root-stack letter detail — preserves back to the previous screen. */
export default function RootLetterDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const letterId = typeof id === "string" ? id : id?.[0];

  return (
    <>
      <Stack.Screen options={tabDetailScreenOptions()} />
      <LetterDetailScreen letterId={letterId} />
    </>
  );
}
