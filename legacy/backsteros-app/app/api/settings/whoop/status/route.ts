import { getWhoopSettingsStatus } from "@/lib/settings/whoop-status";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getWhoopSettingsStatus());
}
