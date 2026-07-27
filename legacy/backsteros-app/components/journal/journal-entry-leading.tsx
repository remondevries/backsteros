import {
  CONTENT_DETAIL_TITLE_BODY_GAP_CLASS,
  CONTENT_DETAIL_TOP_PADDING_CLASS,
  DOCUMENT_CONTENT_MAX_WIDTH,
} from "@/lib/documents/content-layout";

import { JournalWhoopLeading } from "./journal-whoop-leading";

type JournalEntryLeadingProps = {
  dateSlug: string;
  title: string;
};

/** Whoop metrics + date title; stays fixed above edit/preview body so mode switches do not shift layout. */
export function JournalEntryLeading({ dateSlug, title }: JournalEntryLeadingProps) {
  return (
    <header
      className={`mx-auto box-border w-full shrink-0 px-4 ${CONTENT_DETAIL_TOP_PADDING_CLASS}`}
      style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
    >
      <JournalWhoopLeading dateSlug={dateSlug} />
      <h1
        className={`${CONTENT_DETAIL_TITLE_BODY_GAP_CLASS} text-center text-2xl font-semibold leading-tight text-foreground`}
      >
        {title}
      </h1>
    </header>
  );
}
