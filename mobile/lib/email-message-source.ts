/** Parsed raw message source for the thread Source view. */
export type EmailMessageSourceHeader = { name: string; value: string };

export type EmailMessageSourceDetail = {
  sizeBytes: number;
  headers: EmailMessageSourceHeader[];
  raw: string;
};

export type EmailAuthenticationCheck = {
  method: "spf" | "dkim" | "dmarc";
  result: string;
  pass: boolean;
};

/**
 * Extract SPF / DKIM / DMARC verdicts from Authentication-Results headers.
 * Returns one entry per method (first verdict wins), in spf → dkim → dmarc order.
 */
export function parseEmailAuthenticationResults(
  headers: EmailMessageSourceHeader[],
): EmailAuthenticationCheck[] {
  const verdicts = new Map<EmailAuthenticationCheck["method"], string>();
  for (const header of headers) {
    const name = header.name.trim().toLowerCase();
    if (
      name !== "authentication-results" &&
      name !== "arc-authentication-results"
    ) {
      continue;
    }
    for (const match of header.value.matchAll(
      /\b(spf|dkim|dmarc)\s*=\s*([a-z]+)/gi,
    )) {
      const method = match[1]!.toLowerCase() as EmailAuthenticationCheck["method"];
      const result = match[2]!.toLowerCase();
      if (!verdicts.has(method)) verdicts.set(method, result);
    }
  }
  const order: EmailAuthenticationCheck["method"][] = ["spf", "dkim", "dmarc"];
  return order.flatMap((method) => {
    const result = verdicts.get(method);
    if (!result) return [];
    return [{ method, result, pass: result === "pass" }];
  });
}

/** "310.4 KB" style label for the raw source size. */
export function formatEmailSourceSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
