import { useLocalSearchParams } from "expo-router";

import { EmailComposeScreen } from "../../../../components/email-compose-screen";

function asParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

/** Compose/reply reached from a Tasks email thread — stays in the Tasks stack. */
export default function TasksEmailComposeRoute() {
  const params = useLocalSearchParams<{
    inboxId?: string;
    replyTo?: string;
    subject?: string;
    replyToFrom?: string;
  }>();
  return (
    <EmailComposeScreen
      inboxId={asParam(params.inboxId)}
      replyToMessageId={asParam(params.replyTo)}
      subject={asParam(params.subject)}
      replyToFrom={asParam(params.replyToFrom)}
    />
  );
}
