"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { TaskLink } from "@backsteros/contracts";

import { ProjectOcticon } from "./project-octicon.js";

const MAX_TASK_LINKS = 20;

export type TaskLinkAttachmentsProps = {
  links?: TaskLink[] | null;
  onChangeLinks?: (links: TaskLink[]) => void;
  readOnly?: boolean;
};

export function normalizeTaskLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function isGithubTaskLinkUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "github.com" || host.endsWith(".github.com");
  } catch {
    return false;
  }
}

export function taskLinkDisplayLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

function createTaskLinkId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `link_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function TaskLinkFavicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return <ProjectOcticon icon="link" size={16} />;
  }

  if (failed || !host) {
    return <ProjectOcticon icon="link" size={16} />;
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
      alt=""
      width={16}
      height={16}
      className="task-link-attachments__favicon"
      onError={() => setFailed(true)}
    />
  );
}

export function TaskLinkIcon({ url }: { url: string }): ReactNode {
  if (isGithubTaskLinkUrl(url)) {
    return <ProjectOcticon icon="mark-github" size={16} />;
  }
  return <TaskLinkFavicon url={url} />;
}

function PaperclipIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"
      />
    </svg>
  );
}

export function TaskLinkAttachments({
  links,
  onChangeLinks,
  readOnly = false,
}: TaskLinkAttachmentsProps) {
  const remoteLinks = links ?? [];
  const remoteKey = JSON.stringify(remoteLinks);
  const [items, setItems] = useState(remoteLinks);
  const [itemsSourceKey, setItemsSourceKey] = useState(remoteKey);
  if (remoteKey !== itemsSourceKey) {
    setItemsSourceKey(remoteKey);
    setItems(remoteLinks);
  }

  const canEdit = Boolean(onChangeLinks) && !readOnly;
  const [modalOpen, setModalOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setDraftUrl("");
    setFormError(null);
  }, []);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [closeModal, modalOpen]);

  function handleRemove(id: string) {
    if (!onChangeLinks) {
      return;
    }
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    onChangeLinks(next);
  }

  function handleSave(event?: FormEvent) {
    event?.preventDefault();
    if (!onChangeLinks) {
      return;
    }
    if (items.length >= MAX_TASK_LINKS) {
      setFormError(`You can attach up to ${MAX_TASK_LINKS} links.`);
      return;
    }
    const normalized = normalizeTaskLinkUrl(draftUrl);
    if (!normalized) {
      setFormError("Enter a valid URL.");
      return;
    }
    if (items.some((item) => item.url === normalized)) {
      setFormError("This link is already attached.");
      return;
    }
    const next = [
      ...items,
      {
        id: createTaskLinkId(),
        url: normalized,
        createdAt: new Date().toISOString(),
      },
    ];
    setItems(next);
    onChangeLinks(next);
    closeModal();
  }

  return (
    <div className="task-detail-attachments task-link-attachments">
      {items.length > 0 ? (
        <ul className="task-link-attachments__list">
          {items.map((item) => (
            <li key={item.id} className="task-link-attachments__row">
              <span className="task-link-attachments__icon" aria-hidden="true">
                <TaskLinkIcon url={item.url} />
              </span>
              <a
                className="task-link-attachments__label"
                href={item.url}
                target="_blank"
                rel="noreferrer"
                title={item.url}
              >
                {taskLinkDisplayLabel(item.url)}
              </a>
              {canEdit ? (
                <button
                  type="button"
                  className="task-link-attachments__remove"
                  aria-label="Remove link"
                  onClick={() => handleRemove(item.id)}
                >
                  <ProjectOcticon icon="x" size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canEdit ? (
        <div className="task-link-attachments__toolbar">
          <button
            type="button"
            className="task-link-attachments__add"
            aria-label="Add attachment"
            title="Add attachment"
            onClick={() => {
              setDraftUrl("");
              setFormError(null);
              setModalOpen(true);
            }}
          >
            <PaperclipIcon />
          </button>
        </div>
      ) : null}

      {modalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="entity-delete-modal-root"
              data-blocking-modal=""
              data-task-link-modal=""
            >
              <button
                type="button"
                aria-label="Cancel"
                className="entity-delete-modal-backdrop"
                onClick={closeModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="entity-delete-modal task-link-attachments-modal"
              >
                <h2 id={titleId} className="entity-delete-modal-title">
                  Add attachment
                </h2>
                <p className="entity-delete-modal-body">
                  Paste a link to attach it to this task.
                </p>
                <form
                  className="task-link-attachments-modal__form"
                  onSubmit={handleSave}
                >
                  <label className="task-link-attachments-modal__label">
                    <span className="sr-only">URL</span>
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="https://…"
                      value={draftUrl}
                      onChange={(event) => {
                        setDraftUrl(event.target.value);
                        if (formError) {
                          setFormError(null);
                        }
                      }}
                      className="task-link-attachments-modal__input"
                    />
                  </label>
                  {formError ? (
                    <p className="entity-delete-modal-error" role="alert">
                      {formError}
                    </p>
                  ) : null}
                  <div className="entity-delete-modal-actions">
                    <button
                      type="button"
                      className="entity-delete-modal-cancel"
                      onClick={closeModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="entity-delete-modal-confirm"
                    >
                      Save
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
