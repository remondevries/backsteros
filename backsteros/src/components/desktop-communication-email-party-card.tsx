import { useMemo, type ReactNode } from "react";
import { Check } from "lucide-react";

import {
  ContactPersonIcon,
  DROPDOWN_NONE_VALUE,
  EntityAvatarIcon,
  getCreateEntityFromQueryLabel,
  OrganizationIcon,
  resolveDropdownNone,
  SearchableDropdown,
  SegmentedPillToggle,
  type ContactSectionConfig,
  type ContactSectionId,
  type SearchableDropdownOption,
} from "@backsteros/ui";

type DesktopCommunicationEmailPartyCardProps = {
  partyName: string;
  organizationId: string | null;
  organizationName: string | null;
  organizationAvatarSrc: string | null;
  contactId: string | null;
  contactName: string | null;
  contactAvatarSrc: string | null;
  /**
   * Party address is one of the selected organization’s emails — show as plain
   * text (org mailbox), not a contact picker.
   */
  partyEmailBelongsToOrganization?: boolean;
  organizationOptions: SearchableDropdownOption<string>[];
  contactOptions: SearchableDropdownOption<string>[];
  sections: readonly ContactSectionConfig[];
  section: ContactSectionId;
  onSectionChange: (section: ContactSectionId) => void;
  onSelectOrganization: (organizationId: string) => void;
  onClearOrganization?: () => void;
  onCreateOrganizationFromQuery?: (query: string) => void;
  onSelectContact: (contactId: string) => void;
  onClearContact?: () => void;
  /**
   * Add the dashed party address as an `other` email on the linked org/contact.
   */
  onAddPartyEmailAsOther?: () => void | Promise<void>;
  /** Aria label for the hover check (org vs contact). */
  addPartyEmailAsOtherLabel?: string;
  onCreateContactFromQuery?: (query: string) => void;
  linking?: boolean;
  children: ReactNode;
};

/**
 * Org-first party chrome for Communication → Chat email selection — cover shows
 * the org logo, the title picks the organization. When the party address belongs
 * to that org, it is plain text; otherwise a dashed contact picker invites a
 * link. A linked contact keeps the contact chip dropdown.
 */
export function DesktopCommunicationEmailPartyCard({
  partyName,
  organizationId,
  organizationName,
  organizationAvatarSrc,
  contactId,
  contactName,
  contactAvatarSrc,
  partyEmailBelongsToOrganization = false,
  organizationOptions,
  contactOptions,
  sections,
  section,
  onSectionChange,
  onSelectOrganization,
  onClearOrganization,
  onCreateOrganizationFromQuery,
  onSelectContact,
  onClearContact,
  onAddPartyEmailAsOther,
  addPartyEmailAsOtherLabel = "Add email as other",
  onCreateContactFromQuery,
  linking = false,
  children,
}: DesktopCommunicationEmailPartyCardProps) {
  const orgPickerOptions = useMemo(
    () =>
      organizationOptions.filter(
        (option) => option.value !== DROPDOWN_NONE_VALUE,
      ),
    [organizationOptions],
  );
  const contactPickerOptions = useMemo(
    () =>
      contactOptions.filter((option) => option.value !== DROPDOWN_NONE_VALUE),
    [contactOptions],
  );

  const sectionOptions = useMemo(
    () =>
      sections.map((entry, index) => ({
        value: entry.id,
        label: entry.label,
        shortcut: String(index + 1),
      })),
    [sections],
  );
  const cardSectionIdsAttr = sections.map((entry) => entry.id).join(",");
  const navSection: ContactSectionId = sections.some(
    (entry) => entry.id === section,
  )
    ? section
    : "conversation";

  // Unlinked: always “Select organization” so the title reads as an org picker,
  // not a static From address. The party email stays on the contact chip below.
  const orgTitle =
    organizationName?.trim() ||
    (organizationId ? partyName.trim() : "") ||
    "Select organization";
  const partyLabel =
    partyName.trim() || contactName?.trim() || "Select contact";

  const orgCover = (
    <div className="avatar-upload avatar-upload--cover">
      <div className="avatar-upload__frame">
        <div
          className={[
            "avatar-upload__button",
            "avatar-upload__button--cover",
            "communication-chat-contact-cover--static",
            organizationAvatarSrc ? "avatar-upload__button--image" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          role="img"
          aria-label={
            organizationName?.trim()
              ? `Organization: ${organizationName}`
              : "Organization"
          }
        >
          {organizationAvatarSrc ? (
            <img
              src={organizationAvatarSrc}
              alt=""
              className="avatar-upload__img"
            />
          ) : (
            <span aria-hidden="true" className="avatar-upload__placeholder">
              <OrganizationIcon size={48} />
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const contactChip = (opts: { allowAddAsOther: boolean }) => (
    <div
      className={[
        "contact-overview__groups-dropdown",
        opts.allowAddAsOther
          ? "communication-email-party__unknown-email"
          : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <SearchableDropdown
        value={contactId}
        options={contactPickerOptions}
        onChange={(next) => {
          const nextId = resolveDropdownNone(next);
          if (nextId) onSelectContact(nextId);
        }}
        allowDeselect={Boolean(onClearContact)}
        onClear={onClearContact}
        deselectLabel={onClearContact ? "Remove contact" : undefined}
        disabled={linking}
        searchPlaceholder="Search contacts…"
        ariaLabel="Select contact"
        emptySelectionLabel="Select contact"
        className="property-dropdown property-dropdown--inline-chip"
        panelAlign="start"
        panelWidth={280}
        createFromQueryLabel={
          onCreateContactFromQuery
            ? (query) => getCreateEntityFromQueryLabel("contact", query)
            : undefined
        }
        onCreateFromQuery={onCreateContactFromQuery}
        renderTrigger={({ open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={
              contactId && contactName?.trim()
                ? `Contact: ${contactName}`
                : `Select contact for ${partyLabel}`
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className={[
              "property-dropdown-trigger",
              "property-dropdown-trigger--inline-chip",
              "contact-overview__groups-trigger",
              "communication-email-party__contact-trigger",
              contactId
                ? "communication-email-party__contact-trigger--linked"
                : "communication-email-party__contact-trigger--unlinked",
              open ? "is-open" : null,
              !contactId ? "is-muted" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {contactId ? (
              <span
                className="property-dropdown-trigger__icon"
                aria-hidden="true"
              >
                {contactAvatarSrc ? (
                  <EntityAvatarIcon
                    src={contactAvatarSrc}
                    size={14}
                    kind="contact"
                  />
                ) : (
                  <ContactPersonIcon size={14} />
                )}
              </span>
            ) : null}
            <span className="property-dropdown-trigger__label">
              {contactId ? contactName?.trim() || "Contact" : partyLabel}
            </span>
          </button>
        )}
      />
      {opts.allowAddAsOther && onAddPartyEmailAsOther ? (
        <button
          type="button"
          className="communication-email-party__add-email"
          aria-label={addPartyEmailAsOtherLabel}
          title={addPartyEmailAsOtherLabel}
          disabled={linking}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void onAddPartyEmailAsOther();
          }}
        >
          <Check size={14} strokeWidth={2.25} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );

  let partySecondary: ReactNode;
  if (organizationId) {
    if (contactId) {
      partySecondary = contactChip({ allowAddAsOther: false });
    } else if (partyEmailBelongsToOrganization) {
      partySecondary = partyLabel ? (
        <p className="communication-email-party__org-email">{partyLabel}</p>
      ) : null;
    } else {
      partySecondary = contactChip({
        allowAddAsOther: Boolean(onAddPartyEmailAsOther),
      });
    }
  } else if (contactId) {
    // Contact linked without an org yet — still show the contact chip under
    // the org picker so the title stays the organization control.
    partySecondary = contactChip({ allowAddAsOther: false });
  } else {
    // Unfiled party — invite a contact under the org title.
    partySecondary = contactChip({
      allowAddAsOther: false,
    });
  }

  return (
    <div className="contact-detail" data-content-detail>
      <div className="contact-detail__overview">
        <article className="entity-overview contact-overview">
          <div className="contact-overview__cover">{orgCover}</div>
          <div className="contact-overview__chrome">
            <header className="entity-overview__header contact-overview__header">
              <div className="contact-overview__identity">
                <SearchableDropdown
                  className="communication-email-party__org-dropdown"
                  value={organizationId}
                  options={orgPickerOptions}
                  onChange={(next) => {
                    const nextId = resolveDropdownNone(next);
                    if (nextId) onSelectOrganization(nextId);
                  }}
                  allowDeselect={Boolean(onClearOrganization)}
                  onClear={onClearOrganization}
                  deselectLabel={
                    onClearOrganization ? "Remove organisation" : undefined
                  }
                  disabled={linking}
                  searchPlaceholder="Search organizations…"
                  ariaLabel="Select organization"
                  emptySelectionLabel="Select organization"
                  panelWidth={280}
                  panelAlign="start"
                  createFromQueryLabel={
                    onCreateOrganizationFromQuery
                      ? (query) =>
                          getCreateEntityFromQueryLabel("organization", query)
                      : undefined
                  }
                  onCreateFromQuery={onCreateOrganizationFromQuery}
                  renderTrigger={({
                    open,
                    disabled,
                    triggerId,
                    onToggle,
                  }) => (
                    <button
                      type="button"
                      id={triggerId}
                      disabled={disabled}
                      aria-haspopup="listbox"
                      aria-expanded={open}
                      aria-label={
                        organizationName?.trim()
                          ? `Organization: ${organizationName}`
                          : "Select organization"
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggle();
                      }}
                      className={[
                        "communication-email-party__name",
                        organizationId
                          ? "communication-email-party__name--linked"
                          : "communication-email-party__name--unlinked",
                        open ? "is-open" : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {orgTitle}
                    </button>
                  )}
                />
                {partySecondary}
              </div>
            </header>
            {sections.length > 1 ? (
              <div
                className="contact-section-tabs"
                data-contact-card-section-ids={cardSectionIdsAttr}
              >
                <SegmentedPillToggle
                  ariaLabel="Email party sections"
                  value={navSection}
                  options={sectionOptions}
                  onChange={onSectionChange}
                />
              </div>
            ) : (
              <div
                className="contact-section-tabs"
                data-contact-card-section-ids={cardSectionIdsAttr}
                hidden
              />
            )}
          </div>
          {/* Sibling of chrome (not nested) so flex-shrink:0 chrome
              does not clip long tab bodies — same as ContactOverviewView. */}
          <div className="contact-overview__scroll">{children}</div>
        </article>
      </div>
    </div>
  );
}
