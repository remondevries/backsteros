/**
 * Run after the browser has painted the current frame.
 *
 * A single `requestAnimationFrame` fires *before* that paint — too early to
 * unmount the command palette if we just hid it for a navigation.
 */
export function afterNextPaint(callback: () => void): void {
  if (typeof requestAnimationFrame === "undefined") {
    callback();
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}
