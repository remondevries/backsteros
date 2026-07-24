"use client";

import { useEffect, useRef, useState } from "react";

import { ComposeFolderIcon } from "@backsteros/ui";

import { DirectoryPickerModal } from "@/components/directory-picker-modal";
import { apiErrorMessage } from "@/lib/api-context";

/**
 * Centered empty state when a project has no local working directory.
 * Replaces the terminal until the user picks a folder.
 */
export function TerminalDirectoryGate({
  onSelectDirectory,
}: {
  onSelectDirectory: (directory: string) => void | Promise<void>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gateRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // #region agent log
  useEffect(() => {
    const gate = gateRef.current;
    const button = buttonRef.current;
    const gateStyle = gate ? getComputedStyle(gate) : null;
    const buttonStyle = button ? getComputedStyle(button) : null;
    const icon = button?.querySelector("svg") ?? null;
    const iconStyle = icon ? getComputedStyle(icon) : null;
    fetch("http://127.0.0.1:7376/ingest/5f7ef8e1-42a2-490c-b746-4355365451a0", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "cb7a52",
      },
      body: JSON.stringify({
        sessionId: "cb7a52",
        runId: "style-debug",
        hypothesisId: "H6-H9",
        location: "terminal-directory-gate.tsx:styles",
        message: "Gate computed styles",
        data: {
          gateRect: gate?.getBoundingClientRect().toJSON?.() ?? null,
          gateDisplay: gateStyle?.display ?? null,
          gateFlex: gateStyle?.flex ?? null,
          gateBg: gateStyle?.backgroundColor ?? null,
          gateJustify: gateStyle?.justifyContent ?? null,
          buttonBorder: buttonStyle?.border ?? null,
          buttonBg: buttonStyle?.backgroundColor ?? null,
          buttonPadding: buttonStyle?.padding ?? null,
          iconClass: icon?.getAttribute("class") ?? null,
          iconWidth: iconStyle?.width ?? null,
          iconColor: iconStyle?.color ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, []);
  // #endregion

  return (
    <section className="console-pane console-pane--terminal">
      <div className="console-pane-header console-pane-header--terminal">
        <div className="console-pane-header-title">
          <span>Terminal</span>
        </div>
      </div>
      <div className="terminal-frame">
        <div ref={gateRef} className="terminal-stage terminal-directory-gate">
          <p className="terminal-directory-gate__copy">
            The terminal is unavailable until a working directory is defined for
            this project.
          </p>
          <button
            ref={buttonRef}
            type="button"
            className="console-btn console-btn--primary terminal-directory-gate__button"
            disabled={saving}
            onClick={() => {
              setError(null);
              setPickerOpen(true);
            }}
          >
            <ComposeFolderIcon />
            Define working directory
          </button>
          {error ? (
            <p className="terminal-directory-gate__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <DirectoryPickerModal
        open={pickerOpen}
        initialPath={null}
        onClose={() => setPickerOpen(false)}
        onSelect={(next) => {
          setPickerOpen(false);
          setSaving(true);
          setError(null);
          void Promise.resolve(onSelectDirectory(next))
            .catch((err) => {
              // #region agent log
              fetch(
                "http://127.0.0.1:7376/ingest/5f7ef8e1-42a2-490c-b746-4355365451a0",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Debug-Session-Id": "cb7a52",
                  },
                  body: JSON.stringify({
                    sessionId: "cb7a52",
                    runId: "post-fix",
                    hypothesisId: "H400",
                    location: "terminal-directory-gate.tsx:save-error",
                    message: "Failed to persist working directory",
                    data: {
                      status:
                        err && typeof err === "object" && "status" in err
                          ? (err as { status: unknown }).status
                          : null,
                      message: apiErrorMessage(err),
                    },
                    timestamp: Date.now(),
                  }),
                },
              ).catch(() => {});
              // #endregion
              setError(
                apiErrorMessage(err) ||
                  "Could not save working directory. Deploy the API update (migration 0018) or point NEXT_PUBLIC_API_URL at a local API that has it.",
              );
            })
            .finally(() => {
              setSaving(false);
            });
        }}
      />
    </section>
  );
}
