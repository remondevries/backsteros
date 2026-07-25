"use client";

import {
  SidebarAccountIcon,
  SidebarChevronIcon,
  SidebarLogoutIcon,
} from "@backsteros/ui";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { AdminLogoIcon } from "@/components/admin-logo-icon";

function resolveDisplayName(
  user:
    | {
        fullName?: string | null;
        firstName?: string | null;
        username?: string | null;
        primaryEmailAddress?: { emailAddress?: string | null } | null;
      }
    | null
    | undefined,
): string {
  const fullName = user?.fullName?.trim();
  if (fullName) return fullName;
  const firstName = user?.firstName?.trim();
  if (firstName) return firstName;
  const username = user?.username?.trim();
  if (username) return username;
  const email = user?.primaryEmailAddress?.emailAddress?.trim();
  if (email) return email;
  return "Account";
}

export function AdminProfileMenu() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutPending, startLogoutTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const displayName = resolveDisplayName(user);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="app-side-panel-profile-row admin-profile-row">
      <div className="app-side-panel-profile" ref={menuRef}>
        <button
          type="button"
          className={[
            "app-side-panel-profile-trigger",
            menuOpen ? "app-side-panel-profile-trigger-open" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Open profile menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={displayName}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="app-side-panel-profile-logo" aria-hidden="true">
            <AdminLogoIcon className="app-side-panel-profile-logo-mark" />
          </span>
          <span className="app-side-panel-profile-name admin-brand-name">
            <span className="admin-brand-name-thin">Admin</span>
            <span className="admin-brand-name-bold">Dashboard</span>
          </span>
          <SidebarChevronIcon
            className="app-side-panel-profile-trigger-chevron"
            pointing="down"
            expanded={menuOpen}
          />
        </button>

        {menuOpen ? (
          <div
            className="app-side-panel-profile-menu"
            role="menu"
            aria-label="Profile menu"
          >
            <div className="app-side-panel-profile-menu-section">
              <button
                type="button"
                role="menuitem"
                className="app-side-panel-item app-side-panel-profile-menu-item"
                onClick={() => {
                  closeMenu();
                  openUserProfile();
                }}
              >
                <span className="app-side-panel-item-icon" aria-hidden="true">
                  <SidebarAccountIcon size={14} />
                </span>
                <span className="app-side-panel-item-label">Account</span>
              </button>
              <div
                className="app-side-panel-profile-menu-divider"
                role="separator"
                aria-hidden="true"
              />
              <button
                type="button"
                role="menuitem"
                className="app-side-panel-item app-side-panel-profile-menu-item"
                disabled={logoutPending}
                onClick={() => {
                  closeMenu();
                  startLogoutTransition(() => {
                    void signOut({ redirectUrl: "/" });
                  });
                }}
              >
                <span className="app-side-panel-item-icon" aria-hidden="true">
                  <SidebarLogoutIcon />
                </span>
                <span className="app-side-panel-item-label">Log out</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
