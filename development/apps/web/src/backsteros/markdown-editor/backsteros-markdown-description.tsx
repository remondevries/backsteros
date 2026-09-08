import { useEffect, useState, type ReactNode } from "react";

import "./markdown-editor.css";

import { BacksterosMarkdownPreview } from "./backsteros-markdown-preview";
import { DocumentMarkdownEditor } from "./document-markdown-editor";

export type BacksterosMarkdownDescriptionMode = "edit" | "preview";

export type BacksterosMarkdownDescriptionProps = {
  mode: BacksterosMarkdownDescriptionMode;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  emptyMessage?: string;
  placeholder?: string;
  /** Focus the editor when switching into edit mode. */
  focusOnEdit?: boolean;
  /** Desktop floating Preview/Edit dock (rendered inside the layout). */
  toggle?: ReactNode;
};

/**
 * Desktop-parity edit/preview shell for BacksterOS descriptions in BacksterDEV.
 * Borderless CodeMirror + shared preview typography (no form-field chrome).
 * Persistence is owned by the parent (debounced auto-save on change/blur).
 */
export function BacksterosMarkdownDescription({
  mode,
  value,
  onChange,
  onBlur,
  disabled,
  ariaLabel = "Description",
  emptyMessage = "Add a description…",
  placeholder = "Add a description…",
  focusOnEdit = true,
  toggle,
}: BacksterosMarkdownDescriptionProps) {
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (mode === "edit" && focusOnEdit) {
      setFocusRequest((n) => n + 1);
    }
  }, [focusOnEdit, mode]);

  const editor = (
    <div className="content-markdown-editor-column">
      <DocumentMarkdownEditor
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        ariaLabel={ariaLabel}
        focusRequest={focusRequest}
        scrollWithContent
        placeholder={placeholder}
      />
    </div>
  );

  const preview = (
    <div className="content-markdown-preview-column content-markdown-preview-column--no-top">
      {value.trim() ? (
        <BacksterosMarkdownPreview body={value} />
      ) : (
        <p className="overview-empty">{emptyMessage}</p>
      )}
    </div>
  );

  return (
    <div
      className="content-markdown-view-layout bos-task-description"
      data-mode={mode}
      data-content-view-mode={mode}
    >
      {mode === "edit" ? (
        <div className="content-markdown-view-layout__edit">{editor}</div>
      ) : (
        <div className="content-markdown-view-layout__preview">{preview}</div>
      )}
      {toggle}
    </div>
  );
}
