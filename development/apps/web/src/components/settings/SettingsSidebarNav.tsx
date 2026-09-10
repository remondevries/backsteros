import { lazy, Suspense, useCallback, type ComponentType } from "react";
import {
  ArchiveIcon,
  FolderKanbanIcon,
  ArrowLeftIcon,
  BlocksIcon,
  BotIcon,
  GitBranchIcon,
  KeyboardIcon,
  Link2Icon,
  PaletteIcon,
  Settings2Icon,
} from "lucide-react";
import { useCanGoBack, useNavigate } from "@tanstack/react-router";

import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "../ui/sidebar";
import { SidebarChromeFooter } from "../sidebar/SidebarChrome";
import { scrollToSettingsTarget } from "./settingsLayout";
import { SETTINGS_SECTION_LABELS, type SettingsPath } from "./settingsSearch";

const T3ConnectSidebarSignIn = lazy(() =>
  import("../clerk/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSidebarSignIn,
  })),
);
const T3ConnectSidebarAvatar = lazy(() =>
  import("../clerk/T3ConnectSidebarSignIn").then((module) => ({
    default: module.T3ConnectSidebarAvatar,
  })),
);

const SETTINGS_SECTION_ICONS: Readonly<
  Record<SettingsPath, ComponentType<{ className?: string }>>
> = {
  "/settings/general": Settings2Icon,
  "/settings/appearance": PaletteIcon,
  "/settings/keybindings": KeyboardIcon,
  "/settings/providers": BotIcon,
  "/settings/integrations": BlocksIcon,
  "/settings/source-control": GitBranchIcon,
  "/settings/connections": Link2Icon,
  "/settings/projects": FolderKanbanIcon,
  "/settings/archived": ArchiveIcon,
};

export const SETTINGS_NAV_ITEMS: ReadonlyArray<{
  label: string;
  to: SettingsPath;
  icon: ComponentType<{ className?: string }>;
}> = (Object.keys(SETTINGS_SECTION_LABELS) as SettingsPath[]).map((to) => ({
  to,
  label: SETTINGS_SECTION_LABELS[to],
  icon: SETTINGS_SECTION_ICONS[to],
}));

const SETTINGS_PAGE_SECTIONS: Partial<
  Readonly<Record<SettingsPath, ReadonlyArray<{ label: string; targetId: string }>>>
> = {
  "/settings/general": [
    { label: "Organization", targetId: "organization" },
    { label: "Behavior", targetId: "behavior" },
    { label: "Projects & threads", targetId: "projects-and-threads" },
    { label: "Confirmations", targetId: "confirmations" },
    { label: "Text generation", targetId: "text-generation" },
    { label: "About", targetId: "about" },
    { label: "Legacy features", targetId: "legacy-features" },
  ],
  "/settings/appearance": [
    { label: "Colors & themes", targetId: "appearance" },
    { label: "Interface", targetId: "appearance-interface" },
    { label: "Typography", targetId: "typography" },
  ],
  "/settings/source-control": [
    { label: "Version control", targetId: "source-control" },
    { label: "Text generation", targetId: "source-control-text-generation" },
  ],
  "/settings/connections": [
    { label: "This environment", targetId: "connections-environment" },
    { label: "Remote environments", targetId: "remote-environments" },
  ],
};

export function SettingsSidebarNav({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleBackClick = useCallback(() => {
    if (isMobile) setOpenMobile(false);
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, isMobile, navigate, setOpenMobile]);

  const handleSectionClick = useCallback(
    (to: SettingsPath) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      void navigate({
        to,
        hash: "",
        replace: true,
        hashScrollIntoView: false,
      });
    },
    [isMobile, navigate, setOpenMobile],
  );
  const handlePageSectionClick = useCallback(
    (to: SettingsPath, targetId: string) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      if (pathname === to && scrollToSettingsTarget(targetId, { highlight: false })) {
        return;
      }
      void navigate({
        to,
        hash: targetId,
        replace: true,
        hashScrollIntoView: false,
        state: { settingsTargetHighlight: false },
      });
    },
    [isMobile, navigate, pathname, setOpenMobile],
  );

  return (
    <>
      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup className="gap-2 p-[var(--sidebar-content-inset)]">
          <SidebarMenu className="ps-px">
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleBackClick} aria-label="Back">
                <ArrowLeftIcon />
                <span>Back</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {SETTINGS_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.to || pathname.startsWith(`${item.to}/`);
              const pageSections = SETTINGS_PAGE_SECTIONS[item.to];
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => handleSectionClick(item.to)}
                  >
                    <Icon />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                  {isActive && pageSections ? (
                    <SidebarMenuSub className="border-l-0">
                      {pageSections.map((section) => (
                        <SidebarMenuSubItem key={section.targetId}>
                          <SidebarMenuSubButton
                            render={<button type="button" />}
                            size="sm"
                            className="w-full text-sidebar-muted-foreground/65"
                            onClick={() => handlePageSectionClick(item.to, section.targetId)}
                          >
                            <span className="ms-0.5">{section.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <div className="flex shrink-0 flex-col gap-2 px-[var(--sidebar-content-inset)] pb-1">
        <Suspense fallback={null}>
          <T3ConnectSidebarSignIn />
        </Suspense>
        <div className="flex justify-end">
          <Suspense fallback={null}>
            <T3ConnectSidebarAvatar />
          </Suspense>
        </div>
      </div>
      <SidebarChromeFooter />
    </>
  );
}
