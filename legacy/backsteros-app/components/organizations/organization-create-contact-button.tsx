"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { getOrganizationContactHrefFromKey } from "@/lib/contact-route-scope";
import { createContactAction } from "@/lib/mutations/contacts";

type OrganizationCreateContactButtonProps = {
  organizationId: string;
  organizationRouteParam: string;
};

export function OrganizationCreateContactButton({
  organizationId,
  organizationRouteParam,
}: OrganizationCreateContactButtonProps) {
  const router = useRouter();
  const [isCreating, startCreateTransition] = useTransition();

  function handleCreateContact() {
    startCreateTransition(async () => {
      const result = await createContactAction({
        name: "New contact",
        organizationId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      router.push(
        getOrganizationContactHrefFromKey(
          organizationRouteParam,
          result.contactKey,
        ),
      );
    });
  }

  return (
    <button
      type="button"
      onClick={handleCreateContact}
      disabled={isCreating}
      className="shrink-0 cursor-pointer rounded-full border-[0.5px] border-white/10 px-2 py-1 text-xs text-foreground/55 transition-colors hover:text-foreground/80 disabled:cursor-not-allowed disabled:opacity-55"
    >
      {isCreating ? "Creating…" : "Create new contact"}
    </button>
  );
}
