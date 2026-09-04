"use client";

import { useState, type ReactNode } from "react";

import { isInternalAppHref } from "../../navigation/is-internal-app-href.js";
import { ClientLink } from "../../shared/client-link.js";
import type { ParsedNamedLinkToken } from "../../mentions/named-link-tokens.js";
import { faviconHostForNamedLinkUrl } from "../../mentions/named-link-tokens.js";
import { EmailNavIcon } from "../shell/sidebar-nav-icons.js";
import { ProjectOcticon } from "../projects/project-octicon.js";

function NamedLinkFavicon({ url }: { url: string }): ReactNode {
  const [failed, setFailed] = useState(false);
  const host = faviconHostForNamedLinkUrl(url);

  if (failed || !host) {
    return <ProjectOcticon icon="link" size={14} />;
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
      alt=""
      width={14}
      height={14}
      className="named-link-chip__favicon"
      onError={() => setFailed(true)}
    />
  );
}

export function NamedLinkChipIcon({
  token,
}: {
  token: ParsedNamedLinkToken;
}): ReactNode {
  if (token.kind === "spark-email") {
    return <EmailNavIcon size={14} />;
  }
  return <NamedLinkFavicon url={token.url} />;
}

/**
 * Inline label chip for Spark-style `[url|label]` tokens — same chrome as
 * `@` mention chips. Spark email URLs use a blue EmailNavIcon; others use
 * the site favicon.
 */
export function NamedLinkChip({ token }: { token: ParsedNamedLinkToken }) {
  const className = [
    "mention-chip-lite",
    "mention-chip-lite--link",
    "named-link-chip",
    token.kind === "spark-email" ? "named-link-chip--spark-email" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      <span className="mention-chip-lite__icon" aria-hidden="true">
        <NamedLinkChipIcon token={token} />
      </span>
      <span className="mention-chip-lite__label">{token.label}</span>
    </>
  );

  if (isInternalAppHref(token.url)) {
    return (
      <ClientLink href={token.url} className={className} title={token.url}>
        {body}
      </ClientLink>
    );
  }

  return (
    <a
      href={token.url}
      className={className}
      title={token.url}
      target={/^https?:/i.test(token.url) ? "_blank" : undefined}
      rel={/^https?:/i.test(token.url) ? "noreferrer" : undefined}
    >
      {body}
    </a>
  );
}
