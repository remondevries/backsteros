import { serveProxiedAvatar } from "@/lib/avatars/serve-proxied-avatar";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ contactId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { contactId } = await context.params;
  return serveProxiedAvatar({
    entityType: "contact",
    entityId: contactId,
  });
}
