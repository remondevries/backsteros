"use client";

import { useEffect, useState } from "react";

import {
  APP_TOAST_EVENT,
  type AppToastDetail,
} from "../../toast/app-toast.js";

const DEFAULT_DURATION_MS = 1800;

type ToastState = {
  id: number;
  message: string;
  durationMs: number;
};

/**
 * Fixed bottom-center toast for brief confirmations (e.g. ⌘. copied an id).
 * Mount once in the product shell.
 */
export function AppToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    function onToast(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as AppToastDetail | null;
      const message = detail?.message?.trim();
      if (!message) return;
      setToast({
        id: Date.now(),
        message,
        durationMs:
          typeof detail?.durationMs === "number" && detail.durationMs > 0
            ? detail.durationMs
            : DEFAULT_DURATION_MS,
      });
    }

    window.addEventListener(APP_TOAST_EVENT, onToast);
    return () => window.removeEventListener(APP_TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="app-toast-host" aria-live="polite" aria-atomic="true">
      <div className="app-toast" role="status" key={toast.id}>
        {toast.message}
      </div>
    </div>
  );
}
