"use client";

import {
  useEffect,
  useRef,
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
  formatSpaceUpdatedLabel,
  resolveSpaceOverviewAccent,
  resolveSpaceOverviewDescription,
  resolveSpaceOverviewIconKey,
  resolveSpaceUpdatedFreshness,
  type SpacesCategoryId,
} from "../../spaces/spaces-categories.js";
import { EntityIconPicker } from "../entity/entity-icon-picker.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { DocumentIcon } from "../documents/document-icon.js";
import { DocumentOcticon } from "../documents/document-octicon.js";
import { CogFourIcon } from "../icons/cog-four-icon.js";
import { getEntityIconColor } from "../projects/project-octicon.js";
import { TaskDueDateIcon } from "../tasks/task-due-date-icon.js";

/** Default icon when creating a new space folder. */
export const SPACE_CREATE_DEFAULT_ICON = "file-directory";

export type SpaceOverviewCardItem = {
  id: string;
  title: string;
  path?: string | null;
  /** Stored folder icon (null = category / path default). */
  icon?: string | null;
  /** Optional blurb — falls back to path/category defaults until DB-backed. */
  description?: string | null;
  categoryId: SpacesCategoryId;
  /** Total articles (documents) under this space, including nested folders. */
  articleCount?: number;
  /** Newest updatedAt under this space (epoch ms). */
  updatedAt?: number | null;
  /** Vault cover / OG image storage key when set. */
  coverStorageKey?: string | null;
  /** Resolved object URL for the cover image (desktop host). */
  coverSrc?: string | null;
};

/** @deprecated Prefer {@link SpaceOverviewCardItem}. */
export type SpaceOverviewRowItem = SpaceOverviewCardItem;

export type SpaceOverviewCardProps = {
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
  /** Pointer-based list drag-reorder (prefer over HTML5 DnD on desktop). */
  pointerReorderBind?: GroupedListPointerItemBind | null;
  /** True while this card is the active pointer-drag source. */
  dragging?: boolean;
};

/** @deprecated Prefer {@link SpaceOverviewCardProps}. */
export type SpaceOverviewRowProps = SpaceOverviewCardProps;

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

function entityLabelForCategory(categoryId: SpacesCategoryId): string {
  if (categoryId === "support") return "Category";
  if (categoryId === "websites") return "Website";
  return "Space";
}

/**
 * Spaces overview card — features-15 layout (visual + title), half-height panel
 * with icon square overlaid top-left for Support / Knowledge Base.
 */
export function SpaceOverviewCard({
  item,
  keyboardHighlighted = false,
  onSelect,
  onIconChange,
  onTitleChange,
  onOpenSettings,
  pointerReorderBind = null,
  dragging = false,
}: SpaceOverviewCardProps) {
  const articleCount = item.articleCount ?? 0;
  const countLabel = formatArticleCount(articleCount);
  const updatedLabel = formatSpaceUpdatedLabel(item.updatedAt);
  const updatedFreshness = resolveSpaceUpdatedFreshness(item.updatedAt);
  const updatedTitle =
    item.updatedAt != null && Number.isFinite(item.updatedAt)
      ? new Date(item.updatedAt).toLocaleString()
      : null;
  const description = resolveSpaceOverviewDescription({
    path: item.path,
    description: item.description,
    categoryId: item.categoryId,
  });
  const categoryAccent = resolveSpaceOverviewAccent(item.categoryId);
  const canPointerReorder = Boolean(pointerReorderBind);
  const hasCover = Boolean(item.coverSrc);

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
  const interactiveIcon = Boolean(onIconChange);

  const displayIcon = resolveSpaceOverviewIconKey({
    path: item.path,
    icon: storedIcon,
    categoryId: item.categoryId,
  });
  const selectedColor = getEntityIconColor(storedIcon);
  const squareAccent = selectedColor ?? categoryAccent;
  const cardStyle = {
    "--space-card-accent": squareAccent,
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
          "space-overview-card",
          canPointerReorder ? "space-overview-card--draggable" : null,
          dragging ? "space-overview-card--dragging" : null,
          keyboardNavListItemClass(keyboardHighlighted),
        ]
          .filter(Boolean)
          .join(" ")}
        style={cardStyle}
        onClick={() => onSelect?.(item)}
        onKeyDown={(event) => {
          if (!isDirectRoleButtonActivationKey(event)) return;
          event.preventDefault();
          onSelect?.(item);
        }}
        {...(pointerReorderBind ?? {})}
      >
        <div
          className={[
            "space-overview-card__visual",
            hasCover ? "space-overview-card__visual--cover" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {hasCover ? (
            <img
              alt=""
              className="space-overview-card__cover"
              src={item.coverSrc!}
            />
          ) : null}
        </div>

        {onOpenSettings ? (
          <div
            className="space-overview-card__menu"
            data-list-reorder-no-drag=""
            onMouseDown={stopCardNavigate}
            onClick={stopCardNavigate}
          >
            <button
              type="button"
              className="space-overview-card__menu-trigger"
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

        <div className="space-overview-card__body">
          <span
            className="space-overview-card__icon-wrap"
            data-list-reorder-no-drag=""
          >
            <button
              type="button"
              className="space-overview-card__icon-trigger"
              disabled={!interactiveIcon || pending}
              aria-label={`Change icon for ${item.title}`}
              onMouseDown={stopFieldEvent}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                stopFieldEvent(event);
                if (interactiveIcon) setPickerOpen(true);
              }}
            >
              <span className="space-overview-card__icon-face">
                <DocumentOcticon
                  icon={displayIcon}
                  size={22}
                  style={glyphStyle}
                />
              </span>
            </button>
            {error ? (
              <span className="space-overview-card__icon-error" role="alert">
                {error}
              </span>
            ) : null}
          </span>

          <span
            className="space-overview-card__title-wrap"
            data-list-reorder-no-drag=""
            onMouseDown={stopCardNavigate}
            onClick={stopCardNavigate}
          >
            {onTitleChange ? (
              <OverviewNameEditor
                value={item.title}
                entityLabel={entityLabelForCategory(item.categoryId)}
                resetKey={item.id}
                as="h3"
                fitContent
                titleClassName="space-overview-card__title"
                onSave={(title) => onTitleChange(item, title)}
              />
            ) : (
              <h3 className="space-overview-card__title">{item.title}</h3>
            )}
          </span>

          {description ? (
            <p className="space-overview-card__description">{description}</p>
          ) : null}

          <div className="space-overview-card__meta">
            <div className="space-overview-card__pills">
              <span
                className="space-overview-card__pill"
                title={countLabel}
                aria-label={countLabel}
              >
                <DocumentIcon size={12} />
                <span>{articleCount}</span>
              </span>
              {updatedLabel ? (
                <span
                  className="space-overview-card__pill"
                  title={updatedTitle ?? updatedLabel}
                  aria-label={`Updated ${updatedLabel}`}
                >
                  <TaskDueDateIcon
                    size={12}
                    active={
                      updatedFreshness === "stale" ||
                      updatedFreshness === "stale_long"
                    }
                    urgency={
                      updatedFreshness === "stale_long"
                        ? "overdue"
                        : updatedFreshness === "stale"
                          ? "due_soon"
                          : null
                    }
                  />
                  <span>{updatedLabel}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </article>
      {interactiveIcon ? (
        <EntityIconPicker
          open={pickerOpen}
          value={storedIcon}
          dialogTitle="Choose space icon"
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
            label: "Default space icon",
            preview: <DocumentOcticon icon={defaultIconKey} size={16} />,
          }}
        />
      ) : null}
    </>
  );
}

export type SpaceOverviewCreateCardProps = {
  categoryId: SpacesCategoryId;
  disabled?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (input: {
    title: string;
    icon: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Full space card chrome for creating a folder — same layout as
 * {@link SpaceOverviewCard}, with folder icon + editable “Name of space”.
 */
export function SpaceOverviewCreateCard({
  categoryId,
  disabled = false,
  error = null,
  onCancel,
  onSubmit,
}: SpaceOverviewCreateCardProps) {
  const [icon, setIcon] = useState(SPACE_CREATE_DEFAULT_ICON);
  const [pickerOpen, setPickerOpen] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  const categoryAccent = resolveSpaceOverviewAccent(categoryId);
  const selectedColor = getEntityIconColor(icon);
  const squareAccent = selectedColor ?? categoryAccent;
  const cardStyle = {
    "--space-card-accent": squareAccent,
  } as CSSProperties;
  const glyphStyle = { color: "#101010" } as const;

  async function handleSave(
    title: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const trimmed = title.trim();
    if (!trimmed) {
      onCancel();
      return { ok: true };
    }
    if (disabled || submittingRef.current) {
      return { ok: false, error: "Already creating." };
    }
    submittingRef.current = true;
    try {
      return await onSubmit({ title: trimmed, icon });
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <>
      <article
        className="space-overview-card space-overview-card--creating"
        style={cardStyle}
        data-tauri-drag-region="false"
        aria-label="New space"
      >
        <div className="space-overview-card__visual" />

        <div className="space-overview-card__body">
          <span className="space-overview-card__icon-wrap">
            <button
              type="button"
              className="space-overview-card__icon-trigger"
              disabled={disabled}
              aria-label="Choose space icon"
              onMouseDown={stopFieldEvent}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                stopFieldEvent(event);
                setPickerOpen(true);
              }}
            >
              <span className="space-overview-card__icon-face">
                <DocumentOcticon icon={icon} size={22} style={glyphStyle} />
              </span>
            </button>
          </span>

          <span
            className="space-overview-card__title-wrap"
            onMouseDown={stopCardNavigate}
            onClick={stopCardNavigate}
          >
            <OverviewNameEditor
              value=""
              entityLabel="Name of space"
              resetKey={`create-${categoryId}`}
              autoEdit
              allowEmpty
              as="h3"
              fitContent
              titleClassName="space-overview-card__title"
              onSave={handleSave}
              onLeaveTitle={() => {
                onCancel();
              }}
            />
            {error ? (
              <span className="space-overview-card__icon-error" role="alert">
                {error}
              </span>
            ) : null}
          </span>

          <div className="space-overview-card__meta">
            <div className="space-overview-card__pills">
              <span
                className="space-overview-card__pill"
                title="0 articles"
                aria-label="0 articles"
              >
                <DocumentIcon size={12} />
                <span>0</span>
              </span>
            </div>
          </div>
        </div>
      </article>
      <EntityIconPicker
        open={pickerOpen}
        value={icon}
        dialogTitle="Choose space icon"
        onClose={() => setPickerOpen(false)}
        onSelect={(next) => {
          setIcon(next ?? SPACE_CREATE_DEFAULT_ICON);
        }}
        defaultOption={{
          label: "Folder",
          preview: (
            <DocumentOcticon icon={SPACE_CREATE_DEFAULT_ICON} size={16} />
          ),
        }}
      />
    </>
  );
}

/** @deprecated Prefer {@link SpaceOverviewCard}. */
export const SpaceOverviewRow = SpaceOverviewCard;
