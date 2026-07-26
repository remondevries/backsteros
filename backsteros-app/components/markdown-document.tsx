"use client";

import { markdown } from "@codemirror/lang-markdown";
import { vim } from "@replit/codemirror-vim";
import CodeMirror from "@uiw/react-codemirror";
import { Children, isValidElement, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getTaskListItemChecked,
  MarkdownTaskCheckbox,
  MarkdownTaskListInteractProvider,
  normalizeMarkdownTaskLists,
} from "@backsteros/ui";

export function MarkdownDocument({
  value,
  saving,
  onSave,
}: {
  value: string;
  saving: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [vimEnabled, setVimEnabled] = useState(true);

  return (
    <section className="markdown-document">
      <div className="document-toolbar">
        <div className="segmented-control">
          <button className={mode === "edit" ? "is-active" : ""} onClick={() => setMode("edit")}>Edit</button>
          <button className={mode === "preview" ? "is-active" : ""} onClick={() => setMode("preview")}>Preview</button>
        </div>
        <label className="vim-toggle">
          <input type="checkbox" checked={vimEnabled} onChange={(event) => setVimEnabled(event.target.checked)} />
          Vim
        </label>
        <button className="primary-action" disabled={saving || draft === value} onClick={() => onSave(draft)}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {mode === "edit" ? (
        <CodeMirror
          value={draft}
          minHeight="420px"
          extensions={[markdown(), ...(vimEnabled ? [vim()] : [])]}
          onChange={setDraft}
          theme="dark"
          basicSetup={{ lineNumbers: false, foldGutter: false }}
        />
      ) : (
        <article className="markdown-preview document-markdown">
          {draft ? (
            <MarkdownTaskListInteractProvider
              body={draft}
              onChange={(next) => {
                setDraft(next);
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                li(props) {
                  const { children, className, ...rest } = props;
                  const checked = getTaskListItemChecked(props);
                  const isTaskItem =
                    typeof checked === "boolean" ||
                    (typeof className === "string" &&
                      className.includes("task-list-item"));
                  if (!isTaskItem) {
                    return (
                      <li className={className} {...rest}>
                        {children}
                      </li>
                    );
                  }
                  const body = Children.toArray(children).filter((child) => {
                    if (!isValidElement(child)) return true;
                    return child.type !== "input";
                  });
                  return (
                    <li
                      className={[className, "task-list-item"]
                        .filter(Boolean)
                        .join(" ")}
                      {...rest}
                    >
                      <MarkdownTaskCheckbox checked={checked === true} />
                      <span className="md-task-checkbox__content">{body}</span>
                    </li>
                  );
                },
                  input(props) {
                    if (props.type === "checkbox") {
                      return null;
                    }
                    return <input {...props} />;
                  },
                }}
              >
                {normalizeMarkdownTaskLists(draft)}
              </ReactMarkdown>
            </MarkdownTaskListInteractProvider>
          ) : (
            <p className="muted">This document is empty.</p>
          )}
        </article>
      )}
    </section>
  );
}
