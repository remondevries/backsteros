"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ChatUiCardPart,
  ChatUiFormCardData,
} from "@backsteros/contracts";
import {
  chatUiFormCardDataSchema,
  validateChatThreadFormAnswer,
} from "@backsteros/contracts";

import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";

export type ChatFormAnswerFn = (
  messageId: string,
  values: Record<string, string | number | boolean>,
) => void | Promise<void>;

const ChatFormAnswerContext = createContext<ChatFormAnswerFn | null>(null);

export function ChatFormAnswerProvider({
  onAnswer,
  children,
}: {
  onAnswer?: ChatFormAnswerFn | null;
  children: ReactNode;
}) {
  return (
    <ChatFormAnswerContext.Provider value={onAnswer ?? null}>
      {children}
    </ChatFormAnswerContext.Provider>
  );
}

export function useChatFormAnswerOptional(): ChatFormAnswerFn | null {
  return useContext(ChatFormAnswerContext);
}

function parseFormData(part: ChatUiCardPart): ChatUiFormCardData | null {
  const parsed = chatUiFormCardDataSchema.safeParse(part.data ?? {});
  return parsed.success ? parsed.data : null;
}

function initialValues(data: ChatUiFormCardData): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};
  for (const field of data.fields) {
    if (field.defaultValue !== undefined) {
      values[field.name] = field.defaultValue;
      continue;
    }
    if (field.type === "checkbox") values[field.name] = false;
    else if (field.type === "number") continue;
    else values[field.name] = "";
  }
  return values;
}

function formatAnsweredAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayValue(
  field: ChatUiFormCardData["fields"][number],
  value: string | number | boolean,
): string {
  if (field.type === "checkbox") return value === true ? "Yes" : "No";
  if (field.type === "select") {
    const option = (field.options ?? []).find(
      (entry) => entry.value === String(value),
    );
    return option?.label ?? String(value);
  }
  return String(value);
}

export function ChatFormCard({ part }: { part: ChatUiCardPart }) {
  const data = useMemo(() => parseFormData(part), [part]);
  const onAnswer = useChatFormAnswerOptional();
  const [values, setValues] = useState<Record<string, string | number | boolean>>(
    () => (data ? initialValues(data) : {}),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const locked = Boolean(data?.answer) || data?.dismissed === true;

  const setField = useCallback((name: string, value: string | number | boolean) => {
    setError(null);
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const submit = useCallback(async () => {
    if (!data || !onAnswer || submitting || locked) return;
    const validated = validateChatThreadFormAnswer(
      {
        title: data.title,
        ...(data.description ? { description: data.description } : {}),
        ...(data.submitLabel ? { submitLabel: data.submitLabel } : {}),
        fields: data.fields,
      },
      values,
    );
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    setSubmitting(true);
    try {
      await onAnswer(data.messageId, validated.values);
    } finally {
      setSubmitting(false);
    }
  }, [data, locked, onAnswer, submitting, values]);

  if (!data) return null;

  const submitLabel = data.submitLabel?.trim() || "Submit";
  const answer = data.answer;

  return (
    <div
      className={[
        "chat-ui-form-card",
        data.dismissed ? "is-dismissed" : "",
        answer ? "is-answered" : "",
        submitting ? "is-submitting" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-message-id={data.messageId}
    >
      <h3 className="chat-ui-form-card__title">{data.title}</h3>
      {data.description ? (
        <div className="chat-ui-form-card__description">
          <DocumentMarkdownPreview
            body={data.description}
            forceInlineMentions
          />
        </div>
      ) : null}

      {answer ? (
        <dl className="chat-ui-form-card__readonly">
          {data.fields.map((field) => {
            if (!(field.name in answer.values)) return null;
            return (
              <div key={field.name} className="chat-ui-form-card__readonly-row">
                <dt>{field.label}</dt>
                <dd>{displayValue(field, answer.values[field.name]!)}</dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <div className="chat-ui-form-card__fields">
          {data.fields.map((field) => {
            const id = `${data.messageId}-${field.name}`;
            const value = values[field.name];
            if (field.type === "checkbox") {
              return (
                <label key={field.name} className="chat-ui-form-card__checkbox" htmlFor={id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={value === true}
                    disabled={locked || submitting || !onAnswer}
                    onChange={(event) => setField(field.name, event.target.checked)}
                  />
                  <span>
                    {field.label}
                    {field.required ? " *" : ""}
                  </span>
                </label>
              );
            }
            return (
              <label key={field.name} className="chat-ui-form-card__field" htmlFor={id}>
                <span className="chat-ui-form-card__label">
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                {field.type === "textarea" ? (
                  <textarea
                    id={id}
                    className="chat-ui-form-card__control"
                    rows={3}
                    placeholder={field.placeholder}
                    value={typeof value === "string" ? value : ""}
                    disabled={locked || submitting || !onAnswer}
                    onChange={(event) => setField(field.name, event.target.value)}
                  />
                ) : field.type === "select" ? (
                  <select
                    id={id}
                    className="chat-ui-form-card__control"
                    value={typeof value === "string" ? value : ""}
                    disabled={locked || submitting || !onAnswer}
                    onChange={(event) => setField(field.name, event.target.value)}
                  >
                    <option value="">
                      {field.placeholder?.trim() || "Select…"}
                    </option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    className="chat-ui-form-card__control"
                    type={
                      field.type === "number"
                        ? "number"
                        : field.type === "date"
                          ? "date"
                          : "text"
                    }
                    placeholder={field.placeholder}
                    value={
                      value === undefined || value === null
                        ? ""
                        : String(value)
                    }
                    min={
                      field.min !== undefined ? String(field.min) : undefined
                    }
                    max={
                      field.max !== undefined ? String(field.max) : undefined
                    }
                    disabled={locked || submitting || !onAnswer}
                    onChange={(event) => {
                      if (field.type === "number") {
                        const next = event.target.value;
                        setField(
                          field.name,
                          next === "" ? "" : Number(next),
                        );
                        return;
                      }
                      setField(field.name, event.target.value);
                    }}
                  />
                )}
              </label>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="chat-ui-form-card__error" role="alert">
          {error}
        </p>
      ) : null}

      {answer ? (
        <div className="chat-ui-form-card__result-row">
          <span className="chat-ui-form-card__result is-submitted">
            <span>Submitted</span>
            <span className="chat-ui-form-card__result-time">
              {formatAnsweredAt(answer.answeredAt)}
            </span>
          </span>
        </div>
      ) : !locked ? (
        <div className="chat-ui-form-card__actions">
          <button
            type="button"
            className="chat-ui-form-card__submit"
            disabled={submitting || !onAnswer}
            onClick={() => void submit()}
          >
            {submitLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function findFormCardPart(
  parts: readonly { type: string; cardType?: string }[],
): ChatUiCardPart | null {
  for (const part of parts) {
    if (part.type === "card" && part.cardType === "form") {
      return part as ChatUiCardPart;
    }
  }
  return null;
}
