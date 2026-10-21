/** Minimal WebDAV / CardDAV XML helpers (multistatus). */

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type Propstat = {
  status: string;
  propsXml: string;
};

export type MultistatusResponse = {
  href: string;
  propstats: Propstat[];
};

export function multistatus(responses: MultistatusResponse[]): string {
  const body = responses
    .map((response) => {
      const propstats = response.propstats
        .map(
          (ps) => `<D:propstat>
      <D:prop>${ps.propsXml}</D:prop>
      <D:status>${xmlEscape(ps.status)}</D:status>
    </D:propstat>`,
        )
        .join("\n    ");
      return `<D:response>
    <D:href>${xmlEscape(response.href)}</D:href>
    ${propstats}
  </D:response>`;
    })
    .join("\n  ");
  return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav" xmlns:CS="http://calendarserver.org/ns/">
  ${body}
</D:multistatus>`;
}

export function parseRequestedProps(body: string): Set<string> {
  const props = new Set<string>();
  const propBlock = /<[^:>]*:?prop[^>]*>([\s\S]*?)<\/[^:>]*:?prop>/i.exec(body);
  const scope = propBlock?.[1] ?? body;
  const tagRe = /<([^:?\s>]+):?([A-Za-z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(scope))) {
    const local = (match[2] ?? match[1] ?? "").toLowerCase();
    if (local && local !== "prop" && local !== "propfind" && local !== "allprop") {
      props.add(local);
    }
  }
  if (props.size === 0 || /allprop/i.test(body)) {
    props.add("*");
  }
  return props;
}

export function wantsProp(requested: Set<string>, name: string): boolean {
  return requested.has("*") || requested.has(name.toLowerCase());
}
