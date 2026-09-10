import { ChartNoAxesColumnIcon, ChevronDownIcon, SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { memo, useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { BacksterosLogoIcon } from "~/backsteros/BacksterosLogoIcon";
import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { SidebarCursorCreditsUsageBar } from "./SidebarCursorCreditsUsageBar";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { SidebarWorkspaceModeToggle } from "./SidebarWorkspaceModeToggle";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
  brand,
  brandAction,
  logModeEnabled,
  onLogModeChange,
}: {
  isElectron: boolean;
  /**
   * Replaces the default Backster brand below the titlebar.
   * Pass `null` to render no brand.
   */
  readonly brand?: ReactNode;
  /** Right-side control on the brand row (e.g. compose / create). */
  readonly brandAction?: ReactNode;
  readonly logModeEnabled?: boolean;
  readonly onLogModeChange?: (enabled: boolean) => void;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <>
      {/*
        Titlebar stays clear on the left for macOS traffic lights. The panel
        toggle sits on the right; brand lives in the row below.
      */}
      <SidebarHeader
        className={cn(
          "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center justify-end gap-1 bg-black px-3 py-0",
          isElectron && "drag-region",
        )}
      >
        {pillLabel ? (
          <Badge
            className="relative z-10 me-auto hidden rounded-full px-1.5 text-muted-foreground @[15rem]/sidebar-header:inline-flex"
            data-environment-identification="pill"
            size="sm"
            variant="secondary"
          >
            {pillLabel}
          </Badge>
        ) : null}
        <SidebarTrigger
          className="relative z-10 text-white/90 hover:text-white focus-visible:ring-white/90 [&_svg]:opacity-100! [:hover,[data-pressed]]:bg-white/15"
          aria-label="Toggle main sidebar"
        />
      </SidebarHeader>
      {brand === undefined ? (
        <div className="flex shrink-0 items-center gap-1 px-[var(--sidebar-content-inset)] pb-1 pt-1">
          <div className="min-w-0 flex-1">
            <SidebarBrand logModeEnabled={logModeEnabled} onLogModeChange={onLogModeChange} />
          </div>
          {brandAction ? <div className="shrink-0">{brandAction}</div> : null}
        </div>
      ) : (
        brand
      )}
    </>
  );
});

export function SidebarBrand({
  className,
  logModeEnabled,
  onLogModeChange,
}: {
  readonly className?: string;
  readonly logModeEnabled?: boolean;
  readonly onLogModeChange?: (enabled: boolean) => void;
} = {}) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const [menuOpen, setMenuOpen] = useState(false);
  const showCodingModeToggle = logModeEnabled != null && onLogModeChange != null;

  const closeMobileSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const goTo = useCallback(
    (path: "/settings" | "/usage") => {
      closeMobileSidebar();
      setMenuOpen(false);
      if (path === "/usage") {
        void navigate({ to: "/usage", search: { section: "premium" } });
        return;
      }
      void navigate({ to: path });
    },
    [closeMobileSidebar, navigate],
  );

  return (
    <Menu open={menuOpen} onOpenChange={setMenuOpen}>
      <MenuTrigger
        aria-label="Open BacksterDEV menu"
        className={cn(
          "relative z-10 inline-flex h-auto w-fit max-w-full min-w-0 items-center gap-2 overflow-visible rounded-[10px] border-[0.5px] border-transparent py-2 pe-2.5 ps-2 text-sidebar-foreground outline-hidden transition-[border-color,background] hover:border-foreground/12 hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-ring data-popup-open:border-foreground/12 data-popup-open:bg-sidebar-row-hover",
          className,
        )}
      >
        <span
          className="inline-flex shrink-0 items-center justify-center overflow-visible"
          aria-hidden
        >
          <BacksterosLogoIcon size={24} />
        </span>
        <span className="inline-flex shrink-0 items-baseline whitespace-nowrap text-sm leading-[18px] tracking-[-0.01em]">
          <span className="font-extralight">Backster</span>
          <span className="font-bold">DEV</span>
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-sidebar-muted-foreground transition-transform duration-150",
            menuOpen && "rotate-180",
          )}
        />
      </MenuTrigger>
      <MenuPopup
        align="start"
        side="bottom"
        sideOffset={8}
        className="min-w-48 rounded-xl"
        aria-label="BacksterDEV menu"
      >
        <MenuItem onClick={() => goTo("/settings")}>
          <SettingsIcon />
          Settings
        </MenuItem>
        <MenuItem onClick={() => goTo("/usage")}>
          <ChartNoAxesColumnIcon />
          Usage
        </MenuItem>
        {showCodingModeToggle && onLogModeChange ? (
          <>
            <MenuSeparator />
            <MenuCheckboxItem
              variant="switch"
              checked={Boolean(logModeEnabled)}
              onCheckedChange={(checked) => onLogModeChange(Boolean(checked))}
            >
              {logModeEnabled ? "Tracked coding" : "Vibe coding"}
            </MenuCheckboxItem>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}

/** Update / status row shared by every sidebar footer (no Back — chrome stays stable). */
export const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  return (
    <SidebarMenu className="flex-row items-center gap-1">
      <SidebarUpdatePill />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter className="gap-1 p-[var(--sidebar-content-inset)]">
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarWorkspaceModeToggle />
      <SidebarCursorCreditsUsageBar />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
