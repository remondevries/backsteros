import type { WorkspaceIntegrationId } from "../../integrations/integration-catalog.js";
import { BrandfetchMarkIcon } from "../icons/brandfetch-mark-icon.js";
import { GithubMarkIcon } from "../icons/github-mark-icon.js";
import { GoogleCalendarMarkIcon } from "../icons/google-calendar-mark-icon.js";
import { MoneybirdIcon } from "../icons/moneybird-icon.js";
import { XaiMarkIcon } from "../icons/xai-mark-icon.js";

export type IntegrationMarkProps = {
  id: WorkspaceIntegrationId;
  faviconHost: string;
  /** Outer rail size in rem (default 2). */
  size?: "sm" | "md" | "lg";
};

function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

/** Brand mark / favicon tile shared by Integrations cards and settings modals. */
export function IntegrationMark({
  id,
  faviconHost,
  size = "sm",
}: IntegrationMarkProps) {
  const railClass = [
    "integrations-overview__icon-rail",
    `integrations-overview__icon-rail--size-${size}`,
    id === "github" ? "integrations-overview__icon-rail--github" : null,
    id === "moneybird" ? "integrations-overview__icon-rail--moneybird" : null,
    id === "mapbox" ? "integrations-overview__icon-rail--mapbox" : null,
    id === "brandfetch" ? "integrations-overview__icon-rail--brandfetch" : null,
    id === "chatwoot" ? "integrations-overview__icon-rail--chatwoot" : null,
    id === "whoop" ? "integrations-overview__icon-rail--whoop" : null,
    id === "auto-review" ? "integrations-overview__icon-rail--auto-review" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const markSize = size === "lg" ? 28 : size === "md" ? 24 : 20;

  return (
    <div className={railClass} aria-hidden="true">
      {id === "github" ? (
        <GithubMarkIcon
          size={size === "sm" ? 24 : markSize}
          className="integrations-overview__mark-icon"
        />
      ) : id === "moneybird" ? (
        <MoneybirdIcon
          size={size === "sm" ? 20 : markSize}
          withTile={false}
          className="integrations-overview__mark-icon"
        />
      ) : id === "brandfetch" ? (
        <BrandfetchMarkIcon
          size={size === "sm" ? 24 : markSize}
          className="integrations-overview__mark-icon"
        />
      ) : id === "google-calendar" ? (
        <GoogleCalendarMarkIcon
          size={size === "sm" ? 32 : size === "md" ? 40 : 48}
          className="integrations-overview__mark-icon"
        />
      ) : id === "auto-review" ? (
        <XaiMarkIcon
          size={size === "sm" ? 22 : markSize}
          className="integrations-overview__mark-icon"
        />
      ) : (
        <img
          alt=""
          className="integrations-overview__favicon"
          src={faviconUrl(faviconHost)}
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
}
