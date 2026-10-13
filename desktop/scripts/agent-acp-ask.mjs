/**
 * Cursor ACP ask_question summarization (T3-aligned).
 * Shared by the ACP manager (live + replay) and unit tests.
 */

/**
 * @param {unknown} raw
 * @returns {{ id: string, label: string }[]}
 */
function mapAskOptions(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {{ id: string, label: string }[]} */
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const opt = /** @type {Record<string, unknown>} */ (entry);
    const id = String(opt.id || opt.optionId || opt.value || "").trim();
    if (!id) continue;
    out.push({
      id,
      label: String(opt.label || opt.name || opt.text || id),
    });
  }
  return out;
}

/**
 * @param {Record<string, unknown>} q
 */
function isMultiSelect(q) {
  return (
    q.multiSelect === true ||
    q.allow_multiple === true ||
    q.allowMultiple === true
  );
}

/**
 * Normalize one Cursor ask question — empty options get a default OK (T3).
 * @param {unknown} entry
 * @param {number} index
 */
export function normalizeAskQuestionEntry(entry, index = 0) {
  if (!entry || typeof entry !== "object") {
    return {
      id: `q-${index}`,
      prompt: "Question",
      options: [{ id: "ok", label: "OK" }],
      multiSelect: false,
    };
  }
  const q = /** @type {Record<string, unknown>} */ (entry);
  let options = mapAskOptions(q.options);
  if (options.length === 0) {
    options = [{ id: "ok", label: "OK" }];
  }
  return {
    id: String(q.id ?? q.questionId ?? `q-${index}`),
    prompt: String(q.prompt ?? q.question ?? q.text ?? "Question"),
    multiSelect: isMultiSelect(q),
    options,
  };
}

/**
 * @param {unknown} params
 * @returns {{
 *   title: string,
 *   detail: string | null,
 *   options: { id: string, label: string }[],
 *   questions: ReturnType<typeof normalizeAskQuestionEntry>[],
 * }}
 */
export function summarizeAskQuestion(params) {
  const p = params && typeof params === "object" ? params : {};
  const questionsRaw = Array.isArray(
    /** @type {{ questions?: unknown }} */ (p).questions,
  )
    ? /** @type {unknown[]} */ (
        /** @type {{ questions?: unknown }} */ (p).questions
      )
    : [];
  const questions = questionsRaw.map((entry, index) =>
    normalizeAskQuestionEntry(entry, index),
  );
  const first = questions[0] ?? null;
  const title = first?.prompt || "Agent question";
  const options = first?.options ?? [];
  return {
    title,
    detail: questions.length > 1 ? `${questions.length} questions` : null,
    options,
    questions,
  };
}
