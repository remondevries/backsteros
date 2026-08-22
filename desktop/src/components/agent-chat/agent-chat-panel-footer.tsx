import type { Dispatch, RefObject, SetStateAction } from "react";
import { Check } from "lucide-react";

import type { AgentChatMode } from "../../lib/agent/agent-chat-mode";
import type { AgentChatAccessMode } from "../../lib/agent/agent-chat-runtime-mode";
import type { AgentChatImageAttachment } from "../../lib/agent/agent-chat-transcript";
import {
  setAskCustomAnswer,
  type AskQuestionDraft,
  type AskQuestionItem,
  type AskQuestionProgress,
} from "../../lib/agent/agent-chat-ask";
import {
  DesktopAgentChatComposer,
  type DesktopAgentChatComposerHandle,
} from "../desktop-agent-chat-composer";
import {
  permissionApprovalCopy,
  permissionOptionLabel,
  type AgentChatUiRequest,
  type FailedSteerDraft,
} from "./agent-chat-panel-helpers";

export type AgentChatPanelFooterContentProps = {
  composerOnly: boolean;
  chatOnly: boolean;
  isDraftHeroState: boolean;
  taskDisplayId: string | null;
  draftHeroHeadline: string | null;
  projectLabel: string;
  sendError: string | null;
  setSendError: Dispatch<SetStateAction<string | null>>;
  failedSteer: FailedSteerDraft | null;
  retryFailedSteer: () => void;
  discardFailedSteer: () => void;
  attachDraftHeroComposerAnchorRef: (element: HTMLDivElement | null) => void;
  composerRef: RefObject<DesktopAgentChatComposerHandle | null>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  cwd: string | null;
  agentMode: AgentChatMode;
  draftImages: AgentChatImageAttachment[];
  setDraftImages: Dispatch<SetStateAction<AgentChatImageAttachment[]>>;
  handleSend: () => void;
  handleCancel: () => void;
  handleClearChat: () => void;
  effectiveModelId: string;
  handleModelChange: (modelId: string) => void;
  handleModeChange: (mode: AgentChatMode) => void;
  accessMode: AgentChatAccessMode;
  handleAccessModeChange: (mode: AgentChatAccessMode) => void;
  composerSending: boolean;
  composerRunning: boolean;
  showPlanFollowUpPrompt: boolean;
  startingAgent: boolean;
  sessionReady: boolean;
  onStartAgent?: (options?: {
    prompt?: string;
    images?: readonly AgentChatImageAttachment[];
    mode?: AgentChatMode | null;
  }) => void;
  working: boolean;
  composerPlaceholder: string | null;
  uiRequest: AgentChatUiRequest | null;
  uiRequestQueue: AgentChatUiRequest[];
  uiRequestBusy: boolean;
  askProgress: AskQuestionProgress;
  askQuestions: AskQuestionItem[];
  handleAskOptionToggle: (optionLabel: string) => void;
  askAutoAdvanceTimerRef: RefObject<number | null>;
  setAskDrafts: Dispatch<SetStateAction<Record<string, AskQuestionDraft>>>;
  setAskQuestionIndex: Dispatch<SetStateAction<number>>;
  handleAskAdvance: () => void;
  answerUiRequest: (options: {
    optionId?: string | null;
    preference?: "once" | "always" | "reject" | null;
    skipped?: boolean;
    answers?:
      | Record<string, string | string[]>
      | { questionId: string; selectedOptionIds: string[] }[]
      | null;
  }) => Promise<void>;
  showTicketStart: boolean;
  handleStartOnTicket: () => void;
};

/**
 * Footer-inner content of the agent chat panel: draft-hero headline, send
 * errors, failed-steer recovery, the composer (with pending approval / ask
 * banner) and the Implement-ticket button.
 */
export function AgentChatPanelFooterContent({
  composerOnly,
  chatOnly,
  isDraftHeroState,
  taskDisplayId,
  draftHeroHeadline,
  projectLabel,
  sendError,
  setSendError,
  failedSteer,
  retryFailedSteer,
  discardFailedSteer,
  attachDraftHeroComposerAnchorRef,
  composerRef,
  draft,
  setDraft,
  cwd,
  agentMode,
  draftImages,
  setDraftImages,
  handleSend,
  handleCancel,
  handleClearChat,
  effectiveModelId,
  handleModelChange,
  handleModeChange,
  accessMode,
  handleAccessModeChange,
  composerSending,
  composerRunning,
  showPlanFollowUpPrompt,
  startingAgent,
  sessionReady,
  onStartAgent,
  working,
  composerPlaceholder,
  uiRequest,
  uiRequestQueue,
  uiRequestBusy,
  askProgress,
  askQuestions,
  handleAskOptionToggle,
  askAutoAdvanceTimerRef,
  setAskDrafts,
  setAskQuestionIndex,
  handleAskAdvance,
  answerUiRequest,
  showTicketStart,
  handleStartOnTicket,
}: AgentChatPanelFooterContentProps) {
  return (
    <>
            {!composerOnly && isDraftHeroState ? (
              <div className="desktop-agent-chat__draft-hero-slot">
                {taskDisplayId?.trim() ? (
                  <p className="desktop-agent-chat__draft-hero-eyebrow">
                    {taskDisplayId.trim()}
                  </p>
                ) : null}
                <h1 className="desktop-agent-chat__draft-hero-headline">
                  {chatOnly ? (
                    draftHeroHeadline?.trim() || "What should we say in this reply?"
                  ) : (
                    <>
                      What should we build in{" "}
                      <span className="desktop-agent-chat__draft-hero-project">
                        {projectLabel.trim() || "this project"}
                      </span>
                      ?
                    </>
                  )}
                </h1>
              </div>
            ) : null}
            {sendError ? (
              <p className="desktop-agent-chat__error" role="alert">
                {sendError}
              </p>
            ) : null}
            {failedSteer ? (
              <div
                className="desktop-agent-chat__followups"
                aria-label="Failed steer"
              >
                <div
                  className="desktop-agent-chat__followup"
                  role="status"
                >
                  <div className="desktop-agent-chat__followup-header">
                    <span className="desktop-agent-chat__followup-label">
                      Steer failed
                    </span>
                    <div className="desktop-agent-chat__failed-steer-actions">
                      <button
                        type="button"
                        className="desktop-agent-chat__followup-retry"
                        onClick={() => retryFailedSteer()}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        className="desktop-agent-chat__followup-remove"
                        aria-label="Discard failed steer"
                        title="Discard"
                        onClick={discardFailedSteer}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {failedSteer.images.length > 0 ? (
                    <div className="desktop-agent-chat__followup-images">
                      {failedSteer.images.map((image) =>
                        image.dataBase64 ? (
                          <img
                            key={image.id}
                            src={`data:${image.mimeType};base64,${image.dataBase64}`}
                            alt={image.name}
                          />
                        ) : null,
                      )}
                    </div>
                  ) : null}
                  <p className="desktop-agent-chat__followup-text">
                    {failedSteer.text}
                  </p>
                </div>
              </div>
            ) : null}
            <div
              ref={attachDraftHeroComposerAnchorRef}
              className="desktop-agent-chat__composer-anchor"
            >
            <DesktopAgentChatComposer
              ref={composerRef}
              value={draft}
              cwd={cwd}
              mode={agentMode}
              images={draftImages}
              onImagesChange={setDraftImages}
              onChange={(next) => {
                setDraft(next);
                if (sendError) setSendError(null);
              }}
              onSend={handleSend}
              onCancel={handleCancel}
              onClearChat={handleClearChat}
              modelId={effectiveModelId}
              onModelChange={handleModelChange}
              onModeChange={handleModeChange}
              accessMode={accessMode}
              onAccessModeChange={handleAccessModeChange}
              sending={composerSending}
              running={composerRunning}
              showPlanFollowUpPrompt={showPlanFollowUpPrompt}
              disabled={
                startingAgent || (!sessionReady && !onStartAgent && !working)
              }
              placeholder={
                composerPlaceholder?.trim() ||
                (uiRequest
                  ? uiRequest.kind === "ask_question"
                    ? "Type your own answer, or leave this blank to use the selected option"
                    : (uiRequest.detail ??
                      "Resolve this approval request to continue")
                  : showPlanFollowUpPrompt
                    ? draft.trim()
                      ? "Describe how to refine the plan…"
                      : "Plan ready — Implement, or type a refinement…"
                    : startingAgent
                      ? "Starting agent…"
                      : !sessionReady
                        ? "Message the agent to start…"
                        : working
                          ? "Add a follow-up to send next…"
                          : "Message the agent… (@ files, / commands, paste images)")
              }
              pendingBanner={
                uiRequest ? (
                  <div
                    className={`desktop-agent-chat__approval${
                      uiRequest.kind === "ask_question"
                        ? " desktop-agent-chat__approval--ask"
                        : " desktop-agent-chat__approval--permission"
                    }`}
                    role="alertdialog"
                    aria-label={uiRequest.title}
                  >
                    {uiRequestQueue.length > 1 ? (
                      <div className="desktop-agent-chat__ask-header">
                        <span className="desktop-agent-chat__ask-eyebrow">
                          Pending
                        </span>
                        <span className="desktop-agent-chat__ask-count">
                          1/{uiRequestQueue.length}
                        </span>
                      </div>
                    ) : null}
                    {uiRequest.kind === "ask_question" &&
                    askProgress.activeQuestion ? (
                      <>
                        <div className="desktop-agent-chat__ask-header">
                          <span className="desktop-agent-chat__ask-eyebrow">
                            {askProgress.activeQuestion.header?.trim() ||
                              "Question"}
                          </span>
                          {askQuestions.length > 1 ? (
                            <span className="desktop-agent-chat__ask-count">
                              {askProgress.questionIndex + 1}/
                              {askQuestions.length}
                            </span>
                          ) : null}
                        </div>
                        <p className="desktop-agent-chat__approval-prompt">
                          {askProgress.activeQuestion.prompt}
                        </p>
                        {askProgress.activeQuestion.multiSelect ? (
                          <p className="desktop-agent-chat__approval-progress">
                            Select one or more options.
                          </p>
                        ) : null}
                        <div className="desktop-agent-chat__ask-options">
                          {askProgress.activeQuestion.options.map(
                            (option, index) => {
                              const customActive =
                                askProgress.customAnswer.trim().length > 0;
                              const selected =
                                !customActive &&
                                askProgress.selectedOptionLabels.includes(
                                  option.label,
                                );
                              const shortcutKey = index < 9 ? index + 1 : null;
                              return (
                                <button
                                  key={`${askProgress.activeQuestion?.id}:${option.label}`}
                                  type="button"
                                  className={`desktop-agent-chat__ask-option${
                                    selected ? " is-selected" : ""
                                  }`}
                                  disabled={uiRequestBusy}
                                  aria-pressed={selected}
                                  onClick={() =>
                                    handleAskOptionToggle(option.label)
                                  }
                                >
                                  <span className="desktop-agent-chat__ask-option-label">
                                    {option.label}
                                  </span>
                                  {selected ? (
                                    <Check
                                      className="desktop-agent-chat__ask-check"
                                      size={14}
                                      strokeWidth={2.2}
                                      aria-hidden
                                    />
                                  ) : shortcutKey != null ? (
                                    <kbd className="desktop-agent-chat__ask-kbd">
                                      {shortcutKey}
                                    </kbd>
                                  ) : null}
                                </button>
                              );
                            },
                          )}
                        </div>
                        <label className="desktop-agent-chat__ask-custom">
                          <span className="desktop-agent-chat__ask-custom-label">
                            Or type an answer
                          </span>
                          <input
                            type="text"
                            className="desktop-agent-chat__ask-custom-input"
                            value={askProgress.customAnswer}
                            disabled={uiRequestBusy}
                            placeholder="Custom answer…"
                            onChange={(event) => {
                              const question = askProgress.activeQuestion;
                              if (!question) return;
                              if (askAutoAdvanceTimerRef.current != null) {
                                window.clearTimeout(
                                  askAutoAdvanceTimerRef.current,
                                );
                                askAutoAdvanceTimerRef.current = null;
                              }
                              const value = event.target.value;
                              setAskDrafts((prev) => ({
                                ...prev,
                                [question.id]: setAskCustomAnswer(
                                  prev[question.id],
                                  value,
                                ),
                              }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              if (askProgress.canAdvance) handleAskAdvance();
                            }}
                          />
                        </label>
                        <div className="desktop-agent-chat__approval-options">
                          {askProgress.questionIndex > 0 ? (
                            <button
                              type="button"
                              className="desktop-agent-chat__approval-option"
                              disabled={uiRequestBusy}
                              onClick={() => {
                                if (askAutoAdvanceTimerRef.current != null) {
                                  window.clearTimeout(
                                    askAutoAdvanceTimerRef.current,
                                  );
                                  askAutoAdvanceTimerRef.current = null;
                                }
                                setAskQuestionIndex((index) =>
                                  Math.max(0, index - 1),
                                );
                              }}
                            >
                              Back
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="desktop-agent-chat__approval-option is-primary"
                            disabled={uiRequestBusy || !askProgress.canAdvance}
                            onClick={() => {
                              if (askAutoAdvanceTimerRef.current != null) {
                                window.clearTimeout(
                                  askAutoAdvanceTimerRef.current,
                                );
                                askAutoAdvanceTimerRef.current = null;
                              }
                              handleAskAdvance();
                            }}
                          >
                            {askProgress.isLastQuestion ? "Submit" : "Next"}
                          </button>
                          <button
                            type="button"
                            className="desktop-agent-chat__approval-option"
                            disabled={uiRequestBusy}
                            onClick={() =>
                              void answerUiRequest({ skipped: true })
                            }
                          >
                            Skip
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {(() => {
                          const copy = permissionApprovalCopy(
                            uiRequest.title,
                            uiRequest.detail,
                          );
                          return (
                            <>
                              <div className="desktop-agent-chat__approval-header">
                                <span className="desktop-agent-chat__approval-eyebrow">
                                  Pending approval
                                </span>
                                <span className="desktop-agent-chat__approval-summary">
                                  {copy.summary}
                                </span>
                              </div>
                              {uiRequest.detail ? (
                                <div className="desktop-agent-chat__approval-detail-card">
                                  <p className="desktop-agent-chat__approval-detail-label">
                                    {copy.detailLabel}
                                  </p>
                                  <pre className="desktop-agent-chat__approval-detail">
                                    {uiRequest.detail}
                                  </pre>
                                </div>
                              ) : uiRequest.title ? (
                                <div className="desktop-agent-chat__approval-detail-card">
                                  <p className="desktop-agent-chat__approval-detail-label">
                                    {copy.detailLabel}
                                  </p>
                                  <pre className="desktop-agent-chat__approval-detail">
                                    {uiRequest.title}
                                  </pre>
                                </div>
                              ) : null}
                            </>
                          );
                        })()}
                        <div className="desktop-agent-chat__approval-options">
                          {uiRequest.options.length > 0 ? (
                            uiRequest.options.map((option, index) => (
                              <button
                                key={option.id}
                                type="button"
                                className={`desktop-agent-chat__approval-option${
                                  index === 0 ? " is-primary" : ""
                                }`}
                                disabled={uiRequestBusy}
                                onClick={() =>
                                  void answerUiRequest({ optionId: option.id })
                                }
                              >
                                {permissionOptionLabel(option.label)}
                              </button>
                            ))
                          ) : (
                            <>
                              <button
                                type="button"
                                className="desktop-agent-chat__approval-option"
                                disabled={uiRequestBusy}
                                onClick={() =>
                                  void answerUiRequest({ preference: "reject" })
                                }
                              >
                                Decline
                              </button>
                              <button
                                type="button"
                                className="desktop-agent-chat__approval-option"
                                disabled={uiRequestBusy}
                                onClick={() =>
                                  void answerUiRequest({
                                    preference: "always",
                                  })
                                }
                              >
                                Always allow this session
                              </button>
                              <button
                                type="button"
                                className="desktop-agent-chat__approval-option is-primary"
                                disabled={uiRequestBusy}
                                onClick={() =>
                                  void answerUiRequest({ preference: "once" })
                                }
                              >
                                Approve once
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ) : null
              }
            />
            {!composerOnly && showTicketStart ? (
              <div className="desktop-agent-chat__draft-hero-actions">
                <button
                  type="button"
                  className="desktop-agent-chat__draft-hero-ticket"
                  disabled={startingAgent}
                  aria-busy={startingAgent || undefined}
                  aria-label={
                    startingAgent
                      ? "Starting agent on ticket"
                      : taskDisplayId?.trim()
                        ? `Implement ${taskDisplayId.trim()}`
                        : "Implement this task"
                  }
                  title="Start the agent with the predefined ticket brief"
                  onClick={handleStartOnTicket}
                >
                  {startingAgent
                    ? "Starting…"
                    : taskDisplayId?.trim()
                      ? `Implement ${taskDisplayId.trim()}`
                      : "Implement this task"}
                </button>
              </div>
            ) : null}
            </div>
    </>
  );
}
