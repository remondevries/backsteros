"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_ENTITY_ICON_COLOR,
  ENTITY_ICON_COLOR_PRESETS,
  parseEntityIcon,
  serializeEntityIcon,
  type ParsedEntityIcon,
} from "../entity-icon.js";
import { filterEntityIconEmojis } from "../entity-icon-emojis.js";
import {
  formatProjectIconLabel,
  PROJECT_ICON_KEYS,
  type ProjectIconKey,
} from "../project-icon-keys.js";
import { CustomColorPickerPanel } from "./custom-color-picker-panel.js";
import { ProjectOcticon } from "./project-octicon.js";

export type EntityIconPickerDefaultOption = {
  label: string;
  preview: ReactNode;
};

type EntityIconPickerTab = "icons" | "emojis";

export type EntityIconPickerProps = {
  open: boolean;
  value: string | null;
  dialogTitle: string;
  onClose: () => void;
  onSelect: (icon: string | null) => void;
  defaultOption?: EntityIconPickerDefaultOption;
};

function filterIcons(query: string): ProjectIconKey[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...PROJECT_ICON_KEYS];
  }

  return PROJECT_ICON_KEYS.filter((key) => {
    const label = formatProjectIconLabel(key);
    return `${key} ${label}`.includes(normalized);
  });
}

function CheckIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="entity-icon-picker__check-icon"
    >
      <path
        d="M2 5.2L4.1 7.3L8.2 3.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ColorSwatch({
  color,
  selected,
  onSelect,
  ariaLabel,
  children,
}: {
  color?: string;
  selected: boolean;
  onSelect: () => void;
  ariaLabel: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={onSelect}
      className="entity-icon-picker__color-swatch"
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
        <span className="entity-icon-picker__color-swatch-check">
          <CheckIcon />
        </span>
      ) : null}
    </button>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`entity-icon-picker__tab${active ? " is-active" : ""}`}
    >
      {children}
      {active ? (
        <span aria-hidden="true" className="entity-icon-picker__tab-underline" />
      ) : null}
    </button>
  );
}

export function EntityIconPicker({
  open,
  value,
  dialogTitle,
  onClose,
  onSelect,
  defaultOption,
}: EntityIconPickerProps) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const parsedValue = useMemo(() => parseEntityIcon(value), [value]);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<EntityIconPickerTab>(() =>
    parsedValue.kind === "emoji" ? "emojis" : "icons",
  );
  const [selectedColor, setSelectedColor] = useState(() => {
    if (parsedValue.kind === "icon" && parsedValue.color) {
      return parsedValue.color;
    }
    if (parsedValue.kind === "default" && parsedValue.color) {
      return parsedValue.color;
    }
    return DEFAULT_ENTITY_ICON_COLOR;
  });
  const [customColor, setCustomColor] = useState(() => {
    const initialColor =
      parsedValue.kind === "icon"
        ? parsedValue.color
        : parsedValue.kind === "default"
          ? parsedValue.color
          : undefined;

    if (
      initialColor &&
      !ENTITY_ICON_COLOR_PRESETS.includes(
        initialColor as (typeof ENTITY_ICON_COLOR_PRESETS)[number],
      )
    ) {
      return initialColor;
    }
    return "#a855f7";
  });
  const [customPickerOpen, setCustomPickerOpen] = useState(() => {
    const initialColor =
      parsedValue.kind === "icon"
        ? parsedValue.color
        : parsedValue.kind === "default"
          ? parsedValue.color
          : undefined;

    if (
      initialColor &&
      !ENTITY_ICON_COLOR_PRESETS.includes(
        initialColor as (typeof ENTITY_ICON_COLOR_PRESETS)[number],
      )
    ) {
      return true;
    }
    return false;
  });

  const filteredIcons = useMemo(() => filterIcons(query), [query]);
  const filteredEmojis = useMemo(() => filterEntityIconEmojis(query), [query]);

  const isPresetColor = ENTITY_ICON_COLOR_PRESETS.includes(
    selectedColor as (typeof ENTITY_ICON_COLOR_PRESETS)[number],
  );

  const close = useCallback(() => {
    setQuery("");
    setCustomPickerOpen(false);
    onClose();
  }, [onClose]);

  const [prevOpen, setPrevOpen] = useState(open);
  if (!open && prevOpen) {
    setPrevOpen(false);
    setQuery("");
    setCustomPickerOpen(false);
  } else if (open && !prevOpen) {
    setPrevOpen(true);
  }

  const openValueSyncKey = open ? value : "";
  const [prevOpenValueSyncKey, setPrevOpenValueSyncKey] =
    useState(openValueSyncKey);
  if (open && openValueSyncKey !== prevOpenValueSyncKey) {
    setPrevOpenValueSyncKey(openValueSyncKey);
    const nextParsed = parseEntityIcon(value);
    setTab(nextParsed.kind === "emoji" ? "emojis" : "icons");
    if (nextParsed.kind === "icon" && nextParsed.color) {
      setSelectedColor(nextParsed.color);
      if (
        !ENTITY_ICON_COLOR_PRESETS.includes(
          nextParsed.color as (typeof ENTITY_ICON_COLOR_PRESETS)[number],
        )
      ) {
        setCustomColor(nextParsed.color);
        setCustomPickerOpen(true);
      } else {
        setCustomPickerOpen(false);
      }
    } else if (nextParsed.kind === "default") {
      const color = nextParsed.color ?? DEFAULT_ENTITY_ICON_COLOR;
      setSelectedColor(color);
      if (
        nextParsed.color &&
        !ENTITY_ICON_COLOR_PRESETS.includes(
          nextParsed.color as (typeof ENTITY_ICON_COLOR_PRESETS)[number],
        )
      ) {
        setCustomColor(nextParsed.color);
        setCustomPickerOpen(true);
      } else {
        setCustomPickerOpen(false);
      }
    } else if (nextParsed.kind === "icon") {
      setSelectedColor(DEFAULT_ENTITY_ICON_COLOR);
      setCustomPickerOpen(false);
    }
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open, openValueSyncKey]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function selectIcon(next: ParsedEntityIcon) {
    onSelect(serializeEntityIcon(next));
    close();
  }

  function handleIconSelect(iconKey: ProjectIconKey) {
    selectIcon({
      kind: "icon",
      key: iconKey,
      color: selectedColor,
    });
  }

  function handleEmojiSelect(emoji: string) {
    selectIcon({ kind: "emoji", emoji });
  }

  if (!open || typeof document === "undefined") {
    return null;
  }

  const panelStyle: CSSProperties = {
    maxHeight: "min(72vh, 580px)",
  };

  const showDefaultOption =
    tab === "icons" &&
    defaultOption &&
    (!query.trim() ||
      defaultOption.label.toLowerCase().includes(query.trim().toLowerCase()));

  const selectedEmoji = parsedValue.kind === "emoji" ? parsedValue.emoji : null;

  return createPortal(
    <div className="entity-icon-picker" data-blocking-modal="" data-entity-icon-picker="">
      <button
        type="button"
        aria-label="Close icon picker"
        className="entity-icon-picker__backdrop"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="entity-icon-picker__panel"
        style={panelStyle}
      >
        <header className="entity-icon-picker__header">
          <h2 id={titleId} className="entity-icon-picker__sr-only">
            {dialogTitle}
          </h2>

          <div role="tablist" aria-label="Icon type" className="entity-icon-picker__tablist">
            <TabButton
              active={tab === "icons"}
              onClick={() => {
                setTab("icons");
                setQuery("");
              }}
            >
              Icons
            </TabButton>
            <TabButton
              active={tab === "emojis"}
              onClick={() => {
                setTab("emojis");
                setQuery("");
              }}
            >
              Emojis
            </TabButton>
          </div>

          {tab === "icons" ? (
            <div className="entity-icon-picker__color-section">
              <div className="entity-icon-picker__color-row">
                {ENTITY_ICON_COLOR_PRESETS.map((color) => (
                  <ColorSwatch
                    key={color}
                    color={color}
                    selected={selectedColor === color && isPresetColor}
                    ariaLabel={`Icon color ${color}`}
                    onSelect={() => {
                      setSelectedColor(color);
                      setCustomPickerOpen(false);
                    }}
                  />
                ))}
                <span aria-hidden="true" className="entity-icon-picker__color-divider" />
                <ColorSwatch
                  selected={!isPresetColor}
                  ariaLabel="Custom icon color"
                  onSelect={() => {
                    const nextCustom = isPresetColor ? selectedColor : customColor;
                    if (isPresetColor) {
                      setCustomColor(selectedColor);
                    }
                    setSelectedColor(nextCustom);
                    setCustomPickerOpen(true);
                  }}
                />
              </div>

              {customPickerOpen ? (
                <CustomColorPickerPanel
                  color={customColor}
                  onChange={(nextColor) => {
                    setCustomColor(nextColor);
                    setSelectedColor(nextColor);
                  }}
                />
              ) : null}
            </div>
          ) : null}

          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "icons" ? "Search icons…" : "Search emojis…"}
            aria-label={tab === "icons" ? "Search icons" : "Search emojis"}
            className="entity-icon-picker__search"
          />
        </header>

        <div className="entity-icon-picker__content">
          {tab === "icons" ? (
            filteredIcons.length === 0 && !showDefaultOption ? (
              <p className="entity-icon-picker__empty">No icons match your search.</p>
            ) : (
              <div className="entity-icon-picker__grid">
                {showDefaultOption ? (
                  <button
                    type="button"
                    title={defaultOption.label}
                    aria-label={defaultOption.label}
                    aria-pressed={parsedValue.kind === "default"}
                    onClick={() => selectIcon({ kind: "default", color: selectedColor })}
                    className={`entity-icon-picker__cell${
                      parsedValue.kind === "default" ? " is-selected" : ""
                    }`}
                  >
                    <span style={{ color: selectedColor }}>{defaultOption.preview}</span>
                  </button>
                ) : null}
                {filteredIcons.map((iconKey) => {
                  const label = formatProjectIconLabel(iconKey);
                  const isSelected =
                    parsedValue.kind === "icon" && parsedValue.key === iconKey;

                  return (
                    <button
                      key={iconKey}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={isSelected}
                      onClick={() => handleIconSelect(iconKey)}
                      className={`entity-icon-picker__cell${isSelected ? " is-selected" : ""}`}
                    >
                      <ProjectOcticon icon={iconKey} size={16} style={{ color: selectedColor }} />
                    </button>
                  );
                })}
              </div>
            )
          ) : filteredEmojis.length === 0 ? (
            <p className="entity-icon-picker__empty">No emojis match your search.</p>
          ) : (
            <div className="entity-icon-picker__grid">
              {filteredEmojis.map((entry) => (
                <button
                  key={entry.emoji}
                  type="button"
                  title={entry.keywords.join(", ")}
                  aria-label={entry.keywords[0] ?? entry.emoji}
                  aria-pressed={selectedEmoji === entry.emoji}
                  onClick={() => handleEmojiSelect(entry.emoji)}
                  className={`entity-icon-picker__cell entity-icon-picker__cell--emoji${
                    selectedEmoji === entry.emoji ? " is-selected" : ""
                  }`}
                >
                  {entry.emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
