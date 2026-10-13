import { FileDiff, Plus } from "lucide-react";
import { ProjectsSidePanelIcon } from "@backsteros/ui";

export type DesktopTaskChangesSurface = {
  id: string;
  label: string;
};

export type DesktopTaskChangesCollapsedStripProps = {
  /** Linked commits as vertical tabs; empty → dashed ghost “Changes”. */
  surfaces: DesktopTaskChangesSurface[];
  activeId?: string | null;
  /** Show dashed + below commits when another link is allowed. */
  canAddSurface?: boolean;
  onExpand: () => void;
  onActivateSurface?: (id: string) => void;
  /** Expand and open the repo commit picker. */
  onAddSurface?: () => void;
};

/**
 * Narrow vertical strip while the Changes rail is collapsed — same chrome as
 * the old agent collapsed strip (panel toggle + vertical pills / dashed ghost).
 */
export function DesktopTaskChangesCollapsedStrip({
  surfaces,
  activeId = null,
  canAddSurface = false,
  onExpand,
  onActivateSurface,
  onAddSurface,
}: DesktopTaskChangesCollapsedStripProps) {
  const hasSurfaces = surfaces.length > 0;

  return (
    <div
      className="desktop-agent-collapsed-strip"
      role="toolbar"
      aria-label="Collapsed changes"
    >
      <button
        type="button"
        className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
        title="Show changes (])"
        aria-label="Show changes"
        onClick={onExpand}
      >
        <ProjectsSidePanelIcon size={16} collapsed rail="end" />
      </button>

      <div className="desktop-agent-collapsed-strip__tabs" role="tablist">
        {hasSurfaces
          ? surfaces.map((surface) => {
              const active = surface.id === activeId;
              return (
                <button
                  key={surface.id}
                  type="button"
                  role="tab"
                  className={[
                    "desktop-agent-surface-tab",
                    "desktop-agent-surface-tab--vertical",
                    active ? "is-active" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={`Show ${surface.label} (])`}
                  aria-label={`Show ${surface.label}`}
                  aria-selected={active}
                  onClick={() => {
                    onActivateSurface?.(surface.id);
                    onExpand();
                  }}
                >
                  <FileDiff
                    className="desktop-agent-surface-tab-icon"
                    size={14}
                    aria-hidden
                    strokeWidth={1.8}
                  />
                  <span className="desktop-agent-surface-tab-label">
                    {surface.label}
                  </span>
                </button>
              );
            })
          : (
            <button
              type="button"
              role="tab"
              className="desktop-agent-surface-tab desktop-agent-surface-tab--vertical is-ghost"
              title="Link a commit (])"
              aria-label="Link a commit"
              aria-selected={false}
              onClick={() => {
                onAddSurface?.();
                onExpand();
              }}
            >
              <FileDiff
                className="desktop-agent-surface-tab-icon"
                size={14}
                aria-hidden
                strokeWidth={1.8}
              />
              <span className="desktop-agent-surface-tab-label">Changes</span>
            </button>
          )}
        {hasSurfaces && canAddSurface ? (
          <button
            type="button"
            className="desktop-agent-surface-tab desktop-agent-surface-tab--vertical is-ghost"
            title="Link another commit"
            aria-label="Link another commit"
            onClick={() => {
              onAddSurface?.();
              onExpand();
            }}
          >
            <Plus
              className="desktop-agent-surface-tab-icon"
              size={14}
              aria-hidden
              strokeWidth={1.8}
            />
            <span className="desktop-agent-surface-tab-label">Add</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
