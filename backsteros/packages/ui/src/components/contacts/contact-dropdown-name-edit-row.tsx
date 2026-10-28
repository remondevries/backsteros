"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PencilIcon } from "@primer/octicons-react";

import {
  contactDropdownNameEditModeAfterCommit,
  contactDropdownNameEditShowsPencil,
  resolveContactNameEditFields,
  type ContactDropdownNameEditMode,
} from "../../contacts/contact-dropdown-name-edit.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";

export type ContactDropdownNameEditSaveResult =
  | { ok: true }
  | { ok: false; error: string };

export type ContactDropdownNameEditRowProps = {
  contactId: string | null;
  contactName: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Contact selector (SearchableDropdown trigger + panel). */
  dropdown: ReactNode;
  disabled?: boolean;
  onSaveFirstName: (
    firstName: string,
  ) =>
    | Promise<ContactDropdownNameEditSaveResult>
    | ContactDropdownNameEditSaveResult;
  onSaveLastName: (
    lastName: string,
  ) =>
    | Promise<ContactDropdownNameEditSaveResult>
    | ContactDropdownNameEditSaveResult;
};

/**
 * Contact dropdown row with a hover/focus pencil that swaps the dropdown for
 * inline First / Last name editors (Contacts-tab OverviewNameEditor).
 */
export function ContactDropdownNameEditRow({
  contactId,
  contactName,
  firstName,
  lastName,
  dropdown,
  disabled = false,
  onSaveFirstName,
  onSaveLastName,
}: ContactDropdownNameEditRowProps) {
  const rowId = useId();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<ContactDropdownNameEditMode>("dropdown");
  const [firstNameFocusRequest, setFirstNameFocusRequest] = useState(0);
  const [lastNameFocusRequest, setLastNameFocusRequest] = useState(0);

  const fields = resolveContactNameEditFields({
    firstName,
    lastName,
    displayName: contactName,
  });
  const [draftFirst, setDraftFirst] = useState(fields.firstName);
  const [draftLast, setDraftLast] = useState(fields.lastName);

  useEffect(() => {
    setMode("dropdown");
  }, [contactId]);

  useEffect(() => {
    if (mode !== "editing") {
      setDraftFirst(fields.firstName);
      setDraftLast(fields.lastName);
    }
  }, [fields.firstName, fields.lastName, mode]);

  const exitToDropdown = useCallback(() => {
    setMode(contactDropdownNameEditModeAfterCommit());
  }, []);

  const beginEditing = useCallback(() => {
    if (disabled || !contactId?.trim()) return;
    setDraftFirst(fields.firstName);
    setDraftLast(fields.lastName);
    setMode("editing");
    setFirstNameFocusRequest((count) => count + 1);
  }, [contactId, disabled, fields.firstName, fields.lastName]);

  const showPencil = contactDropdownNameEditShowsPencil({ contactId, mode });

  if (mode === "editing") {
    return (
      <div
        ref={rowRef}
        className="contact-dropdown-name-edit contact-dropdown-name-edit--editing contact-overview__name-row"
        data-contact-dropdown-name-edit={rowId}
        onKeyDownCapture={(event) => {
          if (event.key !== "Escape") return;
          // Capture so we exit before the field swallows Escape — discard draft.
          event.preventDefault();
          event.stopPropagation();
          exitToDropdown();
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && rowRef.current?.contains(next)) {
            return;
          }
          // Blur out of the row after a field save — return to dropdown.
          exitToDropdown();
        }}
      >
        <OverviewNameEditor
          value={draftFirst}
          entityLabel="First name"
          resetKey={`${contactId ?? "none"}:party-first`}
          renameFocusRequest={firstNameFocusRequest}
          fitContent
          onLeaveTitle={() => {
            setLastNameFocusRequest((count) => count + 1);
          }}
          onSave={async (next) => {
            const result = await onSaveFirstName(next);
            if (result.ok) setDraftFirst(next);
            return result;
          }}
        />
        <OverviewNameEditor
          value={draftLast}
          entityLabel="Last name"
          resetKey={`${contactId ?? "none"}:party-last`}
          renameFocusRequest={lastNameFocusRequest}
          allowEmpty
          fitContent
          titleClassName="contact-overview__last-name"
          onLeaveTitle={() => {
            exitToDropdown();
          }}
          onSave={async (next) => {
            const result = await onSaveLastName(next);
            if (result.ok) setDraftLast(next);
            return result;
          }}
          onSaved={() => {
            exitToDropdown();
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className={[
        "contact-dropdown-name-edit",
        "contact-dropdown-name-edit--dropdown",
        showPencil ? "contact-dropdown-name-edit--linked" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-contact-dropdown-name-edit={rowId}
    >
      {dropdown}
      {showPencil ? (
        <button
          type="button"
          className="contact-dropdown-name-edit__pencil"
          aria-label="Edit contact name"
          title="Edit first and last name"
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            beginEditing();
          }}
        >
          <PencilIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}
