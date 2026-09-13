"use client";

import { CheckIcon, CopyIcon, XIcon } from "@primer/octicons-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";

import { ContentSidePanelHeader } from "../content/content-side-panel-header.js";
import { PillNav } from "../shared/pill-nav.js";
import { EntityAddressFields } from "../shared/entity-address-fields.js";
import {
  DEFAULT_SPACE_SEO_ENTITY,
  SPACE_SEO_SOCIAL_FIELDS,
  SPACE_SEO_SOCIAL_PREFIXES,
  spaceSeoEntityFromPayload,
  spaceSeoEntityToPayload,
  spaceSeoSocialHref,
  spaceSeoSocialLeaf,
  type SpaceSeoEntitySettings,
} from "../../spaces/space-seo-entity.js";
import { HelpArticleSeoField } from "./help-article-seo-field.js";
import type { SpaceOverviewCardItem } from "./space-overview-card.js";

export {
  DEFAULT_SPACE_SEO_ENTITY,
  SPACE_SEO_SOCIAL_FIELDS,
  SPACE_SEO_SOCIAL_PREFIXES,
  spaceSeoEntityFromPayload,
  spaceSeoEntityToPayload,
  spaceSeoSocialHref,
  spaceSeoSocialLeaf,
  type SpaceSeoEntityAddress,
  type SpaceSeoEntityPayload,
  type SpaceSeoEntitySettings,
  type SpaceSeoEntitySocial,
} from "../../spaces/space-seo-entity.js";

const COVER_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

const SETTINGS_TABS = [
  { value: "seo", label: "SEO" },
  { value: "api", label: "API" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["value"];

function isCoverImageFile(file: File): boolean {
  if (file.type && COVER_ACCEPT.split(",").includes(file.type)) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name);
}

export type SpaceSiteKeyInfo = {
  id: string;
  label: string;
  siteKeyPrefix: string;
  createdAt: string;
};

export type SupportSpaceSettings = {
  publicBaseUrl: string;
  allowedDomains: string;
  siteKeys: SpaceSiteKeyInfo[];
};

export const DEFAULT_SUPPORT_SPACE_SETTINGS: SupportSpaceSettings = {
  publicBaseUrl: "",
  allowedDomains: "",
  siteKeys: [],
};

function formatMaskedSiteKey(prefix: string | null | undefined): string {
  const trimmed = prefix?.trim() ?? "";
  if (!trimmed) return "sk_space_.....";
  return `${trimmed}.....`;
}

export type SpaceSeoSettings = {
  publishSlug: string;
  seoTitle: string;
  seoDescription: string;
};

export const DEFAULT_SPACE_SEO_SETTINGS: SpaceSeoSettings = {
  publishSlug: "",
  seoTitle: "",
  seoDescription: "",
};

/** Editable host/path for the slug field; scheme is shown as a fixed prefix. */
function spaceSlugLeaf(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/^\/+/, "");
}

function spaceSlugOpenHref(leaf: string): string | null {
  const hostPath = spaceSlugLeaf(leaf);
  if (!hostPath) return null;
  return `https://${hostPath}`;
}

export type SpaceSettingsSidePanelProps = {
  space: SpaceOverviewCardItem;
  initialSettings?: SupportSpaceSettings;
  initialSeo?: SpaceSeoSettings;
  initialSeoEntity?: SpaceSeoEntitySettings;
  coverSrc?: string | null;
  onClose: () => void;
  onSave?: (settings: SupportSpaceSettings) => void | Promise<void>;
  onSeoChange?: (seo: SpaceSeoSettings) => void | Promise<void>;
  onSeoEntityChange?: (
    entity: SpaceSeoEntitySettings,
  ) => void | Promise<void>;
  onCreateSiteKey?: (
    label: string,
  ) => Promise<
    | { siteKey: string; key: SpaceSiteKeyInfo; siteKeys: SpaceSiteKeyInfo[] }
    | void
  >;
  onRevokeSiteKey?: (
    keyId: string,
  ) => Promise<{ siteKeys: SpaceSiteKeyInfo[] } | void>;
  onCoverUpload?: (
    file: File,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCoverRemove?: () => Promise<{ ok: true } | { ok: false; error: string }>;
  onDelete?: () => void;
};

/**
 * Publish settings for Spaces (Support, Knowledge Base, Websites).
 * Intended for the right properties rail — open only from Settings.
 */
export function SpaceSettingsSidePanel({
  space,
  initialSettings = DEFAULT_SUPPORT_SPACE_SETTINGS,
  initialSeo = DEFAULT_SPACE_SEO_SETTINGS,
  initialSeoEntity = DEFAULT_SPACE_SEO_ENTITY,
  coverSrc = null,
  onClose,
  onSave,
  onSeoChange,
  onSeoEntityChange,
  onCreateSiteKey,
  onRevokeSiteKey,
  onCoverUpload,
  onCoverRemove,
  onDelete,
}: SpaceSettingsSidePanelProps) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const seoDraftRef = useRef<SpaceSeoSettings>({
    publishSlug: spaceSlugLeaf(initialSeo.publishSlug),
    seoTitle: initialSeo.seoTitle,
    seoDescription: initialSeo.seoDescription,
  });
  const seoEntityDraftRef = useRef<SpaceSeoEntitySettings>(
    spaceSeoEntityFromPayload(initialSeoEntity),
  );
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("seo");
  const [publicBaseUrl, setPublicBaseUrl] = useState(
    initialSettings.publicBaseUrl,
  );
  const [allowedDomains, setAllowedDomains] = useState(
    initialSettings.allowedDomains,
  );
  const [siteKeys, setSiteKeys] = useState<SpaceSiteKeyInfo[]>(
    initialSettings.siteKeys,
  );
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [revealedSiteKey, setRevealedSiteKey] = useState<string | null>(null);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);
  const [publishSlug, setPublishSlug] = useState(
    spaceSlugLeaf(initialSeo.publishSlug),
  );
  const [seoTitle, setSeoTitle] = useState(initialSeo.seoTitle);
  const [seoDescription, setSeoDescription] = useState(
    initialSeo.seoDescription,
  );
  const [seoEntity, setSeoEntity] = useState<SpaceSeoEntitySettings>(() =>
    spaceSeoEntityFromPayload(initialSeoEntity),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverDragOver, setCoverDragOver] = useState(false);
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);
  const [siteKeyCopied, setSiteKeyCopied] = useState(false);
  const siteKeyCopiedTimerRef = useRef<number | null>(null);
  const apiDraftRef = useRef({
    publicBaseUrl: initialSettings.publicBaseUrl,
    allowedDomains: initialSettings.allowedDomains,
  });

  // Reset tab + ephemeral key UI only when switching spaces.
  useEffect(() => {
    setSettingsTab("seo");
    setRevealedSiteKey(null);
    setRevealedKeyId(null);
    setRevokeKeyId(null);
    setSiteKeyCopied(false);
    setNewKeyLabel("");
    setError(null);
    setCoverDragOver(false);
  }, [space.id]);

  useEffect(() => {
    return () => {
      if (siteKeyCopiedTimerRef.current != null) {
        window.clearTimeout(siteKeyCopiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPublicBaseUrl(initialSettings.publicBaseUrl);
    setAllowedDomains(initialSettings.allowedDomains);
    setSiteKeys(initialSettings.siteKeys);
    apiDraftRef.current = {
      publicBaseUrl: initialSettings.publicBaseUrl,
      allowedDomains: initialSettings.allowedDomains,
    };
  }, [initialSettings, space.id]);

  useEffect(() => {
    const next = {
      publishSlug: spaceSlugLeaf(initialSeo.publishSlug),
      seoTitle: initialSeo.seoTitle,
      seoDescription: initialSeo.seoDescription,
    };
    seoDraftRef.current = next;
    setPublishSlug(next.publishSlug);
    setSeoTitle(next.seoTitle);
    setSeoDescription(next.seoDescription);
  }, [
    initialSeo.publishSlug,
    initialSeo.seoTitle,
    initialSeo.seoDescription,
    space.id,
  ]);

  useEffect(() => {
    const next = spaceSeoEntityFromPayload(initialSeoEntity);
    seoEntityDraftRef.current = next;
    setSeoEntity(next);
  }, [initialSeoEntity, space.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (revokeKeyId) {
        event.preventDefault();
        setRevokeKeyId(null);
        return;
      }
      event.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, revokeKeyId]);

  async function uploadCoverFile(file: File) {
    if (!onCoverUpload) return;
    if (!isCoverImageFile(file)) {
      setError("Cover must be a JPG, PNG, WebP, or GIF.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onCoverUpload(file);
      if (!result.ok) setError(result.error);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not upload cover.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeCover() {
    if (!onCoverRemove) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onCoverRemove();
      if (!result.ok) setError(result.error);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove cover.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleCoverDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy || !onCoverUpload) return;
    setCoverDragOver(true);
  }

  function handleCoverDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy || !onCoverUpload) return;
    event.dataTransfer.dropEffect = "copy";
    setCoverDragOver(true);
  }

  function handleCoverDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setCoverDragOver(false);
  }

  function handleCoverDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setCoverDragOver(false);
    if (busy || !onCoverUpload) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void uploadCoverFile(file);
  }

  function commitSeo(
    patch?: Partial<SpaceSeoSettings>,
  ) {
    if (!onSeoChange) return;
    const draft = { ...seoDraftRef.current, ...patch };
    const next: SpaceSeoSettings = {
      publishSlug: spaceSlugLeaf(draft.publishSlug),
      seoTitle: draft.seoTitle.trim(),
      seoDescription: draft.seoDescription.trim(),
    };
    seoDraftRef.current = next;
    setPublishSlug(next.publishSlug);
    setSeoTitle(next.seoTitle);
    setSeoDescription(next.seoDescription);
    void Promise.resolve(onSeoChange(next)).catch((err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Could not update SEO fields.",
      );
    });
  }

  function commitSeoEntity(next: SpaceSeoEntitySettings) {
    const normalized = spaceSeoEntityFromPayload(
      spaceSeoEntityToPayload(next),
    );
    seoEntityDraftRef.current = normalized;
    setSeoEntity(normalized);
    if (!onSeoEntityChange) return;
    void Promise.resolve(onSeoEntityChange(normalized)).catch(
      (err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Could not update organization SEO fields.",
        );
      },
    );
  }

  function patchSeoEntity(patch: {
    siteName?: string;
    organizationName?: string;
    phone?: string;
    email?: string;
    address?: Partial<SpaceSeoEntitySettings["address"]>;
    social?: Partial<SpaceSeoEntitySettings["social"]>;
  }) {
    const draft: SpaceSeoEntitySettings = {
      ...seoEntityDraftRef.current,
      ...patch,
      address: {
        ...seoEntityDraftRef.current.address,
        ...(patch.address ?? {}),
      },
      social: {
        ...seoEntityDraftRef.current.social,
        ...(patch.social ?? {}),
      },
    };
    seoEntityDraftRef.current = draft;
    setSeoEntity(draft);
  }

  function commitApi(
    patch?: Partial<Pick<SupportSpaceSettings, "publicBaseUrl" | "allowedDomains">>,
  ) {
    if (!onSave) return;
    const draft = { ...apiDraftRef.current, ...patch };
    const next: SupportSpaceSettings = {
      publicBaseUrl: draft.publicBaseUrl.trim(),
      allowedDomains: draft.allowedDomains.trim(),
      siteKeys,
    };
    apiDraftRef.current = {
      publicBaseUrl: next.publicBaseUrl,
      allowedDomains: next.allowedDomains,
    };
    setPublicBaseUrl(next.publicBaseUrl);
    setAllowedDomains(next.allowedDomains);
    void Promise.resolve(onSave(next)).catch((err: unknown) => {
      setError(
        err instanceof Error ? err.message : "Could not update API settings.",
      );
    });
  }

  async function handleCreateKey() {
    const label = newKeyLabel.trim();
    if (!label) {
      setError("Enter a label for this site key.");
      return;
    }
    if (!onCreateSiteKey) {
      return;
    }
    setBusy(true);
    setError(null);
    setRevokeKeyId(null);
    setSiteKeyCopied(false);
    try {
      const result = await onCreateSiteKey(label);
      if (result) {
        setSiteKeys(result.siteKeys);
        setRevealedSiteKey(result.siteKey);
        setRevealedKeyId(result.key.id);
        setNewKeyLabel("");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create site key.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copySiteKeyToClipboard(value: string) {
    const text = value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setSiteKeyCopied(true);
      if (siteKeyCopiedTimerRef.current != null) {
        window.clearTimeout(siteKeyCopiedTimerRef.current);
      }
      siteKeyCopiedTimerRef.current = window.setTimeout(() => {
        setSiteKeyCopied(false);
        siteKeyCopiedTimerRef.current = null;
      }, 2000);
    } catch {
      setSiteKeyCopied(false);
      setError("Could not copy site key to the clipboard.");
    }
  }

  async function handleRevokeKey(keyId: string) {
    if (revokeKeyId !== keyId) {
      setRevokeKeyId(keyId);
      return;
    }
    if (!onRevokeSiteKey) {
      setSiteKeys((current) => current.filter((key) => key.id !== keyId));
      if (revealedKeyId === keyId) {
        setRevealedSiteKey(null);
        setRevealedKeyId(null);
        setSiteKeyCopied(false);
      }
      setRevokeKeyId(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onRevokeSiteKey(keyId);
      if (result) {
        setSiteKeys(result.siteKeys);
      } else {
        setSiteKeys((current) => current.filter((key) => key.id !== keyId));
      }
      if (revealedKeyId === keyId) {
        setRevealedSiteKey(null);
        setRevealedKeyId(null);
        setSiteKeyCopied(false);
      }
      setRevokeKeyId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not revoke site key.",
      );
      setRevokeKeyId(null);
    } finally {
      setBusy(false);
    }
  }

  const canEditSeo = Boolean(onSeoChange) && !busy;
  const canEditSeoEntity = Boolean(onSeoEntityChange) && !busy;

  return (
    <div
      className="space-settings-side-panel"
      role="complementary"
      aria-label={`${space.title} settings`}
    >
      <ContentSidePanelHeader
        title={`${space.title} settings`}
        className="space-settings-side-panel__header"
        actions={
          <button
            type="button"
            className="app-side-panel-section-action"
            aria-label="Close settings"
            onClick={onClose}
          >
            <XIcon size={16} />
          </button>
        }
      />
      <div className="space-settings-side-panel__body">
        <div
          className={[
            "space-settings-side-panel__cover-zone",
            coverSrc ? "space-settings-side-panel__cover-zone--filled" : null,
            coverDragOver
              ? "space-settings-side-panel__cover-zone--dragging"
              : null,
            busy ? "space-settings-side-panel__cover-zone--busy" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          role={onCoverUpload ? "button" : undefined}
          tabIndex={onCoverUpload && !busy ? 0 : undefined}
          aria-label={
            coverSrc
              ? `Replace cover for ${space.title}`
              : `Add cover image for ${space.title}`
          }
          onClick={() => {
            if (busy || !onCoverUpload) return;
            coverInputRef.current?.click();
          }}
          onKeyDown={(event) => {
            if (!onCoverUpload || busy) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            coverInputRef.current?.click();
          }}
          onDragEnter={handleCoverDragEnter}
          onDragOver={handleCoverDragOver}
          onDragLeave={handleCoverDragLeave}
          onDrop={handleCoverDrop}
        >
          <input
            ref={coverInputRef}
            type="file"
            accept={COVER_ACCEPT}
            className="space-settings-side-panel__cover-input"
            tabIndex={-1}
            disabled={busy || !onCoverUpload}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void uploadCoverFile(file);
            }}
          />
          {coverSrc ? (
            <img
              alt=""
              className="space-settings-side-panel__cover-image"
              src={coverSrc}
            />
          ) : (
            <span className="space-settings-side-panel__cover-empty">
              <span className="space-settings-side-panel__cover-empty-title">
                {busy
                  ? "Uploading…"
                  : coverDragOver
                    ? "Drop cover image"
                    : "Cover image"}
              </span>
              {!busy ? (
                <span className="space-settings-side-panel__cover-empty-hint">
                  {coverDragOver
                    ? "Release to upload"
                    : "Drop or click to upload"}
                </span>
              ) : null}
            </span>
          )}
          {coverSrc && !busy ? (
            <span className="space-settings-side-panel__cover-hint">
              {coverDragOver ? "Drop to replace" : "Click or drop to replace"}
            </span>
          ) : null}
          {coverSrc && onCoverRemove ? (
            <button
              type="button"
              className="space-settings-side-panel__cover-clear"
              disabled={busy}
              aria-label={`Remove cover for ${space.title}`}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                event.stopPropagation();
                void removeCover();
              }}
            >
              <XIcon size={12} />
            </button>
          ) : null}
        </div>

        {onDelete ? (
          <div className="space-settings-side-panel__danger">
            <button
              type="button"
              className="space-settings-side-panel__delete"
              disabled={busy}
              onClick={() => onDelete()}
            >
              Delete space
            </button>
          </div>
        ) : null}

        <div className="contact-section-tabs space-settings-side-panel__tabs">
          <PillNav
            className="contact-section-tabs__nav"
            ariaLabel="Settings sections"
            items={SETTINGS_TABS}
            value={settingsTab}
            onChange={(next) => {
              setRevokeKeyId(null);
              setSettingsTab(next);
            }}
          />
        </div>

        {settingsTab === "seo" ? (
          <div className="space-settings-side-panel__tab-body">
            <section className="space-settings-side-panel__section space-settings-side-panel__section--flush">
              <h3 className="space-settings-side-panel__section-title">Page</h3>
              <div className="help-article-seo-fields space-settings-side-panel__seo-fields">
                <HelpArticleSeoField
                  label="Domain"
                  value={publishSlug}
                  prefix="https://"
                  openLinkHref={spaceSlugOpenHref(publishSlug)}
                  disabled={!canEditSeo}
                  placeholder="example.com/docs"
                  singleLine
                  onChange={(next) => {
                    const leaf = spaceSlugLeaf(next);
                    setPublishSlug(leaf);
                    seoDraftRef.current = {
                      ...seoDraftRef.current,
                      publishSlug: leaf,
                    };
                  }}
                  onBlur={(next) => commitSeo({ publishSlug: next })}
                />
                <HelpArticleSeoField
                  label="Title"
                  value={seoTitle}
                  disabled={!canEditSeo}
                  placeholder="SEO title"
                  singleLine
                  onChange={(next) => {
                    setSeoTitle(next);
                    seoDraftRef.current = {
                      ...seoDraftRef.current,
                      seoTitle: next,
                    };
                  }}
                  onBlur={(next) => commitSeo({ seoTitle: next })}
                />
                <HelpArticleSeoField
                  label="Description"
                  value={seoDescription}
                  disabled={!canEditSeo}
                  placeholder="Meta description"
                  onChange={(next) => {
                    setSeoDescription(next);
                    seoDraftRef.current = {
                      ...seoDraftRef.current,
                      seoDescription: next,
                    };
                  }}
                  onBlur={(next) => commitSeo({ seoDescription: next })}
                />
              </div>
            </section>

            <section className="space-settings-side-panel__section">
              <h3 className="space-settings-side-panel__section-title">
                Open Graph
              </h3>
              <p className="space-settings-side-panel__hint">
                Site name for social share cards. Title, description, and cover
                image are used from Page and the cover above.
              </p>
              <label className="space-settings-side-panel__field">
                <span className="space-settings-side-panel__label">
                  Site name
                </span>
                <input
                  type="text"
                  className="space-settings-side-panel__input"
                  placeholder="Acme Help Center"
                  disabled={!canEditSeoEntity}
                  value={seoEntity.siteName}
                  onChange={(event) =>
                    patchSeoEntity({ siteName: event.target.value })
                  }
                  onBlur={() => commitSeoEntity(seoEntityDraftRef.current)}
                />
              </label>
            </section>

            <section className="space-settings-side-panel__section">
              <h3 className="space-settings-side-panel__section-title">
                Organization
              </h3>
              <p className="space-settings-side-panel__hint">
                Used for Schema.org Organization / LocalBusiness JSON-LD.
              </p>
              <label className="space-settings-side-panel__field">
                <span className="space-settings-side-panel__label">Name</span>
                <input
                  type="text"
                  className="space-settings-side-panel__input"
                  placeholder="Acme Inc."
                  disabled={!canEditSeoEntity}
                  value={seoEntity.organizationName}
                  onChange={(event) =>
                    patchSeoEntity({ organizationName: event.target.value })
                  }
                  onBlur={() => commitSeoEntity(seoEntityDraftRef.current)}
                />
              </label>
              <label className="space-settings-side-panel__field">
                <span className="space-settings-side-panel__label">Phone</span>
                <input
                  type="tel"
                  className="space-settings-side-panel__input"
                  placeholder="+31 20 123 4567"
                  disabled={!canEditSeoEntity}
                  value={seoEntity.phone}
                  onChange={(event) =>
                    patchSeoEntity({ phone: event.target.value })
                  }
                  onBlur={() => commitSeoEntity(seoEntityDraftRef.current)}
                />
              </label>
              <label className="space-settings-side-panel__field">
                <span className="space-settings-side-panel__label">Email</span>
                <input
                  type="email"
                  className="space-settings-side-panel__input"
                  placeholder="hello@example.com"
                  disabled={!canEditSeoEntity}
                  value={seoEntity.email}
                  onChange={(event) =>
                    patchSeoEntity({ email: event.target.value })
                  }
                  onBlur={() => commitSeoEntity(seoEntityDraftRef.current)}
                />
              </label>
            </section>

            <section className="space-settings-side-panel__section">
              <h3 className="space-settings-side-panel__section-title">
                Address
              </h3>
              <EntityAddressFields
                idPrefix={`space-seo-${space.id}`}
                className="space-settings-side-panel__address"
                disabled={!canEditSeoEntity}
                value={{
                  address: seoEntity.address.streetAddress,
                  city: seoEntity.address.addressLocality,
                  postalCode: seoEntity.address.postalCode,
                  country: seoEntity.address.addressCountry,
                  region: seoEntity.address.addressRegion,
                }}
                onChange={(next) =>
                  patchSeoEntity({
                    address: {
                      streetAddress: next.address,
                      addressLocality: next.city,
                      postalCode: next.postalCode,
                      addressCountry: next.country,
                      addressRegion: next.region,
                    },
                  })
                }
                onCommit={(next) => {
                  const address = {
                    streetAddress: next.address,
                    addressLocality: next.city,
                    postalCode: next.postalCode,
                    addressCountry: next.country,
                    addressRegion: next.region,
                  };
                  const draft = {
                    ...seoEntityDraftRef.current,
                    address: {
                      ...seoEntityDraftRef.current.address,
                      ...address,
                    },
                  };
                  seoEntityDraftRef.current = draft;
                  setSeoEntity(draft);
                  commitSeoEntity(draft);
                }}
              />
            </section>

            <section className="space-settings-side-panel__section">
              <h3 className="space-settings-side-panel__section-title">
                Social profiles
              </h3>
              <p className="space-settings-side-panel__hint">
                Profile URLs become Schema.org sameAs links.
              </p>
              <div className="help-article-seo-fields space-settings-side-panel__seo-fields">
                {SPACE_SEO_SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
                  <HelpArticleSeoField
                    key={key}
                    label={label}
                    value={seoEntity.social[key]}
                    prefix={SPACE_SEO_SOCIAL_PREFIXES[key]}
                    openLinkHref={spaceSeoSocialHref(
                      key,
                      seoEntity.social[key],
                    )}
                    disabled={!canEditSeoEntity}
                    placeholder={placeholder}
                    singleLine
                    onChange={(next) =>
                      patchSeoEntity({
                        social: { [key]: spaceSeoSocialLeaf(key, next) },
                      })
                    }
                    onBlur={(next) => {
                      patchSeoEntity({
                        social: { [key]: spaceSeoSocialLeaf(key, next) },
                      });
                      commitSeoEntity(seoEntityDraftRef.current);
                    }}
                  />
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-settings-side-panel__tab-body">
            <section className="space-settings-side-panel__section space-settings-side-panel__section--flush">
              <h3 className="space-settings-side-panel__section-title">Site</h3>
              <label className="space-settings-side-panel__field">
                <span className="space-settings-side-panel__label">
                  Public base URL
                </span>
                <input
                  type="url"
                  className="space-settings-side-panel__input"
                  placeholder="https://portal.example.com/app/help"
                  value={publicBaseUrl}
                  onChange={(event) => {
                    const next = event.target.value;
                    setPublicBaseUrl(next);
                    apiDraftRef.current = {
                      ...apiDraftRef.current,
                      publicBaseUrl: next,
                    };
                  }}
                  onBlur={() =>
                    commitApi({ publicBaseUrl: apiDraftRef.current.publicBaseUrl })
                  }
                />
              </label>
              <label className="space-settings-side-panel__field">
                <span className="space-settings-side-panel__label">
                  Allowed domains
                </span>
                <textarea
                  className="space-settings-side-panel__input space-settings-side-panel__input--textarea"
                  rows={3}
                  placeholder={"portal.example.com\nlocalhost:3000"}
                  value={allowedDomains}
                  onChange={(event) => {
                    const next = event.target.value;
                    setAllowedDomains(next);
                    apiDraftRef.current = {
                      ...apiDraftRef.current,
                      allowedDomains: next,
                    };
                  }}
                  onBlur={() =>
                    commitApi({
                      allowedDomains: apiDraftRef.current.allowedDomains,
                    })
                  }
                />
                <span className="space-settings-side-panel__hint">
                  One host per line. Requests from other origins are rejected.
                </span>
              </label>
            </section>

            <section className="space-settings-side-panel__section">
              <h3 className="space-settings-side-panel__section-title">
                API access
              </h3>
              <p className="space-settings-side-panel__hint">
                Site keys are server-side only. The portal BFF should hold the
                key — never ship it to the browser. Allowed domains apply to
                every key on this space.
              </p>
              <div className="space-settings-side-panel__key-create">
                <HelpArticleSeoField
                  label="Label"
                  value={newKeyLabel}
                  placeholder="Portal production"
                  singleLine
                  disabled={busy || !onCreateSiteKey}
                  onChange={(next) => {
                    setNewKeyLabel(next.slice(0, 80));
                    if (error) setError(null);
                  }}
                  onBlur={(next) => {
                    setNewKeyLabel(next.trim().slice(0, 80));
                  }}
                />
                <button
                  type="button"
                  className="entity-delete-modal-cancel space-settings-side-panel__key-create-action"
                  disabled={busy || !onCreateSiteKey || !newKeyLabel.trim()}
                  onClick={() => void handleCreateKey()}
                >
                  Generate
                </button>
              </div>
              {siteKeys.length === 0 ? (
                <p className="space-settings-side-panel__hint">
                  No site keys yet.
                </p>
              ) : (
                <ul className="space-settings-side-panel__key-list">
                  {siteKeys.map((key) => {
                    const isRevealed =
                      revealedKeyId === key.id && Boolean(revealedSiteKey);
                    const confirmRevoke = revokeKeyId === key.id;
                    return (
                      <li
                        key={key.id}
                        className="space-settings-side-panel__key-item"
                      >
                        <div
                          className={[
                            "help-article-seo-field",
                            "help-article-seo-field--single",
                            "space-settings-side-panel__key-field",
                            isRevealed
                              ? "space-settings-side-panel__key-field--revealed"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <span
                            className="help-article-seo-field__label"
                            aria-hidden="true"
                          >
                            {key.label}
                          </span>
                          <div className="help-article-seo-field__body">
                            {isRevealed && revealedSiteKey ? (
                              <button
                                type="button"
                                className={[
                                  "space-settings-side-panel__key-badge",
                                  siteKeyCopied
                                    ? "space-settings-side-panel__key-badge--copied"
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                aria-label={
                                  siteKeyCopied
                                    ? "Site key copied"
                                    : "Copy site key"
                                }
                                title={
                                  siteKeyCopied ? "Copied" : "Copy site key"
                                }
                                onClick={() => {
                                  void copySiteKeyToClipboard(revealedSiteKey);
                                }}
                              >
                                <span className="space-settings-side-panel__key-badge-value">
                                  {revealedSiteKey}
                                </span>
                                <span
                                  className="space-settings-side-panel__key-badge-icon"
                                  aria-hidden="true"
                                >
                                  {siteKeyCopied ? (
                                    <CheckIcon size={14} />
                                  ) : (
                                    <CopyIcon size={14} />
                                  )}
                                </span>
                              </button>
                            ) : (
                              <div
                                className="space-settings-side-panel__key-badge space-settings-side-panel__key-badge--masked"
                                aria-label={`Site key ${formatMaskedSiteKey(key.siteKeyPrefix)}`}
                                title="Full key is only shown once when generated"
                              >
                                <span className="space-settings-side-panel__key-badge-value">
                                  {formatMaskedSiteKey(key.siteKeyPrefix)}
                                </span>
                              </div>
                            )}
                            <button
                              type="button"
                              className="entity-delete-modal-confirm space-settings-side-panel__key-delete"
                              disabled={busy}
                              onClick={() => void handleRevokeKey(key.id)}
                              onBlur={() => {
                                if (revokeKeyId === key.id) {
                                  setRevokeKeyId(null);
                                }
                              }}
                            >
                              {confirmRevoke ? "Confirm" : "Delete"}
                            </button>
                          </div>
                        </div>
                        {isRevealed ? (
                          <span className="space-settings-side-panel__hint">
                            Copy this key now — it won’t be shown again
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

        {error ? (
          <p className="space-settings-side-panel__hint" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated Prefer {@link SpaceSettingsSidePanelProps}. */
export type SupportSpaceSettingsModalProps = SpaceSettingsSidePanelProps & {
  open?: boolean;
};

/** @deprecated Prefer {@link SpaceSettingsSidePanel}. */
export function SupportSpaceSettingsModal(
  props: SupportSpaceSettingsModalProps,
) {
  if (props.open === false) return null;
  return <SpaceSettingsSidePanel {...props} />;
}

export type SpaceSettingsStubPanelProps = {
  space: SpaceOverviewCardItem;
  onClose: () => void;
};

/** Thin settings stub for categories without publish settings yet. */
export function SpaceSettingsStubPanel({
  space,
  onClose,
}: SpaceSettingsStubPanelProps) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="space-settings-side-panel"
      role="complementary"
      aria-labelledby={titleId}
    >
      <ContentSidePanelHeader
        title={`${space.title} settings`}
        actions={
          <button
            type="button"
            className="app-side-panel-section-action"
            aria-label="Close settings"
            onClick={onClose}
          >
            <XIcon size={16} />
          </button>
        }
      />
      <div className="space-settings-side-panel__body">
        <p id={titleId} className="space-settings-side-panel__hint">
          Space settings for this category are coming soon.
        </p>
        <div className="space-settings-side-panel__actions">
          <button
            type="button"
            className="entity-delete-modal-cancel"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Prefer {@link SpaceSettingsStubPanel}. */
export type SpaceSettingsStubModalProps = SpaceSettingsStubPanelProps & {
  open?: boolean;
};

/** @deprecated Prefer {@link SpaceSettingsStubPanel}. */
export function SpaceSettingsStubModal(props: SpaceSettingsStubModalProps) {
  if (props.open === false) return null;
  return <SpaceSettingsStubPanel {...props} />;
}
