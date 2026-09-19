"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { XIcon } from "@primer/octicons-react";

import type { PropertyDropdownTriggerVariant } from "../dropdowns/property-dropdown.js";
import { TASK_PROPERTY_DROPDOWN_ATTRIBUTE } from "../../tasks/task-property-dropdown-keys.js";
import { HealthCheckConfirmIcon } from "../icons/health-check-confirm-icon.js";
import { HealthCheckIcon } from "../icons/health-check-icon.js";
import { HealthCheckSimpleIcon } from "../icons/health-check-simple-icon.js";

export type ProjectHealthCheckMode = "simple" | "advanced";

export function normalizeHealthCheckDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (candidate.includes("://")) {
    try {
      candidate = new URL(candidate).hostname;
    } catch {
      candidate = candidate.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    }
  }
  candidate = candidate.split("/")[0] ?? candidate;
  candidate = candidate.split("?")[0] ?? candidate;
  candidate = candidate.replace(/:\d+$/, "");
  candidate = candidate.replace(/\.$/, "");

  if (
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(
      candidate,
    ) &&
    candidate !== "localhost"
  ) {
    return null;
  }
  return candidate;
}

export type ProjectHealthCheckValue = {
  healthCheckMode: ProjectHealthCheckMode;
  healthCheckDomain: string | null;
};

type ProjectHealthCheckPropertyProps = {
  mode?: ProjectHealthCheckMode | null;
  domain?: string | null;
  onChange?: (next: ProjectHealthCheckValue) => void;
  disabled?: boolean;
  triggerVariant?: PropertyDropdownTriggerVariant;
  panelAlign?: "start" | "end";
};

const PANEL_WIDTH = 280;
const PANEL_GAP = 6;
const VIEWPORT_PADDING = 8;

/**
 * Codebase Properties → Health check chip.
 * Advanced selects immediately; Simple expands to a URL field + Save.
 */
export function ProjectHealthCheckProperty({
  mode: modeProp,
  domain: domainProp,
  onChange,
  disabled = false,
  triggerVariant = "default",
  panelAlign = "end",
}: ProjectHealthCheckPropertyProps): ReactNode {
  const mode: ProjectHealthCheckMode =
    modeProp === "advanced" ? "advanced" : "simple";
  const domain = domainProp?.trim() || null;

  const [open, setOpen] = useState(false);
  const [editingSimple, setEditingSimple] = useState(false);
  const [domainDraft, setDomainDraft] = useState(domain ?? "");
  const [error, setError] = useState<string | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });

  const triggerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDomainDraft(domain ?? "");
  }, [domain]);

  useEffect(() => {
    if (!open) {
      setEditingSimple(false);
      setError(null);
      setDomainDraft(domain ?? "");
    }
  }, [open, domain]);

  useEffect(() => {
    if (!open || !editingSimple) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingSimple, open]);

  const updatePosition = useCallback(() => {
    const anchor = rootRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const rect = anchor.getBoundingClientRect();
    const width = PANEL_WIDTH;
    let left =
      panelAlign === "start" ? rect.left : rect.right - width;
    left = Math.min(
      Math.max(VIEWPORT_PADDING, left),
      window.innerWidth - width - VIEWPORT_PADDING,
    );

    const panelHeight = panel.offsetHeight || 120;
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight && rect.top > panelHeight + PANEL_GAP;
    const top = openUpward
      ? Math.max(VIEWPORT_PADDING, rect.top - panelHeight - PANEL_GAP)
      : rect.bottom + PANEL_GAP;

    setPanelStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      visibility: "visible",
    });
  }, [panelAlign]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle({ visibility: "hidden" });
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    return () => window.cancelAnimationFrame(frame);
  }, [editingSimple, error, open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }

    function handleReposition() {
      updatePosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updatePosition]);

  const chipLabel = "Health";
  const active = mode === "simple" && Boolean(domain);
  const muted = !active;
  const canEdit = Boolean(onChange) && !disabled;

  function saveSimpleDomain() {
    const trimmed = domainDraft.trim();
    if (!trimmed) {
      setError("Enter a domain (e.g. quarrymill.com)");
      return;
    }
    const next = normalizeHealthCheckDomain(domainDraft);
    if (!next) {
      setError("Enter a valid domain (e.g. quarrymill.com)");
      return;
    }
    setError(null);
    onChange?.({
      healthCheckMode: "simple",
      healthCheckDomain: next,
    });
    setOpen(false);
  }

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className="searchable-dropdown-panel project-health-check-panel"
            style={panelStyle}
            role="listbox"
            aria-label="Health check"
            data-searchable-dropdown-panel=""
            data-project-health-check-panel=""
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ul className="searchable-dropdown-panel__list" role="presentation">
              <li role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={mode === "advanced"}
                  className="searchable-dropdown-panel__option"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setEditingSimple(false);
                    onChange?.({
                      healthCheckMode: "advanced",
                      healthCheckDomain: null,
                    });
                    setOpen(false);
                  }}
                >
                  <span className="searchable-dropdown-panel__option-main">
                    <span
                      className="searchable-dropdown-panel__option-icon"
                      aria-hidden="true"
                    >
                      <HealthCheckIcon size={14} />
                    </span>
                    <span className="searchable-dropdown-panel__option-label">
                      Advanced
                    </span>
                  </span>
                  {mode === "advanced" ? (
                    <span
                      className="searchable-dropdown-panel__check"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
              <li role="presentation">
                {editingSimple ? (
                  <div className="project-health-check-panel__simple-edit">
                    <button
                      type="button"
                      className="project-health-check-panel__icon-btn"
                      aria-label="Cancel"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setEditingSimple(false);
                        setError(null);
                        setDomainDraft(domain ?? "");
                      }}
                    >
                      <XIcon size={14} />
                    </button>
                    <input
                      ref={inputRef}
                      type="text"
                      className="project-health-check-panel__domain-input"
                      value={domainDraft}
                      placeholder="quarrymill.com"
                      spellCheck={false}
                      autoComplete="off"
                      aria-label="Health check URL"
                      onChange={(event) => {
                        setDomainDraft(event.target.value);
                        setError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveSimpleDomain();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="project-health-check-panel__icon-btn"
                      aria-label="Save"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        saveSimpleDomain();
                      }}
                    >
                      <HealthCheckConfirmIcon size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    role="option"
                    aria-selected={mode === "simple"}
                    className="searchable-dropdown-panel__option"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setEditingSimple(true);
                      setDomainDraft(domain ?? "");
                      setError(null);
                    }}
                  >
                    <span className="searchable-dropdown-panel__option-main">
                      <span
                        className="searchable-dropdown-panel__option-icon"
                        aria-hidden="true"
                      >
                        <HealthCheckSimpleIcon size={14} />
                      </span>
                      <span className="searchable-dropdown-panel__option-label">
                        Simple
                      </span>
                    </span>
                    {mode === "simple" ? (
                      <span
                        className="searchable-dropdown-panel__check"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                )}
              </li>
            </ul>
            {error ? (
              <p className="project-health-check-panel__error">{error}</p>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      {...{ [TASK_PROPERTY_DROPDOWN_ATTRIBUTE]: "health" }}
      className={
        triggerVariant === "composePill"
          ? "property-dropdown property-dropdown--compose"
          : triggerVariant === "inlineChip"
            ? "property-dropdown property-dropdown--inline-chip"
            : "property-dropdown"
      }
    >
      <button
        type="button"
        id={triggerId}
        className={[
          "property-dropdown-trigger",
          triggerVariant === "composePill"
            ? "property-dropdown-trigger--compose"
            : null,
          triggerVariant === "inlineChip"
            ? "property-dropdown-trigger--inline-chip"
            : null,
          open ? "is-open" : null,
          muted ? "is-muted" : null,
          active ? "is-active" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        title={chipLabel}
        disabled={!canEdit}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Health check"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <span className="property-dropdown-trigger__icon" aria-hidden="true">
          <HealthCheckIcon size={14} />
        </span>
        <span className="property-dropdown-trigger__label">{chipLabel}</span>
      </button>
      {panel}
    </div>
  );
}
