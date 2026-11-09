"use client";

import { getTaskStatusHeaderGradientStyle } from "../../tasks/task-status-header-gradient.js";
import { SkeletonBlock } from "./skeleton-block.js";

export type InvoicesListSkeletonProps = {
  /** Number of faded placeholder rows. */
  rowCount?: number;
};

const COLUMN_HEADERS = [
  { id: "id", label: "Invoice ID" },
  { id: "reference", label: "Reference" },
  { id: "date", label: "Invoice Date" },
  { id: "organization", label: "Organization" },
  { id: "amount", label: "Amount", align: "end" as const },
  { id: "status", label: "Status", align: "end" as const, showGap: false },
] as const;

const ROW_BLOCK_WIDTHS = [
  { id: "w-14", reference: "w-32", org: "w-28" },
  { id: "w-16", reference: "w-28", org: "w-24" },
  { id: "w-20", reference: "w-36", org: "w-[7.5rem]" },
] as const;

function InvoiceColumnHeader({
  label,
  align = "start",
  showGap = true,
}: {
  label: string;
  align?: "start" | "end";
  showGap?: boolean;
}) {
  return (
    <span
      className={[
        "finance-invoices-table__th",
        align === "end" ? "finance-invoices-table__th--end" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {align === "end" ? (
        <span className="finance-invoices-table__th-spacer" aria-hidden="true" />
      ) : null}
      <span className="finance-invoices-table__th-label">{label}</span>
      {showGap ? (
        <span className="finance-invoices-table__th-gap" aria-hidden="true" />
      ) : null}
    </span>
  );
}

function InvoiceRowSkeleton({ index }: { index: number }) {
  const widths = ROW_BLOCK_WIDTHS[index % ROW_BLOCK_WIDTHS.length]!;

  return (
    <li className="finance-tx-row finance-invoices-row list-none">
      <div
        className="finance-tx-row__line finance-invoices-list-skeleton__row"
        data-skeleton-index={index}
        aria-hidden="true"
      >
        <div className="finance-tx-row__data finance-invoices-row__data">
          <div className="finance-invoices-row__cell finance-invoices-row__cell--id">
            <SkeletonBlock
              as="span"
              className={`finance-invoices-list-skeleton__block ${widths.id}`}
            />
          </div>
          <div className="finance-invoices-row__cell finance-invoices-row__cell--reference">
            <SkeletonBlock
              as="span"
              className={`finance-invoices-list-skeleton__block ${widths.reference}`}
            />
          </div>
          <div className="finance-invoices-row__cell finance-invoices-row__cell--date">
            <SkeletonBlock
              as="span"
              className="finance-invoices-list-skeleton__block w-16"
            />
          </div>
          <div className="finance-invoices-row__cell finance-invoices-row__cell--org">
            <SkeletonBlock
              as="span"
              className={`finance-invoices-list-skeleton__block ${widths.org}`}
            />
          </div>
          <div className="finance-invoices-row__cell finance-invoices-row__cell--amount">
            <SkeletonBlock
              as="span"
              className="finance-invoices-list-skeleton__block finance-invoices-list-skeleton__block--end w-[4.5rem]"
            />
          </div>
          <div className="finance-invoices-row__cell finance-invoices-row__cell--status">
            <SkeletonBlock
              as="span"
              className="finance-invoices-list-skeleton__block finance-invoices-list-skeleton__block--end w-14"
            />
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Invoices list loading state: real column headers with item-shaped skeleton
 * rows that fade down the list — same approach as TasksListSkeleton.
 */
export function InvoicesListSkeleton({
  rowCount = 8,
}: InvoicesListSkeletonProps) {
  return (
    <div
      className="finance-invoices-table-shell finance-invoices-list-skeleton"
      aria-busy="true"
      aria-label="Loading invoices"
    >
      <div
        className="status-group-header-row finance-invoices-columns-header"
        style={getTaskStatusHeaderGradientStyle("ready_to_start")}
      >
        <div className="finance-invoices-columns-header__cols">
          {COLUMN_HEADERS.map((column, index) => (
            <InvoiceColumnHeader
              key={column.id}
              label={column.label}
              align={"align" in column ? column.align : "start"}
              showGap={
                "showGap" in column
                  ? column.showGap
                  : index < COLUMN_HEADERS.length - 1
              }
            />
          ))}
        </div>
      </div>
      <ul className="finance-tx-list finance-invoices-list" role="list">
        {Array.from({ length: rowCount }, (_, index) => (
          <InvoiceRowSkeleton key={index} index={index} />
        ))}
      </ul>
    </div>
  );
}
