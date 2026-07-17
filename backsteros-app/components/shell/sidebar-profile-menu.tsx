"use client";

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

import { DotScrollLoader } from "@/components/ui/dot-scroll-loader";
import { SyncStatusIdleIcon } from "@/components/sync/sync-status-icon";
import { ProfileLogoIcon } from "@/components/shell/profile-logo-icon";
import {
  SidebarChevronIcon,
  SidebarComposeIcon,
  SidebarLogoutIcon,
  SidebarSettingsIcon,
} from "@/components/shell/sidebar-nav-icons";
import { requestOpenComposeModal } from "@/lib/compose-modal-events";
import { isE2eAuthBypassEnabled } from "@/lib/e2e-bypass-auth";
import { usePowerSync } from "@/lib/powersync-context";
import {
  getDefaultSettingsHref,
  SETTINGS_SHORTCUT_HINT,
} from "@/lib/settings/settings-shortcut";

const BYPASS_AUTH = isE2eAuthBypassEnabled();

/** Personal workspace label — matches Circle sidebar branding. */
const PROFILE_DISPLAY_NAME = "Remon de Vries";

function formatLastSyncedAt(date: Date, nowMs = Date.now()): string {
  const diffMs = Math.max(0, nowMs - date.getTime());
  if (diffMs < 60_000) {
    return "Just now";
  }
  if (diffMs < 3_600_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`;
  }

  const sameDay = new Date(nowMs).toDateString() === date.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SidebarAccountIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M2.5 13.25c.9-2.1 2.9-3.25 5.5-3.25s4.6 1.15 5.5 3.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

type ProfileMenuShellProps = {
  displayName: string;
  renderAccountActions?: (closeMenu: () => void) => ReactNode;
};

function ProfileMenuShell({
  displayName,
  renderAccountActions,
}: ProfileMenuShellProps) {
  const sync = usePowerSync();
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualSyncPending, setManualSyncPending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const menuRef = useRef<HTMLElement>(null);

  const syncInProgress =
    sync.connecting ||
    Boolean(sync.connected && !sync.lastSyncedAt) ||
    manualSyncPending;

  const syncMenuLabel = sync.offline
    ? "Offline"
    : sync.error
      ? "Retry sync"
      : syncInProgress
        ? "Syncing…"
        : sync.connected
          ? "Sync now"
          : "Connect sync";

  const lastSyncMeta = sync.lastSyncedAt
    ? formatLastSyncedAt(sync.lastSyncedAt, nowMs)
    : syncInProgress
      ? null
      : "Never";

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const settingsHref = getDefaultSettingsHref();
  const closeMenu = () => setMenuOpen(false);

  function handleComposeOpen() {
    closeMenu();
    requestOpenComposeModal();
  }

  async function handleSyncNow() {
    if (manualSyncPending) {
      return;
    }

    flushSync(() => {
      closeMenu();
      setManualSyncPending(true);
    });

    try {
      await sync.retry();
    } finally {
      setManualSyncPending(false);
    }
  }

  const triggerSyncing = syncInProgress || Boolean(sync.error);

  return (
    <div className="app-side-panel-profile-row">
      <header className="app-side-panel-profile" ref={menuRef}>
        <button
          type="button"
          className={[
            "app-side-panel-profile-trigger",
            menuOpen ? "app-side-panel-profile-trigger-open" : null,
            triggerSyncing ? "app-side-panel-profile-trigger-sync" : null,
            sync.offline || sync.error
              ? "app-side-panel-profile-trigger-sync-offline"
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={
            syncInProgress ? "Open profile menu, Syncing…" : "Open profile menu"
          }
          aria-busy={syncInProgress}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span
            className={[
              "app-side-panel-profile-logo",
              syncInProgress ? "app-side-panel-profile-logo-sync" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          >
            {syncInProgress ? (
              <DotScrollLoader
                status={sync.offline || sync.error ? "waiting" : "working"}
                squareDots
                className="app-side-panel-profile-sync-loader"
                aria-label="Syncing"
              />
            ) : (
              <ProfileLogoIcon className="app-side-panel-profile-logo-mark" />
            )}
          </span>
          <span
            className={[
              "app-side-panel-profile-name",
              syncInProgress ? "app-side-panel-profile-name-sync" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {syncInProgress ? "Syncing…" : displayName}
          </span>
          <SidebarChevronIcon
            className="app-side-panel-profile-trigger-chevron"
            expanded={menuOpen}
            pointing="down"
          />
        </button>

        {menuOpen ? (
          <div
            className="app-side-panel-profile-menu"
            role="menu"
            aria-label="Profile menu"
          >
            <div className="app-side-panel-profile-menu-section">
              <Link
                href={settingsHref}
                role="menuitem"
                className="app-side-panel-item app-side-panel-profile-menu-item"
                title={`Settings (${SETTINGS_SHORTCUT_HINT})`}
                onClick={closeMenu}
              >
                <span className="app-side-panel-item-icon">
                  <SidebarSettingsIcon size={14} />
                </span>
                <span className="app-side-panel-item-label">Settings</span>
              </Link>
              <button
                type="button"
                role="menuitem"
                className="app-side-panel-item app-side-panel-profile-menu-item"
                disabled={manualSyncPending}
                title={
                  sync.error?.message ??
                  (sync.lastSyncedAt
                    ? `Last sync ${sync.lastSyncedAt.toLocaleString()}`
                    : "Waiting for first sync")
                }
                onClick={() => void handleSyncNow()}
              >
                <span className="app-side-panel-item-icon">
                  <SyncStatusIdleIcon size={14} />
                </span>
                <span className="app-side-panel-item-label">{syncMenuLabel}</span>
                {lastSyncMeta ? (
                  <span className="app-side-panel-profile-menu-item-meta">
                    {lastSyncMeta}
                  </span>
                ) : null}
              </button>
              {renderAccountActions?.(closeMenu)}
            </div>
          </div>
        ) : null}
      </header>

      <button
        type="button"
        className="app-side-panel-compose-trigger"
        aria-label="Create item"
        title="Create item"
        onClick={handleComposeOpen}
      >
        <SidebarComposeIcon />
      </button>
    </div>
  );
}

function ClerkAccountActions({ closeMenu }: { closeMenu: () => void }) {
  const { openUserProfile, signOut } = useClerk();
  const [logoutPending, startLogoutTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="app-side-panel-item app-side-panel-profile-menu-item"
        onClick={() => {
          closeMenu();
          openUserProfile();
        }}
      >
        <span className="app-side-panel-item-icon">
          <SidebarAccountIcon />
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
            void signOut({ redirectUrl: "/sign-in" });
          });
        }}
      >
        <span className="app-side-panel-item-icon">
          <SidebarLogoutIcon />
        </span>
        <span className="app-side-panel-item-label">Log out</span>
      </button>
    </>
  );
}

function ClerkSidebarProfileMenu() {
  return (
    <ProfileMenuShell
      displayName={PROFILE_DISPLAY_NAME}
      renderAccountActions={(closeMenu) => (
        <ClerkAccountActions closeMenu={closeMenu} />
      )}
    />
  );
}

export function SidebarProfileMenu() {
  if (BYPASS_AUTH) {
    return <ProfileMenuShell displayName="Test workspace" />;
  }

  return <ClerkSidebarProfileMenu />;
}
