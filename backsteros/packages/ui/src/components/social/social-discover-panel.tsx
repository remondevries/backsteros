"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ImageIcon, SyncIcon } from "@primer/octicons-react";

import {
  getSocialMockAnalyticsForAccount,
  getSocialMockOwnedAccounts,
  getSocialMockProfileForAccount,
  socialMockProfileDisplayName,
  type SocialMockAccountKind,
  type SocialMockAnalyticsPlatformFilterId,
  type SocialMockProfile,
} from "../../social/social-mock-data.js";
import {
  getSocialAnalyticsHref,
  SOCIAL_PLATFORM_NAV_ITEMS,
} from "../../social/social-nav.js";
import { ClientLink } from "../../shared/client-link.js";
import {
  CommunicationInstagramKindIcon,
  CommunicationXKindIcon,
} from "../communication/communication-kind-icons.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { ContactSummaryEditor } from "../contacts/contact-summary-editor.js";
import { FacebookIcon } from "../icons/facebook-icon.js";
import { DevNullIcon } from "../icons/dev-null-icon.js";
import { LinkedInIcon } from "../icons/linkedin-icon.js";

export type SocialDiscoverPanelProps = {
  className?: string;
  /** Active feed platform filter — drives the mini-profile avatar badge. */
  platform?: SocialMockAnalyticsPlatformFilterId;
  /** Personal vs business owned-account bundle (controlled from feed chrome). */
  accountKind?: SocialMockAccountKind;
};

type ProfileDraft = Pick<
  SocialMockProfile,
  "firstName" | "lastName" | "bio" | "avatarUrl" | "coverUrl"
>;

function platformLabel(platform: string): string {
  return (
    SOCIAL_PLATFORM_NAV_ITEMS.find((item) => item.id === platform)?.label ??
    platform
  );
}

function MiniProfilePlatformBadge({
  platform,
}: {
  platform: Exclude<SocialMockAnalyticsPlatformFilterId, "all">;
}) {
  // Same brand marks / sizing as Messages list kind dots.
  if (platform === "instagram") {
    return <CommunicationInstagramKindIcon size={15} />;
  }
  if (platform === "x") {
    return <CommunicationXKindIcon size={15} />;
  }
  if (platform === "facebook") {
    return <FacebookIcon size={15} />;
  }
  if (platform === "dev-null") {
    return <DevNullIcon size={15} />;
  }
  return <LinkedInIcon size={15} />;
}

function formatStat(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(value);
}

function draftFromProfile(profile: SocialMockProfile): ProfileDraft {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    coverUrl: profile.coverUrl,
  };
}

function draftsEqual(a: ProfileDraft, b: ProfileDraft): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.bio === b.bio &&
    a.avatarUrl === b.avatarUrl &&
    a.coverUrl === b.coverUrl
  );
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

type AccountDraftState = {
  baseline: ProfileDraft;
  draft: ProfileDraft;
};

function initialAccountState(
  kind: SocialMockAccountKind,
): AccountDraftState {
  const profile = getSocialMockProfileForAccount(kind);
  const draft = draftFromProfile(profile);
  return { baseline: draft, draft };
}

export function SocialDiscoverPanel({
  className,
  platform = "all",
  accountKind = "personal",
}: SocialDiscoverPanelProps) {
  const [accounts, setAccounts] = useState<
    Record<SocialMockAccountKind, AccountDraftState>
  >(() => ({
    personal: initialAccountState("personal"),
    business: initialAccountState("business"),
  }));
  const [pushing, setPushing] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const profile = getSocialMockProfileForAccount(accountKind);
  const analytics = useMemo(
    () => getSocialMockAnalyticsForAccount(accountKind, platform),
    [accountKind, platform],
  );
  const ownedAccounts = useMemo(
    () => getSocialMockOwnedAccounts(accountKind),
    [accountKind],
  );

  // Keep mock avatar in sync when brand assets change and the user hasn't edited it.
  useEffect(() => {
    const nextAvatar = profile.avatarUrl;
    setAccounts((current) => {
      const entry = current[accountKind];
      if (entry.draft.avatarUrl !== entry.baseline.avatarUrl) return current;
      if (entry.baseline.avatarUrl === nextAvatar) return current;
      const next = { ...entry.draft, avatarUrl: nextAvatar };
      return {
        ...current,
        [accountKind]: { baseline: next, draft: next },
      };
    });
  }, [accountKind, profile.avatarUrl]);
  const activeOwnedAccount = useMemo(() => {
    if (platform === "all") return null;
    return (
      ownedAccounts.find((account) => account.platform === platform) ?? null
    );
  }, [ownedAccounts, platform]);
  const handle = activeOwnedAccount?.handle ?? profile.handle;
  const { baseline, draft } = accounts[accountKind];
  const badgeLabel =
    platform === "all"
      ? "Change avatar"
      : `${platformLabel(platform)} · Change avatar`;
  const showPlatformBadge = platform !== "all";
  const avatarInputId = useId();
  const coverInputId = useId();

  const dirty = useMemo(() => !draftsEqual(draft, baseline), [draft, baseline]);
  const displayName = socialMockProfileDisplayName(draft);

  useEffect(() => {
    if (!pushMessage || pushing) return;
    const timer = window.setTimeout(() => setPushMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [pushMessage, pushing]);

  function patchAccount(
    kind: SocialMockAccountKind,
    updater: (current: AccountDraftState) => AccountDraftState,
  ) {
    setAccounts((current) => ({
      ...current,
      [kind]: updater(current[kind]),
    }));
  }

  function updateDraft(partial: Partial<ProfileDraft>) {
    patchAccount(accountKind, (current) => ({
      ...current,
      draft: { ...current.draft, ...partial },
    }));
    setPushMessage(null);
  }

  async function onPickImage(
    file: File | undefined,
    field: "avatarUrl" | "coverUrl",
  ) {
    if (!file || !file.type.startsWith("image/")) return;
    const url = await readImageAsDataUrl(file);
    updateDraft({ [field]: url });
  }

  async function onPush() {
    if (!dirty || pushing) return;
    setPushing(true);
    setPushMessage(null);
    // Static mock — stand-in for per-platform profile sync adapters.
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    patchAccount(accountKind, (current) => ({
      ...current,
      baseline: current.draft,
    }));
    setPushing(false);
    setPushMessage(
      accountKind === "business"
        ? `Pushed ${displayName} to business accounts`
        : `Pushed ${displayName} to Facebook, Instagram, X, and LinkedIn`,
    );
  }

  return (
    <div
      className={["social-discover", className].filter(Boolean).join(" ")}
    >
      <section
        className="social-discover__mini-profile"
        aria-label={
          accountKind === "business"
            ? "Synced business profile"
            : "Synced personal profile"
        }
      >
        <div className="social-discover__mini-cover">
          <img
            src={draft.coverUrl}
            alt=""
            className="social-discover__mini-cover-image"
          />
          <label
            htmlFor={coverInputId}
            className="social-discover__mini-media-edit social-discover__mini-media-edit--cover"
          >
            <ImageIcon size={12} />
            <span>Banner</span>
          </label>
          <input
            id={coverInputId}
            type="file"
            accept="image/*"
            className="social-discover__mini-file"
            onChange={(event) => {
              void onPickImage(event.target.files?.[0], "coverUrl");
              event.target.value = "";
            }}
          />
        </div>

        <div className="social-discover__mini-body">
          <div className="social-discover__mini-avatar-row">
            <div className="social-discover__mini-avatar">
              <img
                src={draft.avatarUrl}
                alt=""
                className="social-discover__mini-avatar-image"
              />
              {showPlatformBadge ? (
                <label
                  htmlFor={avatarInputId}
                  className={[
                    "social-discover__mini-platform",
                    `social-discover__mini-platform--${platform}`,
                  ].join(" ")}
                  aria-label={badgeLabel}
                  title={badgeLabel}
                >
                  <MiniProfilePlatformBadge platform={platform} />
                </label>
              ) : (
                <label
                  htmlFor={avatarInputId}
                  className="social-discover__mini-avatar-hit"
                  aria-label={badgeLabel}
                  title={badgeLabel}
                />
              )}
              <input
                id={avatarInputId}
                type="file"
                accept="image/*"
                className="social-discover__mini-file"
                onChange={(event) => {
                  void onPickImage(event.target.files?.[0], "avatarUrl");
                  event.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="social-discover__mini-name-row">
            <OverviewNameEditor
              value={draft.firstName}
              entityLabel={
                accountKind === "business" ? "Page name" : "First name"
              }
              fitContent
              as="span"
              titleClassName="social-discover__mini-name-title"
              onDraftChange={(next) => {
                updateDraft({ firstName: next });
              }}
              onLeaveTitle={() => {
                /* focus moves to last name via Tab naturally */
              }}
              onSave={(next) => {
                updateDraft({ firstName: next });
                return { ok: true };
              }}
            />
            {accountKind === "personal" || draft.lastName ? (
              <OverviewNameEditor
                value={draft.lastName}
                entityLabel="Last name"
                fitContent
                allowEmpty
                as="span"
                titleClassName="social-discover__mini-name-title social-discover__mini-name-title--last"
                onDraftChange={(next) => {
                  updateDraft({ lastName: next });
                }}
                onSave={(next) => {
                  updateDraft({ lastName: next });
                  return { ok: true };
                }}
              />
            ) : null}
          </div>

          <span className="social-discover__mini-handle">@{handle}</span>
          <div className="social-discover__mini-bio">
            <ContactSummaryEditor
              value={draft.bio}
              placeholder="Add a description"
              onChange={(next) => {
                updateDraft({ bio: next });
              }}
              onSave={(next) => {
                updateDraft({ bio: next?.trim() ?? "" });
              }}
            />
          </div>
          <div className="social-discover__mini-stats">
            <span>
              <strong>{formatStat(profile.followingCount)}</strong> Following
            </span>
            <span>
              <strong>{formatStat(profile.followersCount)}</strong> Followers
            </span>
            <button
              type="button"
              className="social-discover__mini-push"
              disabled={!dirty || pushing}
              title={
                dirty
                  ? "Sync name, bio, avatar, and banner to connected accounts"
                  : "Up to date across platforms"
              }
              aria-label={pushing ? "Pushing profile" : "Push profile"}
              onClick={() => {
                void onPush();
              }}
            >
              <SyncIcon size={14} />
              <span>{pushing ? "Pushing…" : "Push"}</span>
            </button>
          </div>
          {pushMessage ? (
            <p className="social-discover__mini-push-status" role="status">
              {pushMessage}
            </p>
          ) : null}
        </div>
      </section>

      <section
        className="social-discover__section social-discover__section--analytics"
        aria-label="Analytics"
      >
        <header className="social-discover__analytics-header">
          <div className="social-discover__analytics-heading">
            <h2 className="social-discover__section-title">Analytics</h2>
            <ClientLink
              href={getSocialAnalyticsHref({ platform })}
              className="social-discover__analytics-open"
            >
              Open
            </ClientLink>
          </div>
          <p className="social-discover__analytics-subtitle">
            {analytics.subtitle} · {analytics.periodLabel}
          </p>
        </header>

        <div className="social-discover__metrics">
          {analytics.metrics.map((metric) => (
            <ClientLink
              key={metric.id}
              href={getSocialAnalyticsHref({
                metric: metric.id,
                platform,
              })}
              className="social-discover__metric"
            >
              <span className="social-discover__metric-label">
                {metric.label}
              </span>
              <span className="social-discover__metric-value">
                {metric.valueLabel}
              </span>
              <span
                className={[
                  "social-discover__metric-delta",
                  `social-discover__metric-delta--${metric.delta}`,
                ].join(" ")}
              >
                {metric.deltaLabel}
              </span>
            </ClientLink>
          ))}
        </div>

        <ClientLink
          href={getSocialAnalyticsHref({ metric: "top-post", platform })}
          className="social-discover__top-post"
        >
          <span className="social-discover__top-post-eyebrow">
            Top post · {platformLabel(analytics.topPostPlatform)}
          </span>
          <span className="social-discover__top-post-title">
            {analytics.topPostTitle}
          </span>
          <span className="social-discover__top-post-meta">
            {analytics.topPostEngagementLabel}
          </span>
        </ClientLink>
      </section>
    </div>
  );
}
