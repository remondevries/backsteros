"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon } from "@primer/octicons-react";

import { socialPlatformIcon } from "../../contacts/social-platforms.js";
import { LINKEDIN_GEO_COUNTRY_OPTIONS } from "../../social/linkedin-reactions.js";
import type {
  SocialMockAccountKind,
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
  /** Personal vs Business — LinkedIn Post targets profile vs company page. */
  accountKind?: SocialMockAccountKind;
  disabled?: boolean;
  /** Connected platforms for the active Personal / Business bundle. */
  availablePlatforms?: readonly SocialMockPostPlatform[];
  /** Platforms selected for multi-post when filter is All. */
  postTargets: readonly SocialPlatformNavId[];
  onPostTargetsChange: (next: readonly SocialPlatformNavId[]) => void;
  /**
   * LinkedIn company-page audience countries (ISO alpha-2). Empty = worldwide.
   * Shown as a chevron menu on “Post to company page”, like platform targets.
   */
  geoCountries?: readonly string[];
  onGeoCountriesChange?: (next: readonly string[]) => void;
  /** Planned tab uses Plan; editing a tray chip uses Update. */
  action?: "post" | "plan" | "update";
  onSubmit?: () => void;
};

function platformActionLabel(
  platform: Exclude<SocialMockAnalyticsPlatformFilterId, "all">,
  action: "post" | "plan" | "update",
  accountKind: SocialMockAccountKind = "personal",
): string {
  if (platform === "linkedin") {
    const target =
      accountKind === "business" ? "company page" : "LinkedIn";
    if (action === "update") return `Update on ${target}`;
    if (action === "plan") return `Plan for ${target}`;
    return `Post to ${target}`;
  }
  const name =
    platform === "x"
      ? "X"
      : (SOCIAL_PLATFORM_NAV_ITEMS.find((item) => item.id === platform)?.label ??
        platform);
  if (action === "update") return `Update on ${name}`;
  if (action === "plan") return `Plan for ${name}`;
  return `Post to ${name}`;
}

function geoSummaryLabel(codes: readonly string[]): string {
  if (codes.length === 0) return "Worldwide";
  if (codes.length === 1) {
    return (
      LINKEDIN_GEO_COUNTRY_OPTIONS.find((entry) => entry.code === codes[0])
        ?.label ?? codes[0]!
    );
  }
  return `${codes.length} countries`;
}

export function SocialComposerPostButton({
  platform,
  accountKind = "personal",
  disabled = false,
  availablePlatforms = SOCIAL_PLATFORM_NAV_IDS,
  postTargets,
  onPostTargetsChange,
  geoCountries = [],
  onGeoCountriesChange,
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
  const primaryLabel =
    action === "update" ? "Update" : action === "plan" ? "Plan" : "Post";
  const showGeoMenu =
    platform === "linkedin" &&
    accountKind === "business" &&
    onGeoCountriesChange != null;
  const geoSelected = new Set(geoCountries);

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
    setMenuOpen(false);
  }, [platform, accountKind]);

  function toggleTarget(id: SocialPlatformNavId) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onPostTargetsChange(
      availablePlatforms.filter((entry) => next.has(entry)),
    );
  }

  function toggleGeoCountry(code: string) {
    if (!onGeoCountriesChange) return;
    const next = new Set(geoSelected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onGeoCountriesChange(
      LINKEDIN_GEO_COUNTRY_OPTIONS.map((entry) => entry.code).filter((entry) =>
        next.has(entry),
      ),
    );
  }

  if (platform !== "all" && !showGeoMenu) {
    return (
      <button
        type="button"
        className="social-feed__composer-submit"
        disabled={!canPost}
        onClick={onSubmit}
      >
        {platformActionLabel(platform, action, accountKind)}
      </button>
    );
  }

  if (showGeoMenu && platform === "linkedin") {
    const submitLabel = platformActionLabel("linkedin", action, accountKind);
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
          {submitLabel}
          {geoCountries.length > 0 ? (
            <span className="social-feed__composer-submit-meta">
              · {geoSummaryLabel(geoCountries)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className="social-feed__composer-submit social-feed__composer-submit--menu"
          aria-label={
            geoCountries.length > 0
              ? `Audience countries, ${geoSummaryLabel(geoCountries)}`
              : "Choose audience countries"
          }
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
            className="social-feed__composer-targets social-feed__composer-targets--geo"
            role="menu"
            aria-label="Audience countries"
          >
            <p className="social-feed__composer-targets-hint">
              Audience countries
            </p>
            <ul className="social-feed__composer-targets-list social-feed__composer-targets-list--scroll">
              <li>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={geoCountries.length === 0}
                  className={[
                    "social-feed__composer-target",
                    geoCountries.length === 0 ? "is-checked" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onGeoCountriesChange?.([])}
                >
                  <span
                    className="social-feed__composer-target-code"
                    aria-hidden="true"
                  >
                    —
                  </span>
                  <span className="social-feed__composer-target-label">
                    Worldwide
                  </span>
                  <span
                    className="social-feed__composer-target-check"
                    aria-hidden="true"
                  >
                    {geoCountries.length === 0 ? (
                      <CheckIcon size={12} />
                    ) : null}
                  </span>
                </button>
              </li>
              {LINKEDIN_GEO_COUNTRY_OPTIONS.map((country) => {
                const checked = geoSelected.has(country.code);
                return (
                  <li key={country.code}>
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
                      onClick={() => toggleGeoCountry(country.code)}
                    >
                      <span className="social-feed__composer-target-code">
                        {country.code}
                      </span>
                      <span className="social-feed__composer-target-label">
                        {country.label}
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

  const targetsHint =
    action === "update"
      ? "Update these accounts"
      : action === "plan"
        ? "Plan for these accounts"
        : "Post to these accounts";
  const menuAriaLabel =
    action === "update"
      ? "Choose platforms to update"
      : action === "plan"
        ? "Choose platforms to plan for"
        : "Choose platforms to post to";
  const menuLabel =
    action === "update"
      ? "Update platforms"
      : action === "plan"
        ? "Plan for platforms"
        : "Post to platforms";

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
