"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "@primer/octicons-react";

import { EntityIconPicker } from "../entity/entity-icon-picker.js";
import { CustomColorPickerPanel } from "../entity/custom-color-picker-panel.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import {
  DEFAULT_ENTITY_ICON_COLOR,
  ENTITY_ICON_COLOR_PRESETS,
  parseEntityIcon,
} from "../../entity/entity-icon.js";
import {
  folderPortalIconWithColor,
  type FolderPortalProperties,
} from "../../spaces/folder-portal-properties.js";

export type FolderPortalSettingsModalProps = {
  open: boolean;
  initial: FolderPortalProperties;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (next: FolderPortalProperties) => void | Promise<void>;
};

function FolderIconPreview({
  value,
  color,
  size = 28,
}: {
  value: string;
  color: string;
  size?: number;
}) {
  const parsed = parseEntityIcon(value || null);
  const paint = color || undefined;
  if (parsed.kind === "emoji") {
    return (
      <span
        className="folder-portal-settings-modal__icon-emoji"
        style={{ fontSize: Math.round(size * 0.7) }}
        aria-hidden
      >
        {parsed.emoji}
      </span>
    );
  }
  if (parsed.kind === "icon") {
    return (
      <span
        className="folder-portal-settings-modal__icon-glyph"
        style={paint ? { color: paint } : undefined}
        aria-hidden
      >
        <ProjectOcticon icon={parsed.key} size={size} />
      </span>
    );
  }
  return (
    <span
      className="folder-portal-settings-modal__icon-glyph"
      style={paint ? { color: paint } : undefined}
      aria-hidden
    >
      <ProjectOcticon icon="file-directory" size={size} />
    </span>
  );
}

function ColorSwatch({
  color,
  selected,
  onSelect,
  ariaLabel,
  disabled,
  children,
}: {
  color?: string;
  selected: boolean;
  onSelect: () => void;
  ariaLabel: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={[
        "folder-portal-settings-modal__color-swatch",
        selected ? "is-selected" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        color
          ? { backgroundColor: color }
          : {
              background:
                "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)",
            }
      }
    >
      {children}
      {selected ? (
        <span className="folder-portal-settings-modal__color-swatch-check">
          <CheckIcon size={12} />
        </span>
      ) : null}
    </button>
  );
}

function isPresetColor(value: string): boolean {
  return ENTITY_ICON_COLOR_PRESETS.includes(
    value as (typeof ENTITY_ICON_COLOR_PRESETS)[number],
  );
}

export function FolderPortalSettingsModal({
  open,
  initial,
  saving = false,
  error = null,
  onClose,
  onSave,
}: FolderPortalSettingsModalProps) {
  const titleId = useId();
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [description, setDescription] = useState(initial.description);
  const [icon, setIcon] = useState(initial.icon);
  const [color, setColor] = useState(
    initial.color || DEFAULT_ENTITY_ICON_COLOR,
  );
  const [customColor, setCustomColor] = useState(() => {
    const initialColor = initial.color || DEFAULT_ENTITY_ICON_COLOR;
    return isPresetColor(initialColor) ? "#a855f7" : initialColor;
  });
  const [customPickerOpen, setCustomPickerOpen] = useState(() => {
    const initialColor = initial.color || DEFAULT_ENTITY_ICON_COLOR;
    return Boolean(initialColor && !isPresetColor(initialColor));
  });
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const titleTrimmed = title.trim();
  const canSave = titleTrimmed.length > 0 && !saving;
  const colorIsPreset = isPresetColor(color);

  useEffect(() => {
    if (!open) return;
    const nextColor = initial.color || DEFAULT_ENTITY_ICON_COLOR;
    setTitle(initial.title);
    setSlug(initial.slug);
    setDescription(initial.description);
    setIcon(initial.icon);
    setColor(nextColor);
    if (isPresetColor(nextColor)) {
      setCustomPickerOpen(false);
    } else {
      setCustomColor(nextColor);
      setCustomPickerOpen(true);
    }
    setIconPickerOpen(false);
  }, [initial, open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !iconPickerOpen) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [iconPickerOpen, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="folder-portal-settings-modal" role="presentation">
      <button
        type="button"
        className="folder-portal-settings-modal__backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="folder-portal-settings-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="folder-portal-settings-modal__header">
          <h2 id={titleId} className="folder-portal-settings-modal__title">
            Folder settings
          </h2>
        </header>

        <div className="folder-portal-settings-modal__body">
          <div className="folder-portal-settings-modal__identity">
            <button
              type="button"
              className="folder-portal-settings-modal__avatar"
              onClick={() => setIconPickerOpen(true)}
              disabled={saving}
              aria-label="Choose folder icon"
              title="Choose icon"
            >
              <FolderIconPreview value={icon} color={color} size={32} />
            </button>

            <div
              className="folder-portal-settings-modal__colors"
              role="group"
              aria-label="Folder accent color"
            >
              <div className="folder-portal-settings-modal__color-row">
                {ENTITY_ICON_COLOR_PRESETS.map((preset) => (
                  <ColorSwatch
                    key={preset}
                    color={preset}
                    selected={colorIsPreset && color === preset}
                    disabled={saving}
                    ariaLabel={`Color ${preset}`}
                    onSelect={() => {
                      setColor(preset);
                      setCustomPickerOpen(false);
                    }}
                  />
                ))}
                <span
                  aria-hidden="true"
                  className="folder-portal-settings-modal__color-divider"
                />
                <ColorSwatch
                  selected={!colorIsPreset}
                  disabled={saving}
                  ariaLabel="Custom icon color"
                  onSelect={() => {
                    const nextCustom = colorIsPreset ? color : customColor;
                    if (colorIsPreset) {
                      setCustomColor(color);
                    }
                    setColor(nextCustom);
                    setCustomPickerOpen(true);
                  }}
                />
              </div>

              {customPickerOpen ? (
                <CustomColorPickerPanel
                  color={customColor}
                  onChange={(nextColor) => {
                    setCustomColor(nextColor);
                    setColor(nextColor);
                  }}
                />
              ) : null}
            </div>
          </div>

          <label className="folder-portal-settings-modal__field">
            <span className="folder-portal-settings-modal__label">
              Folder title
            </span>
            <input
              className="folder-portal-settings-modal__input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Folder name"
              spellCheck={false}
              disabled={saving}
              autoComplete="off"
              autoFocus
            />
          </label>

          <label className="folder-portal-settings-modal__field">
            <span className="folder-portal-settings-modal__label">Slug</span>
            <input
              className="folder-portal-settings-modal__input"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="supportcenter"
              spellCheck={false}
              disabled={saving}
              autoComplete="off"
            />
            <span className="folder-portal-settings-modal__hint">
              Used in the portal URL (e.g. /app/supportcenter/collections/…).
            </span>
          </label>

          <label className="folder-portal-settings-modal__field">
            <span className="folder-portal-settings-modal__label">
              Description
            </span>
            <textarea
              className="folder-portal-settings-modal__textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Short blurb shown on the portal collection card."
              disabled={saving}
            />
          </label>

          {error ? (
            <p className="folder-portal-settings-modal__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="folder-portal-settings-modal__footer">
          <button
            type="button"
            className="folder-portal-settings-modal__secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="folder-portal-settings-modal__primary"
            disabled={!canSave}
            onClick={() => {
              const nextColor = color.trim();
              void onSave({
                title: titleTrimmed,
                slug: slug.trim(),
                description: description.trim(),
                color: nextColor,
                icon: folderPortalIconWithColor(icon, nextColor),
              });
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>

      <EntityIconPicker
        open={iconPickerOpen}
        value={icon || null}
        dialogTitle="Choose folder icon"
        onClose={() => setIconPickerOpen(false)}
        onSelect={(next) => {
          setIcon(next ?? "");
          const parsed = parseEntityIcon(next);
          if (parsed.kind === "icon" && parsed.color) {
            setColor(parsed.color);
            if (isPresetColor(parsed.color)) {
              setCustomPickerOpen(false);
            } else {
              setCustomColor(parsed.color);
              setCustomPickerOpen(true);
            }
          }
          setIconPickerOpen(false);
        }}
        defaultOption={{
          label: "Default folder icon",
          preview: <ProjectOcticon icon="file-directory" size={16} />,
        }}
      />
    </div>,
    document.body,
  );
}
