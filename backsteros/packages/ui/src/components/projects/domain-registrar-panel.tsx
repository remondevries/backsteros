"use client";

import { useEffect, useState } from "react";

export type DomainRegistrarNameserver = {
  hostname: string;
  ipv4: string | null;
  ipv6: string | null;
};

export type DomainRegistrarContact = {
  type: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  companyKvk: string | null;
  companyType: string | null;
  street: string | null;
  number: string | null;
  postalCode: string | null;
  city: string | null;
  phoneNumber: string | null;
  faxNumber: string | null;
  email: string | null;
  country: string | null;
};

export type DomainRegistrarDetail = {
  name: string;
  status: string | null;
  registrationDate?: string | null;
  renewalDate?: string | null;
  isDnsOnly?: boolean;
  tags: string[];
  nameservers: DomainRegistrarNameserver[];
  contacts: DomainRegistrarContact[];
};

export type DomainAuthCodeRevealResult = {
  authCode: string | null;
  error: string | null;
};

export type DomainRegistrarPanelProps = {
  domainName: string;
  loadDetail: (domainName: string) => Promise<DomainRegistrarDetail>;
  /** Explicit owner/elevated reveal — never loaded with domain detail. */
  revealAuthCode?: (
    domainName: string,
  ) => Promise<DomainAuthCodeRevealResult>;
};

function contactDisplayName(contact: DomainRegistrarContact): string {
  const person = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  if (contact.companyName && person) return `${contact.companyName} (${person})`;
  return contact.companyName || person || "Contact";
}

function contactAddress(contact: DomainRegistrarContact): string | null {
  const line1 = [contact.street, contact.number].filter(Boolean).join(" ");
  const line2 = [contact.postalCode, contact.city].filter(Boolean).join(" ");
  const parts = [line1, line2, contact.country?.toUpperCase()].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * TransIP registrar extras for Catalog Domains side panel:
 * nameservers, WHOIS contacts, and an explicit transfer-code reveal.
 */
export function DomainRegistrarPanel({
  domainName,
  loadDetail,
  revealAuthCode,
}: DomainRegistrarPanelProps) {
  const [detail, setDetail] = useState<DomainRegistrarDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setAuthCode(null);
    setAuthError(null);
    setCopied(false);
    void loadDetail(domainName)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load TransIP details",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [domainName, loadDetail]);

  async function handleRevealAuthCode() {
    if (!revealAuthCode) return;
    const confirmed = window.confirm(
      `Reveal the transfer code for ${domainName}? This is audited.`,
    );
    if (!confirmed) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = await revealAuthCode(domainName);
      setAuthCode(result.authCode);
      setAuthError(result.error);
    } catch (err: unknown) {
      setAuthCode(null);
      setAuthError(
        err instanceof Error ? err.message : "Could not reveal transfer code",
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function copyAuthCode() {
    if (!authCode) return;
    try {
      await navigator.clipboard.writeText(authCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="domain-registrar-panel">
      <h3 className="domain-registrar-panel__heading">Registrar</h3>
      {loading ? (
        <p className="domain-registrar-panel__muted">Loading TransIP…</p>
      ) : null}
      {error ? (
        <p className="domain-registrar-panel__error">{error}</p>
      ) : null}
      {detail ? (
        <>
          <div className="domain-registrar-panel__block">
            <div className="domain-registrar-panel__label">Transfer code</div>
            {authCode ? (
              <div className="domain-registrar-panel__auth-row">
                <code className="domain-registrar-panel__auth-code">
                  {authCode}
                </code>
                <button
                  type="button"
                  className="domain-registrar-panel__button"
                  onClick={() => {
                    void copyAuthCode();
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  className="domain-registrar-panel__button"
                  onClick={() => {
                    setAuthCode(null);
                    setAuthError(null);
                  }}
                >
                  Hide
                </button>
              </div>
            ) : (
              <div className="domain-registrar-panel__auth-row">
                {revealAuthCode ? (
                  <button
                    type="button"
                    className="domain-registrar-panel__button"
                    disabled={authLoading}
                    onClick={() => {
                      void handleRevealAuthCode();
                    }}
                  >
                    {authLoading ? "Revealing…" : "Reveal transfer code"}
                  </button>
                ) : null}
                {authError ? (
                  <p className="domain-registrar-panel__muted">{authError}</p>
                ) : !revealAuthCode ? (
                  <p className="domain-registrar-panel__muted">
                    Transfer code reveal unavailable
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="domain-registrar-panel__block">
            <div className="domain-registrar-panel__label">Nameservers</div>
            {detail.nameservers.length === 0 ? (
              <p className="domain-registrar-panel__muted">No nameservers</p>
            ) : (
              <ul className="domain-registrar-panel__list">
                {detail.nameservers.map((ns) => (
                  <li key={ns.hostname}>
                    <span className="domain-registrar-panel__ns-host">
                      {ns.hostname}
                    </span>
                    {ns.ipv4 || ns.ipv6 ? (
                      <span className="domain-registrar-panel__muted">
                        {[ns.ipv4, ns.ipv6].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="domain-registrar-panel__block">
            <div className="domain-registrar-panel__label">WHOIS contacts</div>
            {detail.contacts.length === 0 ? (
              <p className="domain-registrar-panel__muted">No contacts</p>
            ) : (
              <ul className="domain-registrar-panel__contacts">
                {detail.contacts.map((contact, index) => {
                  const address = contactAddress(contact);
                  return (
                    <li
                      key={`${contact.type ?? "contact"}-${index}`}
                      className="domain-registrar-panel__contact"
                    >
                      <div className="domain-registrar-panel__contact-type">
                        {contact.type ?? "contact"}
                      </div>
                      <div className="domain-registrar-panel__contact-name">
                        {contactDisplayName(contact)}
                      </div>
                      {contact.email ? (
                        <div className="domain-registrar-panel__muted">
                          {contact.email}
                        </div>
                      ) : null}
                      {contact.phoneNumber ? (
                        <div className="domain-registrar-panel__muted">
                          {contact.phoneNumber}
                        </div>
                      ) : null}
                      {address ? (
                        <div className="domain-registrar-panel__muted">
                          {address}
                        </div>
                      ) : null}
                      {contact.companyKvk ? (
                        <div className="domain-registrar-panel__muted">
                          KvK {contact.companyKvk}
                          {contact.companyType
                            ? ` · ${contact.companyType}`
                            : ""}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
