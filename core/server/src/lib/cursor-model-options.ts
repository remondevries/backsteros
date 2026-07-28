import type {
  ModelListItem,
  ModelParameterValue,
  ModelSelection,
} from "@cursor/sdk";

export type CursorModelOption = {
  id: string;
  displayName: string;
};

/** Stable id used in settings when the catalog omits the Fast variant entry. */
export const COMPOSER_2_5_FAST_ID = "composer-2.5-fast";
export const COMPOSER_2_5_FAST_DISPLAY_NAME = "Composer 2.5 Fast";

const COMPOSER_2_5_ID = "composer-2.5";

/**
 * Encode a model + optional params into the string stored as spellcheck/research
 * model preference. Base ids stay unchanged; params use `id:key=value;…`.
 */
export function encodeModelSelection(selection: ModelSelection): string {
  const id = selection.id.trim() || "auto";
  const params = selection.params?.filter((p) => p.id.trim()) ?? [];
  if (params.length === 0) return id;
  const encoded = params
    .map(
      (p) =>
        `${encodeURIComponent(p.id.trim())}=${encodeURIComponent(p.value)}`,
    )
    .join(";");
  return `${id}:${encoded}`;
}

export function decodeModelSelection(raw: string): ModelSelection {
  const trimmed = raw.trim() || "auto";
  if (trimmed === COMPOSER_2_5_FAST_ID) {
    return {
      id: COMPOSER_2_5_ID,
      params: [{ id: "fast", value: "true" }],
    };
  }
  const colon = trimmed.indexOf(":");
  if (colon <= 0) return { id: trimmed };
  const id = trimmed.slice(0, colon).trim() || "auto";
  const rest = trimmed.slice(colon + 1);
  if (!rest) return { id };
  const params: ModelParameterValue[] = [];
  for (const part of rest.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const paramId = decodeURIComponent(part.slice(0, eq));
    const value = decodeURIComponent(part.slice(eq + 1));
    if (!paramId) continue;
    params.push({ id: paramId, value });
  }
  return params.length > 0 ? { id, params } : { id };
}

/** Flatten SDK catalog entries (including variants) into dropdown options. */
export function cursorModelOptionsFromCatalog(
  models: readonly ModelListItem[],
): CursorModelOption[] {
  const options: CursorModelOption[] = [];
  const seen = new Set<string>();

  const push = (id: string, displayName: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    options.push({ id, displayName: displayName || id });
  };

  for (const model of models) {
    const baseId = model.id?.trim();
    if (!baseId) continue;
    if (model.variants && model.variants.length > 0) {
      for (const variant of model.variants) {
        const selection: ModelSelection = {
          id: baseId,
          params: variant.params,
        };
        // Prefer the product alias for Composer 2.5 Fast.
        const isComposerFast =
          baseId === COMPOSER_2_5_ID &&
          variant.params?.some((p) => p.id === "fast" && p.value === "true");
        const id = isComposerFast
          ? COMPOSER_2_5_FAST_ID
          : encodeModelSelection(selection);
        push(id, variant.displayName || model.displayName || baseId);
      }
    } else {
      push(baseId, model.displayName || baseId);
    }
  }

  ensureComposer25FastOption(options, seen);
  return options;
}

function ensureComposer25FastOption(
  options: CursorModelOption[],
  seen: Set<string>,
): void {
  if (seen.has(COMPOSER_2_5_FAST_ID)) return;
  // Also skip if a variant already labelled the same way under another id.
  if (
    options.some(
      (o) =>
        o.displayName.trim().toLowerCase() ===
        COMPOSER_2_5_FAST_DISPLAY_NAME.toLowerCase(),
    )
  ) {
    return;
  }

  const option: CursorModelOption = {
    id: COMPOSER_2_5_FAST_ID,
    displayName: COMPOSER_2_5_FAST_DISPLAY_NAME,
  };
  const after = options.findIndex(
    (o) => o.id === COMPOSER_2_5_ID || o.id.startsWith(`${COMPOSER_2_5_ID}:`),
  );
  if (after >= 0) {
    options.splice(after + 1, 0, option);
  } else {
    options.push(option);
  }
  seen.add(COMPOSER_2_5_FAST_ID);
}
