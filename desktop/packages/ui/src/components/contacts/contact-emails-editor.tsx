"use client";

export type ContactEmailsEditorProps = {
  value: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
  onSave: (next: string[]) => void;
};

/**
 * Additional email addresses for a contact (primary email is edited separately).
 */
export function ContactEmailsEditor({
  value,
  disabled = false,
  onChange,
  onSave,
}: ContactEmailsEditorProps) {
  function updateRow(index: number, nextValue: string) {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? nextValue : entry)));
  }

  function removeRow(index: number) {
    const next = value.filter((_, entryIndex) => entryIndex !== index);
    onChange(next);
    onSave(next);
  }

  function addRow() {
    onChange([...value, ""]);
  }

  return (
    <div className="contact-emails">
      {value.length === 0 ? (
        <p className="contact-emails__empty">No additional email addresses yet.</p>
      ) : null}

      {value.map((entry, index) => (
        <div key={`email-${index}`} className="contact-emails__row">
          <input
            id={index === 0 ? "contact-email-additional-0" : undefined}
            type="email"
            aria-label={`Additional email ${index + 1}`}
            value={entry}
            disabled={disabled}
            placeholder="name@example.com"
            onChange={(event) => updateRow(index, event.target.value)}
            onBlur={() => onSave(value)}
            className="entity-overview-input"
          />
          <button
            type="button"
            className="contact-emails__remove"
            disabled={disabled}
            onClick={() => removeRow(index)}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="contact-emails__add"
        disabled={disabled || value.length >= 20}
        onClick={addRow}
      >
        Add email address
      </button>
    </div>
  );
}
