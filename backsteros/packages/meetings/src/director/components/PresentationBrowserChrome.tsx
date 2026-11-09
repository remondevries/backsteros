import type { FormEvent, ReactNode } from "react";

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M21.074 12.154a.75.75 0 0 1 .672.82c-.49 4.93-4.658 8.776-9.724 8.776-2.724 0-5.364-.933-7.238-2.68L3 20.85a.75.75 0 0 1-.75-.75v-3.96c0-.714.58-1.29 1.291-1.29h3.97a.75.75 0 0 1 .75.75l-2.413 2.407c1.558 1.433 3.78 2.243 6.174 2.243 4.29 0 7.817-3.258 8.232-7.424a.75.75 0 0 1 .82-.672m-18.82-1.128c.49-4.93 4.658-8.776 9.724-8.776 2.724 0 5.364.933 7.238 2.68L21 3.15a.75.75 0 0 1 .75.75v3.96c0 .714-.58 1.29-1.291 1.29h-3.97a.75.75 0 0 1-.75-.75l2.413-2.408c-1.558-1.432-3.78-2.242-6.174-2.242-4.29 0-7.817 3.258-8.232 7.424a.75.75 0 1 1-1.492-.148" />
    </svg>
  );
}

type PresentationBrowserChromeProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onReload: () => void;
  canReload: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  placeholder?: string;
  extraActions?: ReactNode;
};

export function PresentationBrowserChrome({
  draft,
  onDraftChange,
  onSubmit,
  onReload,
  canReload,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  placeholder = "https://example.com",
  extraActions,
}: PresentationBrowserChromeProps) {
  return (
    <header className="director__presentation-float-bar">
      <form className="director__presentation-url-form" onSubmit={onSubmit}>
        <button
          type="button"
          className="director__presentation-nav-btn"
          disabled={!canGoBack}
          onClick={onBack}
          aria-label="Back"
        >
          ←
        </button>
        <button
          type="button"
          className="director__presentation-nav-btn"
          disabled={!canGoForward}
          onClick={onForward}
          aria-label="Forward"
        >
          →
        </button>
        <div className="director__presentation-url-field">
          <input
            type="url"
            className="director__presentation-url-input"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Presentation URL"
          />
          <button
            type="button"
            className="director__presentation-url-reload"
            disabled={!canReload}
            onClick={onReload}
            aria-label="Reload"
            title="Reload"
          >
            <RefreshIcon />
          </button>
        </div>
        {extraActions}
      </form>
    </header>
  );
}
