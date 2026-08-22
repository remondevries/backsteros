import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  buildAskAnswersPayload,
  deriveAskProgress,
  normalizeAskQuestions,
  toggleAskOption,
  type AskQuestionDraft,
} from "../../lib/agent/agent-chat-ask";
import { respondPtyAcpUiRequest } from "../../lib/pty";
import {
  isEditableFocusTarget,
  type AgentChatUiRequest,
} from "./agent-chat-panel-helpers";

/** Pending permission / ask-question queue: answers, drafts, digit shortcuts. */
export function useAgentAskApproval({
  taskId,
  uiRequest,
  uiRequestBusy,
  askDrafts,
  askQuestionIndex,
  setUiRequestQueue,
  setUiRequestBusy,
  setAskDrafts,
  setAskQuestionIndex,
  setSendError,
}: {
  taskId: string;
  uiRequest: AgentChatUiRequest | null;
  uiRequestBusy: boolean;
  askDrafts: Record<string, AskQuestionDraft>;
  askQuestionIndex: number;
  setUiRequestQueue: Dispatch<SetStateAction<AgentChatUiRequest[]>>;
  setUiRequestBusy: Dispatch<SetStateAction<boolean>>;
  setAskDrafts: Dispatch<SetStateAction<Record<string, AskQuestionDraft>>>;
  setAskQuestionIndex: Dispatch<SetStateAction<number>>;
  setSendError: Dispatch<SetStateAction<string | null>>;
}) {
  const handleAcpUiRequest = useCallback(
    (forTaskId: string, request: AgentChatUiRequest) => {
      if (forTaskId !== taskId) return;
      setUiRequestQueue((prev) => {
        if (prev.some((entry) => entry.requestId === request.requestId)) {
          return prev;
        }
        return [...prev, request];
      });
      setUiRequestBusy(false);
      // Only reset ask drafts when this becomes the active (head) request.
      setAskDrafts({});
      setAskQuestionIndex(0);
    },
    [taskId],
  );

  const handleAcpUiRequestCleared = useCallback(
    (forTaskId: string, requestId: string | null) => {
      if (forTaskId !== taskId) return;
      setUiRequestQueue((prev) => {
        if (prev.length === 0) return prev;
        if (!requestId) return [];
        return prev.filter((entry) => entry.requestId !== requestId);
      });
      setUiRequestBusy(false);
      setAskDrafts({});
      setAskQuestionIndex(0);
    },
    [taskId],
  );

  const askQuestions = useMemo(() => {
    if (!uiRequest || uiRequest.kind !== "ask_question") return [];
    const fromPayload = normalizeAskQuestions(uiRequest.questions);
    if (fromPayload.length > 0) return fromPayload;
    if (uiRequest.options.length === 0) return [];
    return [
      {
        id: "q-0",
        prompt: uiRequest.title,
        options: uiRequest.options,
        multiSelect: false,
      },
    ];
  }, [uiRequest]);

  const askProgress = useMemo(
    () => deriveAskProgress(askQuestions, askDrafts, askQuestionIndex),
    [askDrafts, askQuestionIndex, askQuestions],
  );

  const answerUiRequest = useCallback(
    async (options: {
      optionId?: string | null;
      preference?: "once" | "always" | "reject" | null;
      skipped?: boolean;
      answers?:
        | Record<string, string | string[]>
        | { questionId: string; selectedOptionIds: string[] }[]
        | null;
    }) => {
      const pending = uiRequest;
      if (!pending || uiRequestBusy) return;
      setUiRequestBusy(true);
      const result = await respondPtyAcpUiRequest({
        requestId: pending.requestId,
        optionId: options.optionId,
        preference: options.preference,
        skipped: options.skipped,
        answers: options.answers,
      });
      if (!result.ok) {
        setSendError(result.error);
        setUiRequestBusy(false);
        return;
      }
      setUiRequestQueue((prev) =>
        prev.filter((entry) => entry.requestId !== pending.requestId),
      );
      setUiRequestBusy(false);
      setAskDrafts({});
      setAskQuestionIndex(0);
    },
    [uiRequest, uiRequestBusy],
  );

  const handleAskAdvance = useCallback(() => {
    if (!askProgress.canAdvance) return;
    if (!askProgress.isLastQuestion) {
      setAskQuestionIndex((index) => index + 1);
      return;
    }
    const answers = buildAskAnswersPayload(askQuestions, askDrafts);
    if (!answers) return;
    void answerUiRequest({ answers });
  }, [answerUiRequest, askDrafts, askProgress, askQuestions]);

  const handleAskAdvanceRef = useRef(handleAskAdvance);
  handleAskAdvanceRef.current = handleAskAdvance;
  const askAutoAdvanceTimerRef = useRef<number | null>(null);

  const handleAskOptionToggle = useCallback(
    (optionLabel: string) => {
      const question = askProgress.activeQuestion;
      if (!question || uiRequestBusy) return;
      setAskDrafts((prev) => ({
        ...prev,
        [question.id]: toggleAskOption(
          question,
          prev[question.id],
          optionLabel,
        ),
      }));
      if (question.multiSelect) return;
      if (askAutoAdvanceTimerRef.current != null) {
        window.clearTimeout(askAutoAdvanceTimerRef.current);
      }
      askAutoAdvanceTimerRef.current = window.setTimeout(() => {
        askAutoAdvanceTimerRef.current = null;
        handleAskAdvanceRef.current();
      }, 200);
    },
    [askProgress.activeQuestion, uiRequestBusy],
  );

  useEffect(() => {
    return () => {
      if (askAutoAdvanceTimerRef.current != null) {
        window.clearTimeout(askAutoAdvanceTimerRef.current);
      }
    };
  }, []);

  // T3 digit shortcuts 1–9 for option selection.
  useEffect(() => {
    if (!uiRequest || uiRequest.kind !== "ask_question" || uiRequestBusy) {
      return;
    }
    const question = askProgress.activeQuestion;
    if (!question) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableFocusTarget(event.target)) return;
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const option = question.options[digit - 1];
      if (!option) return;
      event.preventDefault();
      event.stopPropagation();
      handleAskOptionToggle(option.label);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    askProgress.activeQuestion,
    handleAskOptionToggle,
    uiRequest,
    uiRequestBusy,
  ]);

  return {
    handleAcpUiRequest,
    handleAcpUiRequestCleared,
    askQuestions,
    askProgress,
    answerUiRequest,
    handleAskAdvance,
    handleAskOptionToggle,
    askAutoAdvanceTimerRef,
  };
}
