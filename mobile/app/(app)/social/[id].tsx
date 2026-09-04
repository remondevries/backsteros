import { useLocalSearchParams } from "expo-router";

import { SocialContactDetailScreen } from "../../../components/social-contact-detail-screen";

export default function SocialDetailRoute() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === "string" ? rawId : rawId?.[0] ?? "";
  return <SocialContactDetailScreen contactId={id} />;
}
