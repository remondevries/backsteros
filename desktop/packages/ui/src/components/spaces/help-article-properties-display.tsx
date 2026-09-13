"use client";

import { useEffect, useRef, useState } from "react";

import { EntityPropertiesSection } from "../entity/entity-properties-section.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import {
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { DocumentOcticon } from "../documents/document-octicon.js";
import { TaskRelatedChips } from "../tasks/task-related-chips.js";
import { HelpArticleSeoField } from "./help-article-seo-field.js";
import { getCreateEntityFromQueryLabel } from "../../dropdowns/searchable-dropdown-create-from-query.js";
import {
  composeHelpArticleSlug,
  getHelpArticleStatusLabel,
  HELP_ARTICLE_AUDIENCE_INDIVIDUAL,
  HELP_ARTICLE_STATUS_DEFAULT,
  HELP_ARTICLE_STATUS_ORDER,
  helpArticleSlugLeaf,
  type HelpArticleProperties,
  type HelpArticleSeoDetails,
  type HelpArticleStatus,
} from "../../spaces/help-article-properties.js";

function HelpArticlePublishedIcon() {
  return (
    <>
      <path d="M10.75 12a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0" />
      <path d="M1.943 10.153C3.458 8.074 6.918 4.25 12 4.25s8.542 3.824 10.057 5.903l.023.031c.258.355.468.643.598 1.142.055.212.072.464.072.674s-.017.462-.072.674c-.13.5-.34.787-.598 1.142l-.023.031C20.542 15.926 17.082 19.75 12 19.75s-8.542-3.824-10.057-5.903l-.023-.031c-.258-.355-.468-.643-.598-1.142A2.8 2.8 0 0 1 1.25 12c0-.21.017-.462.072-.674.13-.5.34-.787.598-1.142zM9.25 12a2.75 2.75 0 1 0 5.5 0 2.75 2.75 0 0 0-5.5 0m1.5 0a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0" />
    </>
  );
}

function HelpArticleOfflineIcon() {
  return (
    <path d="M21.53 2.47a.75.75 0 0 0-1.06 0l-3.227 3.227C15.762 4.847 14.007 4.25 12 4.25c-5.082 0-8.542 3.824-10.057 5.903l-.023.031c-.258.355-.468.643-.598 1.142A2.8 2.8 0 0 0 1.25 12c0 .21.017.462.072.674.13.5.34.787.598 1.142l.023.031c.734 1.007 1.924 2.423 3.533 3.616L2.47 20.47a.75.75 0 1 0 1.06 1.06l3.227-3.227c1.481.85 3.236 1.447 5.243 1.447 5.082 0 8.542-3.824 10.057-5.903l.023-.031c.258-.355.468-.643.598-1.142A2.8 2.8 0 0 0 22.75 12c0-.21-.017-.462-.072-.674-.13-.5-.34-.787-.598-1.142l-.023-.031c-.734-1.007-1.924-2.423-3.533-3.616L21.53 3.53a.75.75 0 0 0 0-1.06m-8.19 7.128-3.742 3.743a2.75 2.75 0 0 1 3.742-3.742M14.75 12a2.75 2.75 0 0 1-4.09 2.402l3.742-3.743c.222.397.348.854.348 1.341" />
  );
}

function HelpArticleStatusIcon({
  status,
  size = 14,
}: {
  status: HelpArticleStatus;
  size?: number;
}) {
  if (status === "concept") {
    return (
      <span
        className="help-article-status-dot help-article-status-dot--concept"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <svg
      className={`help-article-status-icon help-article-status-icon--${status}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
    >
      {status === "published" ? <HelpArticlePublishedIcon /> : null}
      {status === "offline" ? <HelpArticleOfflineIcon /> : null}
    </svg>
  );
}

export type HelpArticlePropertiesDisplayProps = {
  article: HelpArticleProperties | null;
  onStatusChange?: (status: HelpArticleStatus) => void;
  onContactIdsChange?: (contactIds: string[]) => void;
  onFolderChange?: (folderId: string | null) => void;
  /** Create a folder from the Folder dropdown search query (no matches). */
  onCreateFolderFromQuery?: (query: string) => void;
  onPlacementChange?: (placementFolderId: string | null) => void;
  onSeoDetailsChange?: (details: HelpArticleSeoDetails) => void;
  /**
   * When false, hide the Details (SEO / slug) card. Shown only when the space
   * has an active site key for publishing.
   */
  showSeoDetails?: boolean;
  /** Folder path prefix shown before the editable slug leaf (e.g. `email-setup/`). */
  slugPrefix?: string;
  folderId?: string | null;
  folderOptions?: SearchableDropdownOption<string>[];
  contactOptions?: SearchableDropdownOption<string>[];
  placementOptions?: SearchableDropdownOption<string>[];
};

/**
 * Publishable page properties rail — task/letter pattern.
 * Support: Audience lives on the side-panel Group / Individual toggle.
 * Details (SEO / slug) is shown only when the space has an active site key.
 * Status applies to both audiences; Folder is Group-only (and always shown for
 * KB / Websites); Contacts + Appears in are Individual-only (Support).
 */
export function HelpArticlePropertiesDisplay({
  article,
  onStatusChange,
  onContactIdsChange,
  onFolderChange,
  onCreateFolderFromQuery,
  onPlacementChange,
  onSeoDetailsChange,
  showSeoDetails = false,
  slugPrefix = "",
  folderId = null,
  folderOptions = [],
  contactOptions = [],
  placementOptions = [],
}: HelpArticlePropertiesDisplayProps) {
  const disabled = article == null;
  const showIndividualFields =
    article?.audience === HELP_ARTICLE_AUDIENCE_INDIVIDUAL;
  const showFolderField = !showIndividualFields;
  const status = article?.status ?? HELP_ARTICLE_STATUS_DEFAULT;
  const prefix = slugPrefix.trim();

  const [seoTitle, setSeoTitle] = useState(article?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(
    article?.seoDescription ?? "",
  );
  const [slugLeaf, setSlugLeaf] = useState(
    helpArticleSlugLeaf(article?.slug ?? "", prefix),
  );
  const seoDraftRef = useRef({
    seoTitle: article?.seoTitle ?? "",
    seoDescription: article?.seoDescription ?? "",
    slugLeaf: helpArticleSlugLeaf(article?.slug ?? "", prefix),
  });

  useEffect(() => {
    const nextLeaf = helpArticleSlugLeaf(article?.slug ?? "", prefix);
    const next = {
      seoTitle: article?.seoTitle ?? "",
      seoDescription: article?.seoDescription ?? "",
      slugLeaf: nextLeaf,
    };
    setSeoTitle(next.seoTitle);
    setSeoDescription(next.seoDescription);
    setSlugLeaf(next.slugLeaf);
    seoDraftRef.current = next;
  }, [
    article?.id,
    article?.seoTitle,
    article?.seoDescription,
    article?.slug,
    prefix,
  ]);

  function updateSeoTitle(next: string) {
    setSeoTitle(next);
    seoDraftRef.current = { ...seoDraftRef.current, seoTitle: next };
  }

  function updateSeoDescription(next: string) {
    setSeoDescription(next);
    seoDraftRef.current = { ...seoDraftRef.current, seoDescription: next };
  }

  function updateSlugLeaf(next: string) {
    setSlugLeaf(next);
    seoDraftRef.current = { ...seoDraftRef.current, slugLeaf: next };
  }

  const statusOptions: SearchableDropdownOption<HelpArticleStatus>[] =
    HELP_ARTICLE_STATUS_ORDER.map((value) => ({
      value,
      label: getHelpArticleStatusLabel(value),
      searchTerms: value,
      icon: <HelpArticleStatusIcon status={value} size={14} />,
    }));

  const contactSelectOptions = contactOptions.filter(
    (option) => option.value !== DROPDOWN_NONE_VALUE,
  );
  const contactIds = article?.contactIds ?? [];
  const canEditFolder =
    showFolderField &&
    Boolean(onFolderChange) &&
    (folderOptions.length > 0 || Boolean(onCreateFolderFromQuery));
  const canEditPlacement =
    Boolean(onPlacementChange) && placementOptions.length > 0;
  const canEditSeo = Boolean(onSeoDetailsChange) && !disabled;
  const selectedFolder =
    folderOptions.find((option) => option.value === folderId) ?? null;

  function commitSeoDetails(
    patch?: Partial<{
      seoTitle: string;
      seoDescription: string;
      slugLeaf: string;
    }>,
  ) {
    if (!onSeoDetailsChange) return;
    const draft = { ...seoDraftRef.current, ...patch };
    const nextSlug = composeHelpArticleSlug(prefix, draft.slugLeaf);
    const nextLeaf = helpArticleSlugLeaf(nextSlug, prefix);
    const next = {
      seoTitle: draft.seoTitle.trim(),
      seoDescription: draft.seoDescription.trim(),
      slug: nextSlug,
    };
    seoDraftRef.current = {
      seoTitle: next.seoTitle,
      seoDescription: next.seoDescription,
      slugLeaf: nextLeaf,
    };
    setSeoTitle(next.seoTitle);
    setSeoDescription(next.seoDescription);
    setSlugLeaf(nextLeaf);
    onSeoDetailsChange(next);
  }

  return (
    <div className="task-detail-properties-scroll">
      <div className="entity-properties-stack">
        {showSeoDetails ? (
          <EntityPropertiesSection title="Details">
            <div className="help-article-seo-fields">
              <HelpArticleSeoField
                label="Slug"
                value={slugLeaf}
                prefix={prefix || undefined}
                openLinkHref={null}
                disabled={!canEditSeo}
                placeholder="url-slug"
                singleLine
                onChange={updateSlugLeaf}
                onBlur={(nextLeaf) => commitSeoDetails({ slugLeaf: nextLeaf })}
              />
              <HelpArticleSeoField
                label="Title"
                value={seoTitle}
                disabled={!canEditSeo}
                placeholder="SEO title"
                singleLine
                onChange={updateSeoTitle}
                onBlur={(nextTitle) => commitSeoDetails({ seoTitle: nextTitle })}
              />
              <HelpArticleSeoField
                label="Description"
                value={seoDescription}
                disabled={!canEditSeo}
                placeholder="Meta description"
                onChange={updateSeoDescription}
                onBlur={(nextDescription) =>
                  commitSeoDetails({ seoDescription: nextDescription })
                }
              />
            </div>
          </EntityPropertiesSection>
        ) : null}

        <EntityPropertiesSection title="Properties">
          <PropertyFieldGroup label="Status">
            <PropertyDropdown
              value={status}
              options={statusOptions}
              onChange={(next) => onStatusChange?.(next)}
              disabled={disabled || !onStatusChange}
              searchPlaceholder="Change status…"
              searchShortcutLabel="S"
              ariaLabel="Status"
              fallbackIcon={<HelpArticleStatusIcon status={status} size={14} />}
              fallbackLabel={getHelpArticleStatusLabel(status)}
            />
          </PropertyFieldGroup>

          {showFolderField ? (
            <PropertyFieldGroup label="Folder">
              {canEditFolder ? (
                <PropertyDropdown
                  value={folderId ?? DROPDOWN_NONE_VALUE}
                  options={
                    folderOptions.length > 0
                      ? folderOptions
                      : [
                          {
                            value: DROPDOWN_NONE_VALUE,
                            label: "No folder",
                            searchTerms: "none root unassigned",
                          },
                        ]
                  }
                  onChange={(next) =>
                    onFolderChange?.(resolveDropdownNone(next))
                  }
                  disabled={disabled}
                  searchPlaceholder="Move to folder…"
                  searchShortcutLabel="F"
                  ariaLabel="Folder"
                  fallbackIcon={
                    <DocumentOcticon icon="file-directory" size={14} />
                  }
                  fallbackLabel="No folder"
                  mutedFallback
                  createFromQueryLabel={
                    onCreateFolderFromQuery
                      ? (query) =>
                          getCreateEntityFromQueryLabel("folder", query)
                      : undefined
                  }
                  onCreateFromQuery={onCreateFolderFromQuery}
                />
              ) : (
                <button
                  type="button"
                  className="property-dropdown-trigger"
                  disabled={disabled}
                  aria-label="Folder"
                >
                  <span
                    className="property-dropdown-trigger__icon"
                    aria-hidden="true"
                  >
                    <DocumentOcticon icon="file-directory" size={14} />
                  </span>
                  <span className="property-dropdown-trigger__label">
                    {selectedFolder?.label ?? "No folder"}
                  </span>
                </button>
              )}
            </PropertyFieldGroup>
          ) : null}

          {showIndividualFields ? (
            <>
              <PropertyFieldGroup label="Contacts">
                <div className="help-article-contact-chips">
                  <TaskRelatedChips
                    values={contactIds}
                    options={contactSelectOptions}
                    onChange={onContactIdsChange}
                    disabled={disabled}
                    emptyLabel="No contacts"
                    searchPlaceholder="Add contacts…"
                    searchShortcutLabel="C"
                    ariaLabel="Contacts"
                  />
                </div>
              </PropertyFieldGroup>

              <PropertyFieldGroup label="Appears in">
                {canEditPlacement ? (
                  <PropertyDropdown
                    value={article?.placementFolderId ?? DROPDOWN_NONE_VALUE}
                    options={placementOptions}
                    onChange={(next) =>
                      onPlacementChange?.(resolveDropdownNone(next))
                    }
                    disabled={disabled}
                    searchPlaceholder="Choose Group section…"
                    searchShortcutLabel="P"
                    ariaLabel="Appears in"
                    fallbackIcon={
                      <DocumentOcticon icon="file-directory" size={14} />
                    }
                    fallbackLabel="No section"
                    mutedFallback
                  />
                ) : (
                  <button
                    type="button"
                    className="property-dropdown-trigger"
                    disabled={disabled}
                    aria-label="Appears in"
                  >
                    <span
                      className="property-dropdown-trigger__icon"
                      aria-hidden="true"
                    >
                      <DocumentOcticon icon="file-directory" size={14} />
                    </span>
                    <span className="property-dropdown-trigger__label">
                      {article?.placementFolderTitle?.trim() || "No section"}
                    </span>
                  </button>
                )}
              </PropertyFieldGroup>
            </>
          ) : null}
        </EntityPropertiesSection>
      </div>
    </div>
  );
}
