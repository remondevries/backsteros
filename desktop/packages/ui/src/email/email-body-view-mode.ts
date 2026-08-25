import type { EmailThreadBodyViewMode } from "./email.js";
import type { HorizontalArrowDirection } from "../compose/compose-modal-events.js";

export const EMAIL_BODY_VIEW_MODE_ORDER: readonly EmailThreadBodyViewMode[] = [
  "plain",
  "rendered",
  "source",
];

export function getAdjacentEmailBodyViewMode(
  current: EmailThreadBodyViewMode,
  direction: HorizontalArrowDirection,
): EmailThreadBodyViewMode {
  const index = EMAIL_BODY_VIEW_MODE_ORDER.indexOf(current);
  const currentIndex = index === -1 ? 0 : index;
  const offset = direction === "left" ? -1 : 1;
  const nextIndex =
    (currentIndex + offset + EMAIL_BODY_VIEW_MODE_ORDER.length) %
    EMAIL_BODY_VIEW_MODE_ORDER.length;
  return EMAIL_BODY_VIEW_MODE_ORDER[nextIndex] ?? "plain";
}
