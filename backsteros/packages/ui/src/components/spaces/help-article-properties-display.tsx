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
import { SpaceSectionIcon } from "../icons/space-section-icon.js";
import { TaskRelatedChips } from "../tasks/task-related-chips.js";
import { HelpArticleSeoField } from "./help-article-seo-field.js";
import { HelpArticleStatusIcon } from "./help-article-status-icon.js";
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
  /**
   * `all` — Details card + Properties card.
   * `fields` — Status/Folder/… rows for the document properties table.
   * `seo` — Details card only.
   */
  sections?: "all" | "fields" | "seo";
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
  sections = "all",
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
  const folderIcon = <SpaceSectionIcon size={14} />;
  const folderSelectOptions: SearchableDropdownOption<string>[] = (
    folderOptions.length > 0
      ? folderOptions
      : [
          {
            value: DROPDOWN_NONE_VALUE,
            label: "No folder",
            searchTerms: "none root unassigned",
          },
        ]
  ).map((option) =>
    option.icon != null ? option : { ...option, icon: folderIcon },
  );
  const canEditFolder =
    showFolderField &&
    Boolean(onFolderChange) &&
    (folderOptions.length > 0 || Boolean(onCreateFolderFromQuery));
  const canEditPlacement =
    Boolean(onPlacementChange) && placementOptions.length > 0;
  const canEditSeo = Boolean(onSeoDetailsChange) && !disabled;
  const selectedFolder =
    folderSelectOptions.find((option) => option.value === folderId) ?? null;

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

  const seoCard =
    showSeoDetails && sections !== "fields" ? (
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
    ) : null;

  const propertyFields = (
    <>
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
              options={folderSelectOptions}
              onChange={(next) => onFolderChange?.(resolveDropdownNone(next))}
              disabled={disabled}
              searchPlaceholder="Move to folder…"
              searchShortcutLabel="F"
              ariaLabel="Folder"
              fallbackIcon={folderIcon}
              fallbackLabel="No folder"
              mutedFallback
              createFromQueryLabel={
                onCreateFolderFromQuery
                  ? (query) => getCreateEntityFromQueryLabel("folder", query)
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
                {selectedFolder?.icon ?? folderIcon}
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
                fallbackIcon={<SpaceSectionIcon size={14} />}
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
                  <SpaceSectionIcon size={14} />
                </span>
                <span className="property-dropdown-trigger__label">
                  {article?.placementFolderTitle?.trim() || "No section"}
                </span>
              </button>
            )}
          </PropertyFieldGroup>
        </>
      ) : null}
    </>
  );

  if (sections === "fields") return propertyFields;
  if (sections === "seo") return seoCard;

  return (
    <div className="task-detail-properties-scroll">
      <div className="entity-properties-stack">
        {seoCard}
        <EntityPropertiesSection title="Properties">
          {propertyFields}
        </EntityPropertiesSection>
      </div>
    </div>
  );
}
