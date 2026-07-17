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

import { CustomColorPickerPanel } from "@/components/icons/custom-color-picker-panel";
import { ProjectOcticon } from "@/components/project-icon";
import { useMounted } from "@/hooks/use-mounted";
import {
  DEFAULT_ENTITY_ICON_COLOR,
  ENTITY_ICON_COLOR_PRESETS,
  parseEntityIcon,
  serializeEntityIcon,
  type ParsedEntityIcon,
} from "@/lib/entity-icon";
import { filterEntityIconEmojis } from "@/lib/entity-icon-emojis";
import {
  formatProjectIconLabel,
  PROJECT_ICON_KEYS,
  type ProjectIconKey,
} from "@/lib/project-icon";

export type EntityIconPickerDefaultOption = {
  label: string;
  preview: ReactNode;
};

type EntityIconPickerTab = "icons" | "emojis";

type EntityIconPickerProps = {
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
      className="text-white drop-shadow-sm"
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
      className="relative flex size-7 shrink-0 items-center justify-center rounded-full border-none p-0 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/30"
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
        <span className="absolute inset-0 flex items-center justify-center">
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
      className={`relative border-none bg-transparent px-0 pb-2.5 pt-1 text-sm font-medium transition-colors ${
        active
          ? "text-foreground"
          : "text-foreground/45 hover:text-foreground/70"
      }`}
    >
      {children}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#7c89ff]"
        />
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
  const mounted = useMounted();
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
  const [prevOpenValueSyncKey, setPrevOpenValueSyncKey] = useState(openValueSyncKey);
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

  if (!mounted || !open) {
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

  const selectedEmoji =
    parsedValue.kind === "emoji" ? parsedValue.emoji : null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-blocking-modal=""
      data-entity-icon-picker=""
    >
      <button
        type="button"
        aria-label="Close icon picker"
        className="absolute inset-0 border-none bg-black/60 p-0"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141414] shadow-2xl"
        style={panelStyle}
      >
        <header className="flex shrink-0 flex-col gap-3 border-b border-white/10 px-4 pb-3 pt-4">
          <h2 id={titleId} className="sr-only">
            {dialogTitle}
          </h2>

          <div
            role="tablist"
            aria-label="Icon type"
            className="flex gap-5 border-b border-white/8"
          >
            <TabButton active={tab === "icons"} onClick={() => { setTab("icons"); setQuery(""); }}>
              Icons
            </TabButton>
            <TabButton
              active={tab === "emojis"}
              onClick={() => { setTab("emojis"); setQuery(""); }}
            >
              Emojis
            </TabButton>
          </div>

          {tab === "icons" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
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
                <span
                  aria-hidden="true"
                  className="mx-0.5 h-5 w-px shrink-0 bg-white/12"
                />
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
            placeholder={
              tab === "icons" ? "Search icons…" : "Search emojis…"
            }
            aria-label={tab === "icons" ? "Search icons" : "Search emojis"}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/40 focus:border-white/20"
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {tab === "icons" ? (
            filteredIcons.length === 0 && !showDefaultOption ? (
              <p className="px-2 py-6 text-center text-sm text-foreground/50">
                No icons match your search.
              </p>
            ) : (
              <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                {showDefaultOption ? (
                  <button
                    type="button"
                    title={defaultOption.label}
                    aria-label={defaultOption.label}
                    aria-pressed={parsedValue.kind === "default"}
                    onClick={() =>
                      selectIcon({ kind: "default", color: selectedColor })
                    }
                    className={`flex aspect-square items-center justify-center rounded-md border-none transition-colors ${
                      parsedValue.kind === "default"
                        ? "bg-white/15 text-foreground"
                        : "bg-transparent text-foreground/70 hover:bg-white/8 hover:text-foreground"
                    }`}
                  >
                    <span style={{ color: selectedColor }}>
                      {defaultOption.preview}
                    </span>
                  </button>
                ) : null}
                {filteredIcons.map((iconKey) => {
                  const label = formatProjectIconLabel(iconKey);

                  return (
                    <button
                      key={iconKey}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={
                        parsedValue.kind === "icon" &&
                        parsedValue.key === iconKey
                      }
                      onClick={() => handleIconSelect(iconKey)}
                      className={`flex aspect-square items-center justify-center rounded-md border-none transition-colors ${
                        parsedValue.kind === "icon" &&
                        parsedValue.key === iconKey
                          ? "bg-white/15"
                          : "bg-transparent hover:bg-white/8"
                      }`}
                    >
                      <ProjectOcticon
                        icon={iconKey}
                        size={16}
                        style={{ color: selectedColor }}
                      />
                    </button>
                  );
                })}
              </div>
            )
          ) : filteredEmojis.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-foreground/50">
              No emojis match your search.
            </p>
          ) : (
            <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
              {filteredEmojis.map((entry) => (
                <button
                  key={entry.emoji}
                  type="button"
                  title={entry.keywords.join(", ")}
                  aria-label={entry.keywords[0] ?? entry.emoji}
                  aria-pressed={selectedEmoji === entry.emoji}
                  onClick={() => handleEmojiSelect(entry.emoji)}
                  className={`flex aspect-square items-center justify-center rounded-md border-none text-lg transition-colors ${
                    selectedEmoji === entry.emoji
                      ? "bg-white/15"
                      : "bg-transparent hover:bg-white/8"
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
