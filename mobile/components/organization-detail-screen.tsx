import { Stack, useRouter, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import type { Organization } from "@backsteros/contracts";

import { DetailHeaderDeleteButton } from "./detail-header-delete-button";
import {
  buildMoneybirdContactInvoicesFilter,
} from "../lib/finance-api";
import {
  DEFAULT_ORGANIZATION_SECTION,
  resolveVisibleOrganizationSections,
  type OrganizationSectionId,
} from "../lib/organization-sections";
import { isPadDevice } from "../lib/device";
import {
  ORGANIZATION_PROJECTS_LIST_BOARD_STORAGE_KEY,
  useListBoardView,
} from "../lib/list-board-view";
import {
  TabStackHeaderPlusButton,
  tabDetailScreenOptions,
} from "../lib/tab-stack-options";
import { ui } from "../lib/ui";
import { useEntitySoftDelete } from "../lib/use-entity-soft-delete";
import { useLocalQuery } from "../lib/use-local-query";
import { useSectionTabShortcuts } from "../lib/use-section-tab-shortcuts";
import { ContentPageTitle } from "./content-page-title";
import { ListBoardToggle } from "./list-board-toggle";
import { OrganizationContactsPanel } from "./organization-contacts-panel";
import { OrganizationInvoicesPanel } from "./organization-invoices-panel";
import { OrganizationOverviewPanel } from "./organization-overview-panel";
import { OrganizationProjectsPanel } from "./organization-projects-panel";
import { OrganizationTransactionsPanel } from "./organization-transactions-panel";
import { PillNav } from "./pill-nav";
import { ScopedLettersPanel } from "./scoped-letters-panel";
import { useMobileApiClient } from "../lib/use-mobile-api-client";

type Props = {
  organizationId: string;
  title: string;
};

/** Organization detail shell — Overview / Projects / Letters / Contacts. */
export function OrganizationDetailScreen({ organizationId, title }: Props) {
  const router = useRouter();
  const segments = useSegments();
  const inPadOrganizationsSplit =
    isPadDevice() && (segments as string[]).includes("organizations");

  const [section, setSection] = useState<OrganizationSectionId>(
    DEFAULT_ORGANIZATION_SECTION,
  );
  const [displayTitle, setDisplayTitle] = useState(title);
  const [hasTransactions, setHasTransactions] = useState(false);
  const [hasInvoices, setHasInvoices] = useState(false);
  const [financeProbeReady, setFinanceProbeReady] = useState(false);
  const [moneybirdContactId, setMoneybirdContactId] = useState<string | null>(
    null,
  );
  const client = useMobileApiClient();
  const { data: orgFinanceRows } = useLocalQuery<{
    moneybird_contact_id: string | null;
  }>(
    `SELECT moneybird_contact_id FROM organizations
     WHERE deleted_at IS NULL AND id = ?
     LIMIT 1`,
    [organizationId],
  );
  const syncedMoneybirdContactId =
    orgFinanceRows[0]?.moneybird_contact_id?.trim() || null;
  const { confirmAndDelete } = useEntitySoftDelete();
  const { view: projectsBoardView, toggleView: toggleProjectsBoardView } =
    useListBoardView(ORGANIZATION_PROJECTS_LIST_BOARD_STORAGE_KEY);

  const visibleSections = useMemo(
    () =>
      resolveVisibleOrganizationSections({
        hasTransactions,
        hasInvoices,
      }),
    [hasInvoices, hasTransactions],
  );

  const onDeleteOrganization = useCallback(() => {
    confirmAndDelete("organizations", organizationId, displayTitle);
  }, [confirmAndDelete, displayTitle, organizationId]);

  useEffect(() => {
    setDisplayTitle(title);
  }, [title]);

  useEffect(() => {
    setSection(DEFAULT_ORGANIZATION_SECTION);
    setHasTransactions(false);
    setHasInvoices(false);
    setFinanceProbeReady(false);
    setMoneybirdContactId(null);
  }, [organizationId]);

  useEffect(() => {
    if (!financeProbeReady) return;
    const visibleIds = new Set(visibleSections.map((entry) => entry.id));
    if (!visibleIds.has(section)) {
      setSection(DEFAULT_ORGANIZATION_SECTION);
    }
  }, [financeProbeReady, section, visibleSections]);

  useEffect(() => {
    let cancelled = false;
    setFinanceProbeReady(false);
    setHasTransactions(false);
    setHasInvoices(false);
    setMoneybirdContactId(null);
    void (async () => {
      try {
        let contactId = syncedMoneybirdContactId;
        if (!contactId) {
          const org = await client.requestJson<Organization>(
            `/api/v1/organizations/${encodeURIComponent(organizationId)}`,
          );
          contactId = org.moneybirdContactId?.trim() || null;
        }
        if (cancelled) return;
        setMoneybirdContactId(contactId);
        const [txProbe, invoiceProbe] = await Promise.all([
          client.requestJson<{ transactions: unknown[] }>(
            `/api/v1/transactions?${new URLSearchParams({
              organizationId,
              limit: "1",
            })}`,
          ),
          contactId
            ? client
                .requestJson<{ invoices: unknown[] }>(
                  `/api/v1/finance/moneybird/invoices?${new URLSearchParams({
                    page: "1",
                    perPage: "1",
                    filter: buildMoneybirdContactInvoicesFilter(contactId),
                  })}`,
                )
                .catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setHasTransactions(txProbe.transactions.length > 0);
        setHasInvoices(
          Boolean(invoiceProbe && invoiceProbe.invoices.length > 0),
        );
      } catch {
        if (cancelled) return;
        setHasTransactions(false);
        setHasInvoices(false);
      } finally {
        if (!cancelled) setFinanceProbeReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, organizationId, syncedMoneybirdContactId]);

  const onSectionTabIndex = useCallback((index: number) => {
    const next = visibleSections[index];
    if (next) setSection(next.id);
  }, [visibleSections]);

  useSectionTabShortcuts({
    enabled: true,
    sectionCount: visibleSections.length,
    onSelectIndex: onSectionTabIndex,
  });

  function onPressCreate() {
    if (section === "projects") {
      router.push({
        pathname: "/(app)/projects/new",
        params: { organizationId },
      });
      return;
    }
    if (section === "letters") {
      router.push({
        pathname: "/create/letter",
        params: { organizationId },
      });
      return;
    }
    if (section === "contacts") {
      router.push({
        pathname: "/create/contact",
        params: { organizationId },
      });
    }
  }

  const createTrailing =
    section === "overview" ? null : (
      <TabStackHeaderPlusButton
        onPress={onPressCreate}
        accessibilityLabel={
          section === "projects"
            ? "Create project"
            : section === "letters"
              ? "Create letter"
              : "Create contact"
        }
      />
    );

  return (
    <>
      <Stack.Screen
        options={{
          ...tabDetailScreenOptions({ embedded: isPadDevice() }),
          title: "",
          headerTitleAlign: "left",
          headerTitle: () => (
            <View style={styles.headerTitleCluster}>
              <PillNav
                accessibilityLabel="Organization sections"
                value={section}
                onChange={setSection}
                align="start"
                density="header"
                items={visibleSections.map((entry) => ({
                  value: entry.id,
                  label: entry.label,
                }))}
              />
            </View>
          ),
          ...(inPadOrganizationsSplit ? { headerBackVisible: false } : null),
          headerRight: () => (
            <DetailHeaderDeleteButton onDelete={onDeleteOrganization} />
          ),
        }}
      />
      <View style={ui.screen}>
        <View style={{ flex: 1 }}>
          {section === "overview" ? (
            <OrganizationOverviewPanel
              organizationId={organizationId}
              onNameChange={setDisplayTitle}
            />
          ) : section === "projects" ? (
            <>
              <ContentPageTitle
                title={displayTitle}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ListBoardToggle
                      view={projectsBoardView}
                      onToggle={toggleProjectsBoardView}
                    />
                    {createTrailing}
                  </View>
                }
              />
              <OrganizationProjectsPanel
                organizationId={organizationId}
                boardView={projectsBoardView}
              />
            </>
          ) : section === "letters" ? (
            <>
              <ContentPageTitle
                title={displayTitle}
                trailing={createTrailing}
              />
              <ScopedLettersPanel
                scope={{ kind: "organization", id: organizationId }}
                emptyText="No letters linked to this organization."
              />
            </>
          ) : section === "contacts" ? (
            <>
              <ContentPageTitle
                title={displayTitle}
                trailing={createTrailing}
              />
              <OrganizationContactsPanel organizationId={organizationId} />
            </>
          ) : section === "transactions" ? (
            <>
              <ContentPageTitle title={displayTitle} />
              <OrganizationTransactionsPanel organizationId={organizationId} />
            </>
          ) : section === "invoices" && moneybirdContactId ? (
            <>
              <ContentPageTitle title={displayTitle} />
              <OrganizationInvoicesPanel
                moneybirdContactId={moneybirdContactId}
              />
            </>
          ) : (
            <>
              <ContentPageTitle
                title={displayTitle}
                trailing={createTrailing}
              />
              <OrganizationContactsPanel organizationId={organizationId} />
            </>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerTitleCluster: {
    alignItems: "flex-start",
    justifyContent: "center",
    maxWidth: 420,
  },
});
