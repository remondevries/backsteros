"use client";

import type { ClientEstimate } from "@backsteros/contracts";
import { useMemo, useState } from "react";

import type { OrganizationListItem } from "../../navigation/entity-routes.js";
import { EntityDetailLayout } from "../entity/entity-detail-layout.js";

export type FinanceEstimatesViewProps = {
  estimates: ClientEstimate[];
  organizations: OrganizationListItem[];
  loading?: boolean;
  error?: string | null;
  selectedEstimateId: string | null;
  onSelectedEstimateChange: (id: string | null) => void;
  onCreateEstimate: (input: {
    title: string;
    subtitle?: string;
    organizationId?: string;
    clientLabel?: string;
    authorName?: string;
    versionLabel?: string;
    documentDate?: string;
    proposalMarkdown?: string;
    estimateMarkdown?: string;
    status?: "draft" | "published" | "archived";
  }) => Promise<void>;
  creating?: boolean;
};

type DocTab = "proposal" | "estimate";

export function FinanceEstimatesView({
  estimates,
  organizations,
  loading = false,
  error = null,
  selectedEstimateId,
  onSelectedEstimateChange,
  onCreateEstimate,
  creating = false,
}: FinanceEstimatesViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [docTab, setDocTab] = useState<DocTab>("proposal");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [authorName, setAuthorName] = useState("Remon de Vries");
  const [versionLabel, setVersionLabel] = useState("1 (concept)");
  const [documentDate, setDocumentDate] = useState("");
  const [proposalMarkdown, setProposalMarkdown] = useState(
    "# Proposal\n\nDescribe the work here.\n",
  );
  const [estimateMarkdown, setEstimateMarkdown] = useState(
    "# Estimate\n\n| Item | Hours | Amount |\n| --- | --- | --- |\n| Example | 8 | € 760,00 |\n",
  );

  const selected = useMemo(
    () => estimates.find((row) => row.id === selectedEstimateId) ?? null,
    [estimates, selectedEstimateId],
  );

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of organizations) map.set(org.id, org.name);
    return map;
  }, [organizations]);

  async function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed) return;
    await onCreateEstimate({
      title: trimmed,
      subtitle: subtitle.trim() || undefined,
      organizationId: organizationId || undefined,
      clientLabel:
        clientLabel.trim() ||
        (organizationId ? orgNameById.get(organizationId) : undefined) ||
        undefined,
      authorName: authorName.trim() || undefined,
      versionLabel: versionLabel.trim() || undefined,
      documentDate: documentDate.trim() || undefined,
      proposalMarkdown,
      estimateMarkdown,
      status: "draft",
    });
    setShowCreate(false);
    setTitle("");
    setSubtitle("");
  }

  return (
    <EntityDetailLayout sectionLabel="Finance" title="Estimates">
      <div className="finance-estimates-view">
        <div className="finance-estimates-view__toolbar">
          <p className="finance-empty" style={{ margin: 0 }}>
            Proposal + estimate markdown posts for the client portal.
          </p>
          <button
            type="button"
            className="finance-chrome-actions__button"
            onClick={() => setShowCreate((open) => !open)}
          >
            {showCreate ? "Cancel" : "New estimate"}
          </button>
        </div>

        {error ? <p className="finance-empty">{error}</p> : null}
        {loading ? <p className="finance-empty">Loading estimates…</p> : null}

        {showCreate ? (
          <div className="finance-estimates-view__create">
            <label className="finance-estimates-view__field">
              <span>Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Website platform"
              />
            </label>
            <label className="finance-estimates-view__field">
              <span>Subtitle</span>
              <input
                value={subtitle}
                onChange={(event) => setSubtitle(event.target.value)}
                placeholder="First phase"
              />
            </label>
            <label className="finance-estimates-view__field">
              <span>Organization</span>
              <select
                value={organizationId}
                onChange={(event) => {
                  const next = event.target.value;
                  setOrganizationId(next);
                  if (!clientLabel.trim() && next) {
                    setClientLabel(orgNameById.get(next) ?? "");
                  }
                }}
              >
                <option value="">Select organization</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="finance-estimates-view__field">
              <span>Client label</span>
              <input
                value={clientLabel}
                onChange={(event) => setClientLabel(event.target.value)}
              />
            </label>
            <div className="finance-estimates-view__row">
              <label className="finance-estimates-view__field">
                <span>Author</span>
                <input
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                />
              </label>
              <label className="finance-estimates-view__field">
                <span>Version</span>
                <input
                  value={versionLabel}
                  onChange={(event) => setVersionLabel(event.target.value)}
                />
              </label>
              <label className="finance-estimates-view__field">
                <span>Date label</span>
                <input
                  value={documentDate}
                  onChange={(event) => setDocumentDate(event.target.value)}
                  placeholder="oktober 2026"
                />
              </label>
            </div>
            <label className="finance-estimates-view__field">
              <span>Proposal markdown</span>
              <textarea
                rows={8}
                value={proposalMarkdown}
                onChange={(event) => setProposalMarkdown(event.target.value)}
              />
            </label>
            <label className="finance-estimates-view__field">
              <span>Estimate markdown</span>
              <textarea
                rows={8}
                value={estimateMarkdown}
                onChange={(event) => setEstimateMarkdown(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="finance-chrome-actions__button"
              disabled={creating || !title.trim()}
              onClick={() => {
                void handleCreate();
              }}
            >
              {creating ? "Creating…" : "Create estimate"}
            </button>
          </div>
        ) : null}

        {!loading && estimates.length === 0 && !showCreate ? (
          <p className="finance-empty">
            No estimates yet. Create one to publish proposal + estimate markdown
            to the portal.
          </p>
        ) : null}

        {estimates.length > 0 ? (
          <div className="finance-estimates-view__split">
            <ul className="finance-tx-list" role="list">
              {estimates.map((estimate) => {
                const active = estimate.id === selectedEstimateId;
                return (
                  <li key={estimate.id}>
                    <button
                      type="button"
                      className={
                        active
                          ? "finance-invoices-row is-selected"
                          : "finance-invoices-row"
                      }
                      onClick={() => onSelectedEstimateChange(estimate.id)}
                    >
                      <span className="finance-invoices-row__primary">
                        <strong>{estimate.title}</strong>
                        <span>
                          {estimate.clientLabel ||
                            (estimate.organizationId
                              ? orgNameById.get(estimate.organizationId)
                              : null) ||
                            "No client"}{" "}
                          · {estimate.status}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {selected ? (
              <article className="finance-estimates-view__detail">
                <header>
                  <h3>{selected.title}</h3>
                  {selected.subtitle ? <p>{selected.subtitle}</p> : null}
                  <dl>
                    <div>
                      <dt>Client</dt>
                      <dd>{selected.clientLabel || "—"}</dd>
                    </div>
                    <div>
                      <dt>Author</dt>
                      <dd>{selected.authorName || "—"}</dd>
                    </div>
                    <div>
                      <dt>Version</dt>
                      <dd>{selected.versionLabel || "—"}</dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>{selected.documentDate || "—"}</dd>
                    </div>
                  </dl>
                  <div className="widget-nav" role="tablist">
                    <button
                      type="button"
                      className={
                        docTab === "proposal"
                          ? "widget-nav__link widget-nav__link--active"
                          : "widget-nav__link widget-nav__link--idle"
                      }
                      onClick={() => setDocTab("proposal")}
                    >
                      Proposal
                    </button>
                    <button
                      type="button"
                      className={
                        docTab === "estimate"
                          ? "widget-nav__link widget-nav__link--active"
                          : "widget-nav__link widget-nav__link--idle"
                      }
                      onClick={() => setDocTab("estimate")}
                    >
                      Estimate
                    </button>
                  </div>
                </header>
                <pre className="finance-estimates-view__markdown">
                  {docTab === "proposal"
                    ? selected.proposalMarkdown || "(empty proposal)"
                    : selected.estimateMarkdown || "(empty estimate)"}
                </pre>
              </article>
            ) : (
              <p className="finance-empty">Select an estimate to preview.</p>
            )}
          </div>
        ) : null}
      </div>
    </EntityDetailLayout>
  );
}
