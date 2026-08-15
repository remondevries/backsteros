import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  formatAgentModelTriggerLabel,
  normalizeAgentChatModelId,
  readAgentChatModelId,
  writeAgentChatModelId,
  type AgentChatModelOption,
} from "../lib/agent/agent-chat-model";
import { listCursorAgentModels } from "../lib/pty";

export type DesktopAgentModelPickerProps = {
  disabled?: boolean;
  /** Effective model for this chat (session pin or global preference). */
  value?: string;
  onModelChange?: (modelId: string) => void;
};

function ModelChevronIcon() {
  return (
    <svg
      className="desktop-agent-chat__model-chevron"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <path
        d="M3 4.5 6 7.5 9 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * T3-inspired model chip + searchable popover for the agent chat composer.
 */
export function DesktopAgentModelPicker({
  disabled = false,
  value,
  onModelChange,
}: DesktopAgentModelPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<AgentChatModelOption[]>([
    { id: "auto", displayName: "Auto" },
  ]);
  const selectedId = normalizeAgentChatModelId(value ?? readAgentChatModelId());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => models.find((m) => m.id === selectedId) ?? null,
    [models, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q),
    );
  }, [models, query]);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listCursorAgentModels();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setModels(result.models);
    const current = normalizeAgentChatModelId(
      value ?? readAgentChatModelId(),
    );
    if (!result.models.some((m) => m.id === current) && current !== "auto") {
      // Keep unknown ids visible via fallback label; only reset global if
      // this picker is showing the global preference (no controlled value).
      if (value == null) {
        writeAgentChatModelId("auto");
        onModelChange?.("auto");
      }
    }
  }, [onModelChange, value]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setQuery("");
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectModel = useCallback(
    (id: string) => {
      const next = normalizeAgentChatModelId(id);
      writeAgentChatModelId(next);
      setOpen(false);
      setQuery("");
      onModelChange?.(next);
    },
    [onModelChange],
  );

  const triggerLabel = formatAgentModelTriggerLabel(selected, selectedId);

  return (
    <div
      ref={rootRef}
      className={`desktop-agent-chat__model-picker${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="desktop-agent-chat__model-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${triggerLabel}`}
        title={selected?.displayName || selectedId}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          if (!open) void loadModels();
        }}
      >
        <span className="desktop-agent-chat__model-trigger-label">
          {triggerLabel}
        </span>
        <ModelChevronIcon />
      </button>

      {open ? (
        <div
          className="desktop-agent-chat__model-popover"
          role="listbox"
          aria-label="Select model"
        >
          <div className="desktop-agent-chat__model-search">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models…"
              className="desktop-agent-chat__model-search-input"
              aria-label="Search models"
            />
          </div>
          <div className="desktop-agent-chat__model-list">
            {loading && models.length <= 1 ? (
              <p className="desktop-agent-chat__model-empty">Loading…</p>
            ) : null}
            {error && filtered.length === 0 ? (
              <p className="desktop-agent-chat__model-empty">{error}</p>
            ) : null}
            {!loading && !error && filtered.length === 0 ? (
              <p className="desktop-agent-chat__model-empty">No models found</p>
            ) : null}
            {filtered.map((model) => {
              const active = model.id === selectedId;
              return (
                <button
                  key={model.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`desktop-agent-chat__model-option${
                    active ? " is-selected" : ""
                  }`}
                  onClick={() => selectModel(model.id)}
                >
                  <span className="desktop-agent-chat__model-option-name">
                    {formatAgentModelTriggerLabel(model)}
                  </span>
                  <span className="desktop-agent-chat__model-option-id">
                    {model.id}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
