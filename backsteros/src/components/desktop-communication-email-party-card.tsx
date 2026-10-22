import { useMemo, type ReactNode } from "react";

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
  organizationOptions: SearchableDropdownOption<string>[];
  contactOptions: SearchableDropdownOption<string>[];
  sections: readonly ContactSectionConfig[];
  section: ContactSectionId;
  onSectionChange: (section: ContactSectionId) => void;
  onSelectOrganization: (organizationId: string) => void;
  onCreateOrganizationFromQuery?: (query: string) => void;
  onSelectContact: (contactId: string) => void;
  onCreateContactFromQuery?: (query: string) => void;
  linking?: boolean;
  children: ReactNode;
};

/**
 * Org-first party chrome for Communication → Chat email selection — cover shows
 * the org logo, the dashed/title name picks the organization, and the groups
 * row under it picks a contact once an org is linked.
 */
export function DesktopCommunicationEmailPartyCard({
  partyName,
  organizationId,
  organizationName,
  organizationAvatarSrc,
  contactId,
  contactName,
  contactAvatarSrc,
  organizationOptions,
  contactOptions,
  sections,
  section,
  onSectionChange,
  onSelectOrganization,
  onCreateOrganizationFromQuery,
  onSelectContact,
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

  const orgTitle =
    organizationName?.trim() || partyName.trim() || "Select organization";

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
                {organizationId ? (
                  <div className="contact-overview__groups-dropdown">
                    <SearchableDropdown
                      value={contactId}
                      options={contactPickerOptions}
                      onChange={(next) => {
                        const nextId = resolveDropdownNone(next);
                        if (nextId) onSelectContact(nextId);
                      }}
                      disabled={linking}
                      searchPlaceholder="Search contacts…"
                      ariaLabel="Select contact"
                      emptySelectionLabel="Select contact"
                      className="property-dropdown property-dropdown--inline-chip"
                      panelAlign="start"
                      panelWidth={280}
                      createFromQueryLabel={
                        onCreateContactFromQuery
                          ? (query) =>
                              getCreateEntityFromQueryLabel("contact", query)
                          : undefined
                      }
                      onCreateFromQuery={onCreateContactFromQuery}
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
                            contactName?.trim()
                              ? `Contact: ${contactName}`
                              : "Select contact"
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggle();
                          }}
                          className={[
                            "property-dropdown-trigger",
                            "property-dropdown-trigger--inline-chip",
                            "contact-overview__groups-trigger",
                            open ? "is-open" : null,
                            !contactId ? "is-muted" : null,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
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
                          <span className="property-dropdown-trigger__label">
                            {contactName?.trim() || "Select contact"}
                          </span>
                        </button>
                      )}
                    />
                  </div>
                ) : null}
                {organizationName?.trim() &&
                partyName.trim() &&
                partyName.trim().toLowerCase() !==
                  organizationName.trim().toLowerCase() ? (
                  <p className="contact-overview__subtitle contact-overview__subtitle--muted communication-email-party__org-label">
                    {partyName.trim()}
                  </p>
                ) : null}
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
            <div className="contact-overview__scroll">{children}</div>
          </div>
        </article>
      </div>
    </div>
  );
}
