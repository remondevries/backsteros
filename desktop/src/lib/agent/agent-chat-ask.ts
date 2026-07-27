export type AskQuestionOption = {
  id: string;
  label: string;
};

export type AskQuestionItem = {
  id: string;
  prompt: string;
  options: AskQuestionOption[];
  multiSelect?: boolean;
};

export type AskQuestionDraft = {
  selectedOptionIds: string[];
};

export type AskQuestionProgress = {
  questionIndex: number;
  activeQuestion: AskQuestionItem | null;
  selectedOptionIds: string[];
  answeredCount: number;
  isLastQuestion: boolean;
  isComplete: boolean;
  canAdvance: boolean;
};

export function normalizeAskQuestions(raw: unknown): AskQuestionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AskQuestionItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const q = entry as Record<string, unknown>;
    const id = String(q.id ?? q.questionId ?? `q-${out.length}`);
    const prompt = String(q.prompt ?? q.question ?? q.text ?? "").trim();
    if (!prompt) continue;
    const optionsRaw = Array.isArray(q.options) ? q.options : [];
    const options: AskQuestionOption[] = [];
    for (const opt of optionsRaw) {
      if (!opt || typeof opt !== "object") continue;
      const o = opt as Record<string, unknown>;
      const optionId = String(o.id ?? o.optionId ?? o.value ?? "").trim();
      if (!optionId) continue;
      options.push({
        id: optionId,
        label: String(o.label ?? o.name ?? o.text ?? optionId).trim() || optionId,
      });
    }
    out.push({
      id,
      prompt,
      options,
      multiSelect: q.multiSelect === true || q.allow_multiple === true,
    });
  }
  return out;
}

export function toggleAskOption(
  question: AskQuestionItem,
  draft: AskQuestionDraft | undefined,
  optionId: string,
): AskQuestionDraft {
  const selected = draft?.selectedOptionIds ?? [];
  if (question.multiSelect) {
    const next = selected.includes(optionId)
      ? selected.filter((id) => id !== optionId)
      : [...selected, optionId];
    return { selectedOptionIds: next };
  }
  return { selectedOptionIds: [optionId] };
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
  const selectedOptionIds = activeQuestion
    ? (drafts[activeQuestion.id]?.selectedOptionIds ?? [])
    : [];
  const answeredCount = questions.reduce((count, question) => {
    const selected = drafts[question.id]?.selectedOptionIds ?? [];
    return selected.length > 0 ? count + 1 : count;
  }, 0);
  const isComplete =
    questions.length > 0 &&
    questions.every((question) => (drafts[question.id]?.selectedOptionIds.length ?? 0) > 0);

  return {
    questionIndex: bounded,
    activeQuestion,
    selectedOptionIds,
    answeredCount,
    isLastQuestion: questions.length === 0 ? true : bounded >= questions.length - 1,
    isComplete,
    canAdvance: selectedOptionIds.length > 0,
  };
}

export function buildAskAnswersPayload(
  questions: readonly AskQuestionItem[],
  drafts: Record<string, AskQuestionDraft>,
): { questionId: string; selectedOptionIds: string[] }[] | null {
  const answers: { questionId: string; selectedOptionIds: string[] }[] = [];
  for (const question of questions) {
    const selected = drafts[question.id]?.selectedOptionIds ?? [];
    if (selected.length === 0) return null;
    answers.push({ questionId: question.id, selectedOptionIds: selected });
  }
  return answers;
}
