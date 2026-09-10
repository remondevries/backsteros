import { CreditCardIcon, SparklesIcon } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";

export type UsageSectionId = "premium" | "prepaid";

export const USAGE_SECTION_ITEMS = [
  { id: "prepaid", label: "Prepaid", icon: CreditCardIcon },
  { id: "premium", label: "Premium", icon: SparklesIcon },
] as const satisfies ReadonlyArray<{
  readonly id: UsageSectionId;
  readonly label: string;
  readonly icon: typeof SparklesIcon;
}>;

export function isUsageSectionId(value: unknown): value is UsageSectionId {
  return value === "premium" || value === "prepaid";
}

/**
 * Vertical Usage section nav — Prepaid (Cursor tokens) vs Premium (provider usage).
 */
export function UsageSidebarNav({ activeId }: { readonly activeId: UsageSectionId }) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();

  const selectSection = useCallback(
    (section: UsageSectionId) => {
      if (isMobile) setOpenMobile(false);
      void navigate({
        to: "/usage",
        search: { section },
      });
    },
    [isMobile, navigate, setOpenMobile],
  );

  return (
    <SidebarContent className="overflow-x-hidden">
      <SidebarGroup className="gap-2 p-[var(--sidebar-content-inset)]">
        <SidebarMenu className="ps-px">
          {USAGE_SECTION_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  isActive={activeId === item.id}
                  onClick={() => selectSection(item.id)}
                >
                  <Icon />
                  <span className="truncate">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
}
