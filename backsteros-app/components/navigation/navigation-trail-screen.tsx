"use client";

import type {
  Contact as ApiContact,
  Document as ApiDocument,
  Letter as ApiLetter,
  Organization as ApiOrganization,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import { useEffect, useMemo, useState } from "react";

import { DocumentDetailSkeleton } from "@/components/documents/document-detail-skeleton";
import { LetterDetailSkeleton } from "@/components/letters/letter-detail-skeleton";
import { RegisterBreadcrumbChrome } from "@/components/navigation/breadcrumb-chrome";
import { RegisterNavigationTrail } from "@/components/navigation/navigation-trail-provider";
import { ProjectOverviewSkeleton } from "@/components/projects/project-overview/project-overview-skeleton";
import { ContactOverviewScreen } from "@/components/screens/contact-overview-screen";
import { DocumentDetailScreen } from "@/components/screens/document-detail-screen";
import { LetterDetailScreen } from "@/components/screens/letter-detail-screen";
import { OrganizationOverviewScreen } from "@/components/screens/organization-overview-screen";
import { ProjectOverviewScreen } from "@/components/screens/project-overview-screen";
import { TaskDetailScreen } from "@/components/screens/task-detail-screen";
import { TaskDetailSkeleton } from "@/components/tasks/task-detail-skeleton";
import { LoadingList } from "@/components/ui/loading-list";
import { useApiResource } from "@/lib/api-context";
import {
  resolveNavigationTrailClient,
  type TrailResolveContext,
} from "@/lib/navigation-trail/client-entity-registry";
import { resolveNavigationSourceClient } from "@/lib/navigation-trail/client-source-registry";
import type { ResolvedNavigationTrailEntity } from "@/lib/navigation-trail/resolved-entity";
import type { ResolvedNavigationSource } from "@/lib/navigation-trail/source-types";
import type {
  NavigationTrail,
  NavigationTrailKind,
  ResolvedNavigationTrailItem,
} from "@/lib/navigation-trail/types";

function buildTrailContext(input: {
  tasks: ApiTask[];
  projects: ApiProject[];
  contacts: ApiContact[];
  organizations: ApiOrganization[];
  letters: ApiLetter[];
  documents: ApiDocument[];
}): TrailResolveContext {
  return {
    tasks: input.tasks,
    projects: input.projects.map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
    })),
    contacts: input.contacts.map((contact) => ({
      id: contact.id,
      key: contact.key,
      name: contact.name,
    })),
    organizations: input.organizations.map((organization) => ({
      id: organization.id,
      key: organization.key,
      name: organization.name,
    })),
    letters: input.letters.map((letter) => ({
      id: letter.id,
      number: letter.number,
      title: letter.title,
    })),
    documents: input.documents.map((document) => ({
      id: document.id,
      projectId: document.projectId,
      path: document.path,
      title: document.title,
    })),
  };
}

function TrailEntityView({
  entity,
}: {
  entity: ResolvedNavigationTrailEntity;
}) {
  const ref = entity.ref;

  if (ref.kind === "task") {
    return (
      <TaskDetailScreen
        taskRouteParam={ref.entityId ?? ref.routeParam}
        context="trail"
      />
    );
  }

  if (ref.kind === "letter") {
    return (
      <LetterDetailScreen letterRouteParam={ref.entityId ?? ref.routeParam} />
    );
  }

  if (ref.kind === "document") {
    return (
      <DocumentDetailScreen
        routeParam={ref.entityId ?? ref.relativePath}
        projectRouteParam={ref.projectRouteParam || undefined}
        breadcrumbContext={ref.projectRouteParam ? "project" : "knowledge"}
      />
    );
  }

  if (ref.kind === "project") {
    return <ProjectOverviewScreen projectParam={ref.routeParam} />;
  }

  if (ref.kind === "contact") {
    return <ContactOverviewScreen contactParam={ref.routeParam} />;
  }

  if (ref.kind === "organization") {
    return <OrganizationOverviewScreen organizationParam={ref.routeParam} />;
  }

  return null;
}

function TrailLoadingSkeleton({ kind }: { kind: NavigationTrailKind | undefined }) {
  if (kind === "task") {
    return <TaskDetailSkeleton />;
  }
  if (kind === "letter") {
    return <LetterDetailSkeleton />;
  }
  if (kind === "document") {
    return <DocumentDetailSkeleton />;
  }
  if (kind === "project") {
    return <ProjectOverviewSkeleton />;
  }
  return <LoadingList className="p-4" />;
}

export function NavigationTrailScreen({ trail }: { trail: NavigationTrail }) {
  const tasksResource = useApiResource<{ tasks: ApiTask[] }>((client) =>
    client.requestJson("/api/v1/tasks"),
  );
  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );
  const organizationsResource = useApiResource<{
    organizations: ApiOrganization[];
  }>((client) => client.requestJson("/api/v1/organizations"));
  const lettersResource = useApiResource<{ letters: ApiLetter[] }>((client) =>
    client.requestJson("/api/v1/letters"),
  );
  const documentsResource = useApiResource<{ documents: ApiDocument[] }>(
    (client) => client.requestJson("/api/v1/documents"),
  );

  const ctx = useMemo(
    () =>
      buildTrailContext({
        tasks: tasksResource.data?.tasks ?? [],
        projects: projectsResource.data?.projects ?? [],
        contacts: contactsResource.data?.contacts ?? [],
        organizations: organizationsResource.data?.organizations ?? [],
        letters: lettersResource.data?.letters ?? [],
        documents: documentsResource.data?.documents ?? [],
      }),
    [
      contactsResource.data,
      documentsResource.data,
      lettersResource.data,
      organizationsResource.data,
      projectsResource.data,
      tasksResource.data,
    ],
  );

  const [source, setSource] = useState<ResolvedNavigationSource | null>(null);
  const [items, setItems] = useState<ResolvedNavigationTrailItem[]>([]);
  const [target, setTarget] = useState<ResolvedNavigationTrailEntity | null>(
    null,
  );
  const [error, setError] = useState(false);

  const loading =
    tasksResource.loading ||
    projectsResource.loading ||
    contactsResource.loading ||
    organizationsResource.loading ||
    lettersResource.loading ||
    documentsResource.loading;

  useEffect(() => {
    if (loading) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const [nextSource, resolved] = await Promise.all([
        resolveNavigationSourceClient(trail.sourceHref, ctx),
        resolveNavigationTrailClient(trail, ctx),
      ]);
      if (cancelled) {
        return;
      }
      if (!nextSource || !resolved) {
        setError(true);
        setSource(null);
        setItems([]);
        setTarget(null);
        return;
      }
      setError(false);
      setSource(nextSource);
      setItems(resolved.items);
      setTarget(resolved.target);
    })();

    return () => {
      cancelled = true;
    };
  }, [ctx, loading, trail]);

  const chromeAnchors = useMemo(() => {
    if (!source) {
      return [];
    }
    return [
      {
        label: source.sectionLabel,
        href: source.sectionHref,
      },
      ...source.items.map((item) => ({
        label: item.label,
        href: item.href,
      })),
    ];
  }, [source]);

  const trailLeafItems = useMemo(
    () =>
      items.map((item, index) => ({
        label: item.label,
        href: index < items.length - 1 ? item.href : undefined,
      })),
    [items],
  );

  if (!target && !error) {
    return <TrailLoadingSkeleton kind={trail.nodes.at(-1)?.kind} />;
  }

  if (error || !source || !target) {
    return (
      <div className="error-state p-4">
        <strong>Could not open this trail</strong>
        <p>The linked item may have been deleted or moved.</p>
      </div>
    );
  }

  return (
    <>
      <RegisterBreadcrumbChrome
        anchors={chromeAnchors}
        includeTrailingItems={() => true}
      />
      <RegisterNavigationTrail items={trailLeafItems} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TrailEntityView entity={target} />
      </div>
    </>
  );
}
