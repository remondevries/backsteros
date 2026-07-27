import type { Organization } from "@/lib/db/schema";

export const ORGANIZATION_DISPLAY_KEY = "O";

export function formatOrganizationDisplayId(organizationNumber: number): string {
  return `${ORGANIZATION_DISPLAY_KEY}-${organizationNumber}`;
}

export function getOrganizationDisplayId(
  organization: Pick<Organization, "number">,
): string | null {
  if (!organization.number) {
    return null;
  }

  return formatOrganizationDisplayId(organization.number);
}
