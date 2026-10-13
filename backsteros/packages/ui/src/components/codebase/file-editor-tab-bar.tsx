function fileTabLabel(path: string): string {
  return path.split("/").pop() || path;
}

function FileTabCloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3l6 6M9 3L3 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FileTabIcon() {
  return (
    <svg
      className="console-file-tab-icon"
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3.75 1.5A1.75 1.75 0 0 0 2 3.25v9.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0 0 14 12.75v-7.5a.75.75 0 0 0-.22-.53L9.28 1.72a.75.75 0 0 0-.53-.22H3.75Zm5.53 1.5 3.22 3.22H10.5a1 1 0 0 1-1-1V3Z" />
    </svg>
  );
}

export function FileEditorTabBar({
  openPaths,
  activePath,
  dirtyPaths = [],
  onActivate,
  onClose,
}: {
  openPaths: string[];
  activePath: string | null;
  dirtyPaths?: string[];
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
}) {
  if (openPaths.length === 0) return null;

  const dirtySet = new Set(dirtyPaths);

  return (
    <div className="console-file-tab-bar" role="tablist" aria-label="Open files">
      {openPaths.map((path, index) => {
        const active = path === activePath;
        const dirty = dirtySet.has(path);
        const label = fileTabLabel(path);
        const hasTabsToRight = index < openPaths.length - 1;

        return (
          <div
            key={path}
            className={`console-file-tab-width${active ? " is-active" : ""}`}
          >
            <div
              role="tab"
              tabIndex={0}
              aria-selected={active}
              title={path}
              className={`console-file-tab group${active ? " is-active" : ""}${
                hasTabsToRight ? " has-border-right" : ""
              }`}
              onClick={() => onActivate(path)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onActivate(path);
                }
              }}
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                }
              }}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose(path);
                }
              }}
            >
              {active ? (
                <span className="console-file-tab-active-bar" aria-hidden="true" />
              ) : null}
              <FileTabIcon />
              <span className="console-file-tab-label">{label}</span>
              <div className="console-file-tab-trailing">
                {dirty ? (
                  <span
                    className="console-file-tab-dirty"
                    aria-label="Unsaved changes"
                  />
                ) : null}
                <button
                  type="button"
                  className={`console-file-tab-close${
                    dirty ? " is-dirty" : ""
                  }${active ? " is-active-tab" : ""}`}
                  aria-label={`Close ${label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(path);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <FileTabCloseIcon />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
