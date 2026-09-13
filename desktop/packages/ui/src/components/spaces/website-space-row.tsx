"use client";

import {
  useState,
  type CSSProperties,
  type MouseEvent,
  type SyntheticEvent,
} from "react";

import {
  keyboardNavItemProps,
  keyboardNavListItemClass,
} from "../../list-nav/keyboard-nav-item.js";
import type { GroupedListPointerItemBind } from "../../list-nav/use-grouped-list-pointer-reorder.js";
import { isDirectRoleButtonActivationKey } from "../../shortcuts/shortcut-guards.js";
import {
  resolveSpaceOverviewAccent,
  resolveSpaceOverviewIconKey,
} from "../../spaces/spaces-categories.js";
import { EntityIconPicker } from "../entity/entity-icon-picker.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { DocumentIcon } from "../documents/document-icon.js";
import { DocumentOcticon } from "../documents/document-octicon.js";
import { CogFourIcon } from "../icons/cog-four-icon.js";
import { getEntityIconColor } from "../projects/project-octicon.js";
import type { SpaceOverviewCardItem } from "./space-overview-card.js";

export type WebsiteSpaceRowProps = {
  item: SpaceOverviewCardItem;
  keyboardHighlighted?: boolean;
  onSelect?: (item: SpaceOverviewCardItem) => void;
  onIconChange?: (
    item: SpaceOverviewCardItem,
    icon: string | null,
  ) => void | Promise<void>;
  onTitleChange?: (
    item: SpaceOverviewCardItem,
    title: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onOpenSettings?: (item: SpaceOverviewCardItem) => void;
  pointerReorderBind?: GroupedListPointerItemBind | null;
  dragging?: boolean;
};

function formatArticleCount(count: number): string {
  return count === 1 ? "1 article" : `${count} articles`;
}

function stopFieldEvent(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function stopCardNavigate(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Guess a favicon host from space title/path (e.g. Lemo-Design → lemo-design.com).
 * Kept for callers that still want a site mark; rows now use the shared icon picker.
 */
export function websiteFaviconHost(item: SpaceOverviewCardItem): string {
  const fromDescription = item.description?.match(
    /https?:\/\/([^/\s]+)/i,
  )?.[1];
  if (fromDescription) return fromDescription.replace(/^www\./i, "");

  const leaf =
    item.path?.split("/").filter(Boolean).pop() ??
    item.title.trim().toLowerCase();
  const slug = leaf
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return "example.com";
  if (slug.includes(".")) return slug;
  return `${slug}.com`;
}

/**
 * Dense website row — shadcn integrations-03 layout (icon rail + title + badge).
 * Icon/color use the same picker as {@link SpaceOverviewCard}.
 */
export function WebsiteSpaceRow({
  item,
  keyboardHighlighted = false,
  onSelect,
  onIconChange,
  onTitleChange,
  onOpenSettings,
  pointerReorderBind = null,
  dragging = false,
}: WebsiteSpaceRowProps) {
  const articleCount = item.articleCount ?? 0;
  const countLabel = formatArticleCount(articleCount);
  const canPointerReorder = Boolean(pointerReorderBind);
  const categoryAccent = resolveSpaceOverviewAccent(item.categoryId);
  const interactiveIcon = Boolean(onIconChange);

  const defaultIconKey = resolveSpaceOverviewIconKey({
    path: item.path,
    icon: null,
    categoryId: item.categoryId,
  });
  const [storedIcon, setStoredIcon] = useState<string | null>(
    item.icon ?? null,
  );
  const [prevItemIcon, setPrevItemIcon] = useState(item.icon ?? null);
  if ((item.icon ?? null) !== prevItemIcon) {
    setPrevItemIcon(item.icon ?? null);
    setStoredIcon(item.icon ?? null);
  }

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayIcon = resolveSpaceOverviewIconKey({
    path: item.path,
    icon: storedIcon,
    categoryId: item.categoryId,
  });
  const selectedColor = getEntityIconColor(storedIcon);
  const squareAccent = selectedColor ?? categoryAccent;
  const rowStyle = {
    "--website-row-accent": squareAccent,
  } as CSSProperties;
  const glyphStyle = { color: "#101010" } as const;

  return (
    <>
      <article
        role="button"
        {...keyboardNavItemProps(item.id)}
        tabIndex={0}
        data-tauri-drag-region="false"
        className={[
          "website-space-row",
          canPointerReorder ? "website-space-row--draggable" : null,
          dragging ? "website-space-row--dragging" : null,
          keyboardNavListItemClass(keyboardHighlighted),
        ]
          .filter(Boolean)
          .join(" ")}
        style={rowStyle}
        onClick={() => onSelect?.(item)}
        onKeyDown={(event) => {
          if (!isDirectRoleButtonActivationKey(event)) return;
          event.preventDefault();
          onSelect?.(item);
        }}
        {...(pointerReorderBind ?? {})}
      >
        <div className="website-space-row__icon-rail">
          <span
            className="website-space-row__icon-wrap"
            data-list-reorder-no-drag=""
          >
            <button
              type="button"
              className="website-space-row__icon-trigger"
              disabled={!interactiveIcon || pending}
              aria-label={`Change icon for ${item.title}`}
              onMouseDown={stopFieldEvent}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                stopFieldEvent(event);
                if (interactiveIcon) setPickerOpen(true);
              }}
            >
              <span
                className="website-space-row__icon-glow"
                aria-hidden="true"
              />
              <span className="website-space-row__icon-face">
                <DocumentOcticon
                  icon={displayIcon}
                  size={20}
                  style={glyphStyle}
                />
              </span>
            </button>
            {error ? (
              <span className="website-space-row__icon-error" role="alert">
                {error}
              </span>
            ) : null}
          </span>
        </div>

        <div className="website-space-row__body">
          <span
            className="website-space-row__title-wrap"
            data-list-reorder-no-drag=""
            onMouseDown={stopCardNavigate}
            onClick={stopCardNavigate}
          >
            {onTitleChange ? (
              <OverviewNameEditor
                value={item.title}
                entityLabel="Website"
                resetKey={item.id}
                as="h3"
                fitContent
                titleClassName="website-space-row__title"
                onSave={(title) => onTitleChange(item, title)}
              />
            ) : (
              <h3 className="website-space-row__title">{item.title}</h3>
            )}
          </span>
          {item.description?.trim() ? (
            <p className="website-space-row__description">{item.description}</p>
          ) : null}
        </div>

        <div className="space-overview-card__pills website-space-row__pills">
          <span
            className="space-overview-card__pill"
            title={countLabel}
            aria-label={countLabel}
          >
            <DocumentIcon size={12} />
            <span>{articleCount}</span>
          </span>
        </div>

        {onOpenSettings ? (
          <div
            className="website-space-row__menu"
            data-list-reorder-no-drag=""
            onMouseDown={stopCardNavigate}
            onClick={stopCardNavigate}
          >
            <button
              type="button"
              className="website-space-row__menu-trigger"
              aria-label={`Open settings for ${item.title}`}
              title="Settings"
              onMouseDown={stopFieldEvent}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                stopFieldEvent(event);
                onOpenSettings(item);
              }}
            >
              <CogFourIcon size={16} />
            </button>
          </div>
        ) : null}
      </article>
      {interactiveIcon ? (
        <EntityIconPicker
          open={pickerOpen}
          value={storedIcon}
          dialogTitle="Choose website icon"
          onClose={() => setPickerOpen(false)}
          onSelect={(next) => {
            const previous = storedIcon;
            setStoredIcon(next);
            setError(null);
            setPending(true);
            void Promise.resolve(onIconChange?.(item, next))
              .catch((reason: unknown) => {
                setStoredIcon(previous);
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Could not update icon.",
                );
              })
              .finally(() => setPending(false));
          }}
          defaultOption={{
            label: "Default website icon",
            preview: <DocumentOcticon icon={defaultIconKey} size={16} />,
          }}
        />
      ) : null}
    </>
  );
}
