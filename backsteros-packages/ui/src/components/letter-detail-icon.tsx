"use client";

import { LetterIcon } from "./letter-icon.js";

export type LetterDetailIconProps = {
  icon?: string | null;
  title: string;
};

/**
 * Bordered 32×32 icon chip above letter titles (document detail icon parity).
 * Compose / detail currently show the default letter glyph; `icon` reserved
 * for future custom letter icons.
 */
export function LetterDetailIcon({
  icon: _icon = null,
  title,
}: LetterDetailIconProps) {
  void _icon;
  return (
    <div className="document-detail-icon">
      <span
        className="document-detail-icon__button"
        aria-hidden="true"
        title={title}
      >
        <LetterIcon size={16} className="document-detail-icon__glyph" />
      </span>
    </div>
  );
}
