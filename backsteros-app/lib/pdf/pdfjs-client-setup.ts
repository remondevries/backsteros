"use client";

/**
 * Must run before `react-pdf` / `pdfjs-dist` is imported.
 * - Polyfills Promise.withResolvers for older WebKit (iOS 16–17.3).
 * - Picks modern vs legacy worker (legacy for Apple WebKit).
 * - Serves workers from `/public` (copied by `scripts/copy-pdf-worker.mjs`)
 *   so the worker version always matches the installed `pdfjs-dist`.
 */

function ensurePromiseWithResolversPolyfill() {
  if (typeof Promise.withResolvers === "function") {
    return;
  }

  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

function prefersLegacyPdfJsWorker(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent;
  const isAppleWebKit =
    /iPad|iPhone|iPod/.test(ua) ||
    (/\bSafari\b/.test(ua) &&
      !/\b(Chrome|Chromium|CriOS|FxiOS|EdgiOS)\b/.test(ua));

  return isAppleWebKit;
}

ensurePromiseWithResolversPolyfill();

export const pdfJsWorkerSrc = prefersLegacyPdfJsWorker()
  ? "/pdf.legacy.worker.min.mjs"
  : "/pdf.worker.min.mjs";
