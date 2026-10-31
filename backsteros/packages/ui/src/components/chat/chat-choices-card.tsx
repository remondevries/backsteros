"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChatUiCardPart, ChatUiChoicesCardData } from "@backsteros/contracts";
import { chatUiChoicesCardDataSchema } from "@backsteros/contracts";

export type ChatChoicesAnswerFn = (
  messageId: string,
  values: readonly string[],
) => void | Promise<void>;

const ChatChoicesAnswerContext = createContext<ChatChoicesAnswerFn | null>(
  null,
);

export function ChatChoicesAnswerProvider({
  onAnswer,
  children,
}: {
  onAnswer?: ChatChoicesAnswerFn | null;
  children: ReactNode;
}) {
  return (
    <ChatChoicesAnswerContext.Provider value={onAnswer ?? null}>
      {children}
    </ChatChoicesAnswerContext.Provider>
  );
}

export function useChatChoicesAnswerOptional(): ChatChoicesAnswerFn | null {
  return useContext(ChatChoicesAnswerContext);
}

function parseChoicesData(
  part: ChatUiCardPart,
): ChatUiChoicesCardData | null {
  const parsed = chatUiChoicesCardDataSchema.safeParse(part.data ?? {});
  return parsed.success ? parsed.data : null;
}

export function ChatChoicesCard({ part }: { part: ChatUiCardPart }) {
  const data = useMemo(() => parseChoicesData(part), [part]);
  const onAnswer = useChatChoicesAnswerOptional();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);

  const locked = Boolean(data?.answer) || data?.dismissed === true;
  const answeredValues = useMemo(
    () => new Set(data?.answer?.values ?? []),
    [data?.answer?.values],
  );

  const toggle = useCallback(
    (value: string) => {
      if (locked || submitting || !data) return;
      if (!data.multiSelect) {
        setSelected(new Set([value]));
        return;
      }
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    },
    [data, locked, submitting],
  );

  const submitValues = useCallback(
    async (values: readonly string[]) => {
      if (!data || !onAnswer || values.length === 0 || submitting) return;
      setSubmitting(true);
      try {
        await onAnswer(data.messageId, values);
      } finally {
        setSubmitting(false);
      }
    },
    [data, onAnswer, submitting],
  );

  const onSingleClick = useCallback(
    (value: string) => {
      if (locked || !data || data.multiSelect) {
        toggle(value);
        return;
      }
      void submitValues([value]);
    },
    [data, locked, submitValues, toggle],
  );

  if (!data) return null;

  return (
    <div
      className={[
        "chat-ui-choices",
        data.dismissed ? "is-dismissed" : "",
        data.answer ? "is-answered" : "",
        submitting ? "is-submitting" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-message-id={data.messageId}
    >
      {data.prompt ? (
        <p className="chat-ui-choices__prompt">{data.prompt}</p>
      ) : null}
      <div className="chat-ui-choices__options" role="group">
        {data.options.map((option) => {
          const style = option.style ?? "default";
          const isPicked = data.answer
            ? answeredValues.has(option.value)
            : selected.has(option.value);
          const hiddenWhenAnswered =
            Boolean(data.answer) && !answeredValues.has(option.value);
          if (hiddenWhenAnswered) return null;
          return (
            <button
              key={option.value}
              type="button"
              className={[
                "chat-ui-choices__option",
                `is-${style}`,
                isPicked ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={locked || submitting || !onAnswer}
              aria-pressed={data.multiSelect ? isPicked : undefined}
              onClick={() => onSingleClick(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {data.multiSelect && !locked ? (
        <button
          type="button"
          className="chat-ui-choices__submit"
          disabled={selected.size === 0 || submitting || !onAnswer}
          onClick={() => void submitValues([...selected])}
        >
          Submit
        </button>
      ) : null}
    </div>
  );
}

/** Extract the choices card part from a message (if any). */
export function findChoicesCardPart(
  parts: readonly { type: string; cardType?: string }[],
): ChatUiCardPart | null {
  for (const part of parts) {
    if (part.type === "card" && part.cardType === "choices") {
      return part as ChatUiCardPart;
    }
  }
  return null;
}
