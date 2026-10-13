export type SuggestableOrganization = {
  id: string;
  name: string;
  key?: string | null;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Suggest an organization when payee/counterparty fuzzy-matches name or key.
 * Returns null when confidence is low (short tokens or no overlap).
 */
export function suggestOrganizationForPayee(
  payee: string,
  counterparty: string | null | undefined,
  organizations: SuggestableOrganization[],
): SuggestableOrganization | null {
  const haystack = normalize([payee, counterparty ?? ""].filter(Boolean).join(" "));
  if (haystack.length < 3 || organizations.length === 0) return null;

  let best: { org: SuggestableOrganization; score: number } | null = null;

  for (const org of organizations) {
    const name = normalize(org.name);
    const key = normalize(org.key ?? "");
    if (!name && !key) continue;

    let score = 0;
    if (name && (haystack.includes(name) || name.includes(haystack))) {
      score = Math.max(score, name.length);
    }
    if (key && key.length >= 3 && haystack.includes(key)) {
      score = Math.max(score, key.length + 1);
    }
    const tokens = name.split(" ").filter((t) => t.length >= 4);
    for (const token of tokens) {
      if (haystack.includes(token)) {
        score = Math.max(score, token.length);
      }
    }
    if (score >= 4 && (!best || score > best.score)) {
      best = { org, score };
    }
  }

  return best?.org ?? null;
}
