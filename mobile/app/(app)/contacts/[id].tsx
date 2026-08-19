import { useLocalSearchParams } from "expo-router";

import { ContactDetailRoute } from "../../../components/contact-detail-route";

export default function ContactsDetailRoute() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === "string" ? rawId : rawId?.[0] ?? "";
  return <ContactDetailRoute contactId={id} />;
}
