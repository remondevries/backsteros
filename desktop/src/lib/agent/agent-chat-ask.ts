/**
 * T3-aligned pending user-input helpers (see pendingUserInput.ts / ComposerPendingUserInputPanel).
 * UI drafts stay label-based; ACP wire answers use Cursor docs selectedOptionIds.
 */

export type AskAnswerWireRow = {
  questionId: string;
  selectedOptionIds: string[];
};

export type AskQuestionOption = {
  id: string;
  label: string;
};

export type AskQuestionItem = {
  id: string;
  prompt: string;
  /** Optional ACP/T3 section header shown above the prompt. */
  header?: string;
  options: AskQuestionOption[];
  multiSelect?: boolean;
};

/** T3 PendingUserInputDraftAnswer — labels + optional free-text. */
export type AskQuestionDraft = {
  selectedOptionLabels?: string[];
  customAnswer?: string;
};

export type AskQuestionProgress = {
  questionIndex: number;
  activeQuestion: AskQuestionItem | null;
  selectedOptionLabels: string[];
  customAnswer: string;
  answeredCount: number;
  isLastQuestion: boolean;
  isComplete: boolean;
  canAdvance: boolean;
};

function normalizeLabels(labels: readonly string[] | undefined): string[] {
  if (!labels || labels.length === 0) return [];
  const out: string[] = [];
  for (const label of labels) {
    const trimmed = label.trim();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return Array.from(new Set(out));
}

export function normalizeAskQuestions(raw: unknown): AskQuestionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AskQuestionItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const q = entry as Record<string, unknown>;
    const id = String(q.id ?? q.questionId ?? `q-${out.length}`);
    const prompt = String(q.prompt ?? q.question ?? q.text ?? "").trim();
    if (!prompt) continue;
    const header = String(q.header ?? q.title ?? "").trim();
    const optionsRaw = Array.isArray(q.options) ? q.options : [];
    const options: AskQuestionOption[] = [];
    for (const opt of optionsRaw) {
      if (!opt || typeof opt !== "object") continue;
      const o = opt as Record<string, unknown>;
      const label = String(o.label ?? o.name ?? o.text ?? "").trim();
      const optionId = String(o.id ?? o.optionId ?? o.value ?? label).trim();
      if (!optionId && !label) continue;
      options.push({
        id: optionId || label,
        label: label || optionId,
      });
    }
    if (options.length === 0) {
      options.push({ id: "ok", label: "OK" });
    }
    out.push({
      id,
      prompt,
      ...(header ? { header } : {}),
      options,
      multiSelect:
        q.multiSelect === true ||
        q.allow_multiple === true ||
        q.allowMultiple === true,
    });
  }
  return out;
}

export function resolveAskAnswer(
  question: AskQuestionItem,
  draft: AskQuestionDraft | undefined,
): string | string[] | null {
  const custom = (draft?.customAnswer ?? "").trim();
  if (custom) return custom;
  const selected = normalizeLabels(draft?.selectedOptionLabels);
  if (question.multiSelect) {
    return selected.length > 0 ? selected : null;
  }
  return selected[0] ?? null;
}

/** Toggle an option by label (T3). Clears customAnswer. */
export function toggleAskOption(
  question: AskQuestionItem,
  draft: AskQuestionDraft | undefined,
  optionLabel: string,
): AskQuestionDraft {
  const label = optionLabel.trim();
  if (!label) {
    return {
      customAnswer: "",
      selectedOptionLabels: normalizeLabels(draft?.selectedOptionLabels),
    };
  }
  if (question.multiSelect) {
    const selected = normalizeLabels(draft?.selectedOptionLabels);
    const next = selected.includes(label)
      ? selected.filter((entry) => entry !== label)
      : [...selected, label];
    return {
      customAnswer: "",
      ...(next.length > 0 ? { selectedOptionLabels: next } : {}),
    };
  }
  return {
    customAnswer: "",
    selectedOptionLabels: [label],
  };
}

/** Typing a custom answer clears option selection (T3). */
export function setAskCustomAnswer(
  draft: AskQuestionDraft | undefined,
  customAnswer: string,
): AskQuestionDraft {
  const trimmed = customAnswer;
  if (trimmed.trim().length > 0) {
    return { customAnswer: trimmed };
  }
  const selected = normalizeLabels(draft?.selectedOptionLabels);
  return {
    customAnswer: "",
    ...(selected.length > 0 ? { selectedOptionLabels: selected } : {}),
  };
}

export function deriveAskProgress(
  questions: readonly AskQuestionItem[],
  drafts: Record<string, AskQuestionDraft>,
  questionIndex: number,
): AskQuestionProgress {
  const bounded =
    questions.length === 0
      ? 0
      : Math.max(0, Math.min(questionIndex, questions.length - 1));
  const activeQuestion = questions[bounded] ?? null;
  const activeDraft = activeQuestion ? drafts[activeQuestion.id] : undefined;
  const selectedOptionLabels = activeQuestion
    ? normalizeLabels(activeDraft?.selectedOptionLabels)
    : [];
  const customAnswer = activeDraft?.customAnswer ?? "";
  const answeredCount = questions.reduce((count, question) => {
    return resolveAskAnswer(question, drafts[question.id]) ? count + 1 : count;
  }, 0);
  const isComplete =
    questions.length > 0 &&
    questions.every((question) => resolveAskAnswer(question, drafts[question.id]));
  const canAdvance = activeQuestion
    ? resolveAskAnswer(activeQuestion, activeDraft) != null
    : false;

  return {
    questionIndex: bounded,
    activeQuestion,
    selectedOptionLabels,
    customAnswer,
    answeredCount,
    isLastQuestion:
      questions.length === 0 ? true : bounded >= questions.length - 1,
    isComplete,
    canAdvance,
  };
}

/**
 * Map draft labels / custom text → Cursor ACP
 * `{ questionId, selectedOptionIds }[]` (docs wire shape).
 */
export function buildAskAnswersPayload(
  questions: readonly AskQuestionItem[],
  drafts: Record<string, AskQuestionDraft>,
): AskAnswerWireRow[] | null {
  const answers: AskAnswerWireRow[] = [];
  for (const question of questions) {
    const draft = drafts[question.id];
    const custom = (draft?.customAnswer ?? "").trim();
    if (custom) {
      const match = question.options.find(
        (opt) => opt.label === custom || opt.id === custom,
      );
      answers.push({
        questionId: question.id,
        selectedOptionIds: [match?.id ?? custom],
      });
      continue;
    }
    const selectedLabels = normalizeLabels(draft?.selectedOptionLabels);
    if (selectedLabels.length === 0) return null;
    const selectedOptionIds: string[] = [];
    for (const label of selectedLabels) {
      const match = question.options.find(
        (opt) => opt.label === label || opt.id === label,
      );
      selectedOptionIds.push(match?.id ?? label);
    }
    answers.push({ questionId: question.id, selectedOptionIds });
  }
  return answers.length > 0 ? answers : null;
}
