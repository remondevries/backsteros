import { useLocalSearchParams } from "expo-router";

import { EmailThreadScreen } from "../../../../components/email-thread-screen";

function asParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

export default function EmailThreadRoute() {
  const params = useLocalSearchParams<{
    inboxId: string;
    messageId: string;
  }>();
  return (
    <EmailThreadScreen
      inboxId={asParam(params.inboxId)}
      messageId={asParam(params.messageId)}
    />
  );
}
