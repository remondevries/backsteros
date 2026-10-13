/**
 * When a codebase PR/commit detail owns number keys (1–3), section-tab
 * shortcuts (Tasks/Files/Docs/Commits/PRs) must yield.
 */

let codebaseDetailHotkeysActive = false;

export function setCodebaseDetailHotkeysActive(active: boolean): void {
  codebaseDetailHotkeysActive = active;
}

export function isCodebaseDetailHotkeysActive(): boolean {
  return codebaseDetailHotkeysActive;
}
