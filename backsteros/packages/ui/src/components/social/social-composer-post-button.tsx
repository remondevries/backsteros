"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon } from "@primer/octicons-react";

import { socialPlatformIcon } from "../../contacts/social-platforms.js";
import type {
  SocialMockAnalyticsPlatformFilterId,
  SocialMockPostPlatform,
} from "../../social/social-mock-data.js";
import {
  SOCIAL_PLATFORM_NAV_IDS,
  SOCIAL_PLATFORM_NAV_ITEMS,
  type SocialPlatformNavId,
} from "../../social/social-nav.js";
import { ChevronDownIcon } from "../icons/chevron-down-icon.js";

export type SocialComposerPostButtonProps = {
  platform: SocialMockAnalyticsPlatformFilterId;
  disabled?: boolean;
  /** Connected platforms for the active Personal / Business bundle. */
  availablePlatforms?: readonly SocialMockPostPlatform[];
  /** Platforms selected for multi-post when filter is All. */
  postTargets: readonly SocialPlatformNavId[];
  onPostTargetsChange: (next: readonly SocialPlatformNavId[]) => void;
  /** Planned tab uses Plan instead of immediate Post. */
  action?: "post" | "plan";
  onSubmit?: () => void;
};

function platformActionLabel(
  platform: Exclude<SocialMockAnalyticsPlatformFilterId, "all">,
  action: "post" | "plan",
): string {
  const name =
    platform === "x"
      ? "X"
      : (SOCIAL_PLATFORM_NAV_ITEMS.find((item) => item.id === platform)?.label ??
        platform);
  return action === "plan" ? `Plan for ${name}` : `Post to ${name}`;
}

export function SocialComposerPostButton({
  platform,
  disabled = false,
  availablePlatforms = SOCIAL_PLATFORM_NAV_IDS,
  postTargets,
  onPostTargetsChange,
  action = "post",
  onSubmit,
}: SocialComposerPostButtonProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = new Set(postTargets);
  const availableItems = SOCIAL_PLATFORM_NAV_ITEMS.filter((item) =>
    availablePlatforms.includes(item.id),
  );
  const canPost = !disabled && (platform !== "all" || selected.size > 0);
  const primaryLabel = action === "plan" ? "Plan" : "Post";
  const targetsHint =
    action === "plan" ? "Plan for these accounts" : "Post to these accounts";
  const menuAriaLabel =
    action === "plan" ? "Choose platforms to plan for" : "Choose platforms to post to";
  const menuLabel =
    action === "plan" ? "Plan for platforms" : "Post to platforms";

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: MouseEvent) {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (!root.contains(event.target)) setMenuOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (platform !== "all") setMenuOpen(false);
  }, [platform]);

  function toggleTarget(id: SocialPlatformNavId) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onPostTargetsChange(
      availablePlatforms.filter((entry) => next.has(entry)),
    );
  }

  if (platform !== "all") {
    return (
      <button
        type="button"
        className="social-feed__composer-submit"
        disabled={!canPost}
        onClick={onSubmit}
      >
        {platformActionLabel(platform, action)}
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      className={[
        "social-feed__composer-submit-group",
        menuOpen ? "is-open" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="social-feed__composer-submit social-feed__composer-submit--main"
        disabled={!canPost}
        onClick={onSubmit}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        className="social-feed__composer-submit social-feed__composer-submit--menu"
        aria-label={menuAriaLabel}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <ChevronDownIcon size={12} />
      </button>

      {menuOpen ? (
        <div
          id={menuId}
          className="social-feed__composer-targets"
          role="menu"
          aria-label={menuLabel}
        >
          <p className="social-feed__composer-targets-hint">{targetsHint}</p>
          <ul className="social-feed__composer-targets-list">
            {availableItems.map((item) => {
              const checked = selected.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    className={[
                      "social-feed__composer-target",
                      checked ? "is-checked" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => toggleTarget(item.id)}
                  >
                    <span
                      className="social-feed__composer-target-icon"
                      aria-hidden="true"
                    >
                      {socialPlatformIcon(item.platform, 14)}
                    </span>
                    <span className="social-feed__composer-target-label">
                      {item.label}
                    </span>
                    <span
                      className="social-feed__composer-target-check"
                      aria-hidden="true"
                    >
                      {checked ? <CheckIcon size={12} /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
