import { serveProxiedAvatar } from "@/lib/avatars/serve-proxied-avatar";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ organizationId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  return serveProxiedAvatar({
    entityType: "organization",
    entityId: organizationId,
  });
}
