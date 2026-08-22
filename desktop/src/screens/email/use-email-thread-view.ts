import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentMailMessageDetail,
  EmailThreadComment,
} from "@backsteros/contracts";
import {
  deriveEmailThreadMinimapItems,
  parseReplyToAddress,
  resolveEmailThreadMinimapHasPersistentGutter,
  resolveEmailThreadMinimapHitStripWidth,
  type EmailThreadBodyViewMode,
  type EmailThreadMinimapItem,
} from "@backsteros/ui";

import { useAgentMail } from "../../lib/agentmail-context";

import {
  EMAIL_THREAD_BODY_VIEW_MODE_KEY,
  readEmailThreadBodyViewMode,
} from "./email-page-helpers";

export function useEmailThreadView({
  message,
  messageId,
  loading,
  threadComments,
  replyComposeOpen,
  commentAgentWorking,
  draftAgentWorking,
  draftStageWorking,
}: {
  message: AgentMailMessageDetail | null;
  messageId: string | undefined;
  loading: boolean;
  threadComments: EmailThreadComment[];
  replyComposeOpen: boolean;
  commentAgentWorking: boolean;
  draftAgentWorking: boolean;
  draftStageWorking: boolean;
}) {
  const agentMail = useAgentMail();
  const [freshCommentIds, setFreshCommentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [threadBodyViewMode, setThreadBodyViewMode] =
    useState<EmailThreadBodyViewMode>(() => readEmailThreadBodyViewMode());
  const [workingEnter, setWorkingEnter] = useState(false);
  const [propertiesRailWidth, setPropertiesRailWidth] = useState(300);
  const [minimapHasPersistentGutter, setMinimapHasPersistentGutter] =
    useState(false);
  const [minimapHitStripWidth, setMinimapHitStripWidth] = useState(0);
  const [minimapInViewIds, setMinimapInViewIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const propertiesRailRef = useRef<HTMLElement | null>(null);
  const threadScrollShellRef = useRef<HTMLDivElement | null>(null);
  const threadScrollportRef = useRef<HTMLDivElement | null>(null);
  const previousCommentIdsRef = useRef<string[] | null>(null);
  const didInitialThreadScrollRef = useRef(false);
  const wasReplyChromeVisibleRef = useRef(false);
  const followEndCleanupRef = useRef<(() => void) | null>(null);
  const previousDraftFingerprintRef = useRef("");
  const previousThreadMessageCountRef = useRef(0);

  useEffect(() => {
    const el = propertiesRailRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const width = Math.round(el.getBoundingClientRect().width);
      if (width > 0) setPropertiesRailWidth(width);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [messageId]);

  useEffect(() => {
    previousCommentIdsRef.current = null;
    didInitialThreadScrollRef.current = false;
    wasReplyChromeVisibleRef.current = false;
    previousDraftFingerprintRef.current = "";
    previousThreadMessageCountRef.current = 0;
    followEndCleanupRef.current?.();
    followEndCleanupRef.current = null;
    setFreshCommentIds(new Set());
    setWorkingEnter(false);
  }, [messageId]);

  useEffect(() => {
    const ids = threadComments.map((comment) => comment.id);
    const previous = previousCommentIdsRef.current;
    previousCommentIdsRef.current = ids;
    if (previous === null) return;
    const prevSet = new Set(previous);
    const fresh = ids.filter((id) => !prevSet.has(id));
    if (fresh.length === 0) return;
    setFreshCommentIds(new Set(fresh));
    const timer = window.setTimeout(() => setFreshCommentIds(new Set()), 380);
    return () => window.clearTimeout(timer);
  }, [threadComments]);

  useEffect(() => {
    if (!commentAgentWorking) {
      setWorkingEnter(false);
      return;
    }
    setWorkingEnter(true);
    const timer = window.setTimeout(() => setWorkingEnter(false), 380);
    return () => window.clearTimeout(timer);
  }, [commentAgentWorking]);

  const replyChromeVisible =
    replyComposeOpen || Boolean(message?.conceptDraft);
  const conceptDraftKey =
    message?.conceptDraft?.draftId?.trim() ||
    message?.conceptDraftId?.trim() ||
    "";
  const conceptDraftUpdatedAt = message?.conceptDraft?.updatedAt ?? "";
  const threadMessageCount =
    message?.threadMessages && message.threadMessages.length > 0
      ? message.threadMessages.length
      : message
        ? 1
        : 0;

  useEffect(() => {
    const el = threadScrollportRef.current;
    if (!el || loading) return;

    const replyChromeJustShown =
      replyChromeVisible && !wasReplyChromeVisibleRef.current;
    wasReplyChromeVisibleRef.current = replyChromeVisible;

    // Fingerprint server draft identity — not local body length (typing).
    const draftFingerprint = `${conceptDraftKey}|${conceptDraftUpdatedAt}`;
    const draftContentChanged =
      replyChromeVisible &&
      draftFingerprint !== previousDraftFingerprintRef.current;
    previousDraftFingerprintRef.current = draftFingerprint;

    const previousThreadCount = previousThreadMessageCountRef.current;
    const inboundMailArrived =
      didInitialThreadScrollRef.current &&
      threadMessageCount > previousThreadCount;
    previousThreadMessageCountRef.current = threadMessageCount;

    const followEnd =
      !didInitialThreadScrollRef.current ||
      commentAgentWorking ||
      freshCommentIds.size > 0 ||
      replyChromeJustShown ||
      draftStageWorking ||
      draftAgentWorking ||
      draftContentChanged ||
      inboundMailArrived;

    if (!followEnd) return;

    const scrollToEnd = (behavior: ScrollBehavior) => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    };

    const behavior: ScrollBehavior = didInitialThreadScrollRef.current
      ? "smooth"
      : "auto";
    didInitialThreadScrollRef.current = true;

    followEndCleanupRef.current?.();
    scrollToEnd(behavior);

    // Draft cards grow after mount (body stage / enter). Re-stick to the end
    // while height settles so the composer doesn't cover the Send row.
    const timers: number[] = [];
    const chaseDelaysMs = [48, 140, 280, 420, 640, 900];
    for (const delay of chaseDelaysMs) {
      timers.push(
        window.setTimeout(() => {
          scrollToEnd("auto");
        }, delay),
      );
    }
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scrollToEnd("auto");
          })
        : null;
    const threadRoot = el.querySelector(".email-thread");
    if (observer && threadRoot) {
      observer.observe(threadRoot);
    }
    const stopTimer = window.setTimeout(() => {
      observer?.disconnect();
    }, 1000);
    followEndCleanupRef.current = () => {
      for (const timer of timers) window.clearTimeout(timer);
      window.clearTimeout(stopTimer);
      observer?.disconnect();
    };
    return () => {
      followEndCleanupRef.current?.();
      followEndCleanupRef.current = null;
    };
  }, [
    commentAgentWorking,
    conceptDraftKey,
    conceptDraftUpdatedAt,
    draftAgentWorking,
    draftStageWorking,
    freshCommentIds,
    loading,
    messageId,
    replyChromeVisible,
    threadComments.length,
    threadMessageCount,
  ]);

  const emailMinimapItems = useMemo(() => {
    if (!message) return [] as EmailThreadMinimapItem[];
    const threadMessages =
      message.threadMessages && message.threadMessages.length > 0
        ? message.threadMessages
        : [
            {
              messageId: message.messageId,
              subject: message.subject,
              from: message.from,
              to: message.to ?? (message.inboxEmail ? [message.inboxEmail] : []),
            },
          ];
    const ourMailboxEmails = new Set(
      [
        message.inboxEmail,
        ...agentMail.mailboxes.map((mailbox) => mailbox.email),
      ]
        .map((email) => email?.trim().toLowerCase())
        .filter((email): email is string => Boolean(email)),
    );
    return deriveEmailThreadMinimapItems(
      threadMessages.map((entry) => {
        const fromEmail = parseReplyToAddress(entry.from).toLowerCase();
        const isSent = Boolean(fromEmail && ourMailboxEmails.has(fromEmail));
        return {
          messageId: entry.messageId,
          subject: entry.subject,
          from: entry.from,
          to: entry.to ?? [],
          direction: isSent ? ("sent" as const) : ("received" as const),
        };
      }),
    );
  }, [agentMail.mailboxes, message]);

  const updateEmailMinimapInView = useCallback(() => {
    const scroller = threadScrollportRef.current;
    if (!scroller || emailMinimapItems.length === 0) {
      setMinimapInViewIds(new Set());
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const next = new Set<string>();
    for (const item of emailMinimapItems) {
      const section = scroller.querySelector<HTMLElement>(
        `[data-email-message="${CSS.escape(item.id)}"]`,
      );
      if (!section) continue;
      const rect = section.getBoundingClientRect();
      if (rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom) {
        next.add(item.id);
      }
    }
    setMinimapInViewIds((current) => {
      if (current.size === next.size) {
        let same = true;
        for (const id of next) {
          if (!current.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return current;
      }
      return next;
    });
  }, [emailMinimapItems]);

  const minimapRafRef = useRef<number | null>(null);
  const scheduleEmailMinimapInView = useCallback(() => {
    if (minimapRafRef.current != null) return;
    minimapRafRef.current = window.requestAnimationFrame(() => {
      minimapRafRef.current = null;
      updateEmailMinimapInView();
    });
  }, [updateEmailMinimapInView]);

  useEffect(() => {
    const shell = threadScrollShellRef.current;
    if (!shell) return;
    const syncGutter = () => {
      const main =
        shell.querySelector<HTMLElement>(".email-detail-main") ?? shell;
      const width = main.getBoundingClientRect().width;
      setMinimapHasPersistentGutter(
        resolveEmailThreadMinimapHasPersistentGutter(width),
      );
      setMinimapHitStripWidth(resolveEmailThreadMinimapHitStripWidth(width));
    };
    syncGutter();
    const observer = new ResizeObserver(syncGutter);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [messageId, emailMinimapItems.length]);

  useEffect(() => {
    const scroller = threadScrollportRef.current;
    if (!scroller) return;
    updateEmailMinimapInView();
    const onScroll = () => scheduleEmailMinimapInView();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const frame = requestAnimationFrame(updateEmailMinimapInView);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      if (minimapRafRef.current != null) {
        cancelAnimationFrame(minimapRafRef.current);
        minimapRafRef.current = null;
      }
    };
  }, [
    scheduleEmailMinimapInView,
    updateEmailMinimapInView,
    messageId,
    emailMinimapItems.length,
    threadComments.length,
  ]);

  const jumpToEmailMinimapItem = useCallback((item: EmailThreadMinimapItem) => {
    const scroller = threadScrollportRef.current;
    if (!scroller) return;
    const section = scroller.querySelector<HTMLElement>(
      `[data-email-message="${CSS.escape(item.id)}"]`,
    );
    if (!section) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    scroller.scrollTop += sectionRect.top - scrollerRect.top - 16;
  }, []);

  const handleThreadBodyViewModeChange = useCallback(
    (next: EmailThreadBodyViewMode) => {
      setThreadBodyViewMode(next);
      try {
        window.localStorage.setItem(EMAIL_THREAD_BODY_VIEW_MODE_KEY, next);
      } catch {
        // ignore storage failures
      }
    },
    [],
  );

  return {
    threadBodyViewMode,
    handleThreadBodyViewModeChange,
    workingEnter,
    freshCommentIds,
    propertiesRailWidth,
    propertiesRailRef,
    threadScrollShellRef,
    threadScrollportRef,
    emailMinimapItems,
    minimapHasPersistentGutter,
    minimapHitStripWidth,
    minimapInViewIds,
    jumpToEmailMinimapItem,
  };
}
