"use client";

import type {
  Contact as ApiContact,
  Document as ApiDocument,
  Project as ApiProject,
} from "@backsteros/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { ComposeModal } from "@/components/shell/compose-modal";
import { useAppApi } from "@/lib/api-context";
import { COMPOSE_KNOWLEDGE_BASE_VALUE } from "@/lib/compose-task";
import { OPEN_COMPOSE_MODAL_EVENT } from "@/lib/compose-modal-events";
import { mapContactToAssignable } from "@/lib/contacts/assignable-contact";
import {
  COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
  type ComposeDocumentFolderOption,
  type ComposeDocumentFoldersByTarget,
} from "@/lib/documents/compose-document-folders.shared";
import { getComposeFolderPathChain } from "@/lib/documents/compose-document-folder-cascade";
import { normalizeContact } from "@/lib/entity-normalize";
import {
  getDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "@/lib/settings/default-assignee";

type ComposeModalGateProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

type ComposeModalContextData = {
  projects: {
    id: string;
    key: string;
    name: string;
    icon: string | null;
    color: string | null;
    dueDate: Date | null;
  }[];
  contacts: ReturnType<typeof mapContactToAssignable>[];
  defaultAssigneeId: string | null;
  documentFoldersByTarget: ComposeDocumentFoldersByTarget;
};

function buildFolderOptions(
  folderDocs: { path: string; title: string }[],
): ComposeDocumentFolderOption[] {
  if (folderDocs.length === 0) {
    return [];
  }

  const titleByPath = new Map(folderDocs.map((doc) => [doc.path, doc.title]));
  const options: ComposeDocumentFolderOption[] = [
    {
      value: COMPOSE_DOCUMENT_ROOT_FOLDER_VALUE,
      label: "No folder",
      folderPath: "",
      searchTerms: "no folder top level",
    },
  ];

  for (const doc of folderDocs) {
    const chain = getComposeFolderPathChain(doc.path);
    const label = chain
      .map((path) => titleByPath.get(path) ?? path.split("/").pop() ?? path)
      .join(" / ");
    options.push({
      value: doc.path,
      label,
      folderPath: doc.path,
      searchTerms: `${label} ${doc.path}`,
    });
  }

  return options;
}

function buildDocumentFoldersByTarget(
  documents: ApiDocument[],
  projects: { id: string }[],
): ComposeDocumentFoldersByTarget {
  const result: ComposeDocumentFoldersByTarget = {};
  const folderDocs = documents.filter((doc) => doc.kind === "folder");

  for (const project of projects) {
    const projectFolders = folderDocs.filter(
      (doc) => doc.type === "project" && doc.projectId === project.id,
    );
    const options = buildFolderOptions(projectFolders);
    if (options.length > 0) {
      result[project.id] = options;
    }
  }

  const knowledgeOptions = buildFolderOptions(
    folderDocs.filter((doc) => doc.type === "knowledge"),
  );
  if (knowledgeOptions.length > 0) {
    result[COMPOSE_KNOWLEDGE_BASE_VALUE] = knowledgeOptions;
  }

  return result;
}

export function ComposeModalGate({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ComposeModalGateProps = {}) {
  const { client } = useAppApi();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOnOpenChange) {
        controlledOnOpenChange(next);
        return;
      }

      setInternalOpen(next);
    },
    [controlledOnOpenChange],
  );
  const [context, setContext] = useState<ComposeModalContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  const ensureContext = useCallback(async () => {
    if (context) {
      return;
    }

    if (loadPromiseRef.current) {
      await loadPromiseRef.current;
      return;
    }

    setLoading(true);
    setError(null);

    const promise = Promise.all([
      client.requestJson<{ projects: ApiProject[] }>("/api/v1/projects"),
      client.requestJson<{ contacts: ApiContact[] }>("/api/v1/contacts"),
      client.requestJson<{ documents: ApiDocument[] }>("/api/v1/documents"),
      client
        .requestJson<{ settings: Record<string, unknown> }>("/api/v1/settings")
        .catch(() => null),
    ])
      .then(
        ([
          projectsResult,
          contactsResult,
          documentsResult,
          settingsResult,
        ]) => {
        const projects = projectsResult.projects.map((project) => ({
          id: project.id,
          key: project.key,
          name: project.name,
          icon: project.icon,
          color: project.color,
          dueDate: project.dueDate ? new Date(project.dueDate) : null,
        }));
        const contacts = contactsResult.contacts.map((contact) =>
          mapContactToAssignable({
            ...normalizeContact(contact),
            organization: null,
          }),
        );
        const documentFoldersByTarget = buildDocumentFoldersByTarget(
          documentsResult.documents,
          projects,
        );
        const defaultAssigneeId = settingsResult
          ? syncDefaultAssigneeIdFromSettings(settingsResult.settings)
          : getDefaultAssigneeId();

        setContext({
          projects,
          contacts,
          defaultAssigneeId,
          documentFoldersByTarget,
        });
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Failed to load compose modal data.",
        );
      })
      .finally(() => {
        setLoading(false);
        loadPromiseRef.current = null;
      });

    loadPromiseRef.current = promise;
    await promise;
  }, [client, context]);

  useEffect(() => {
    if (open) {
      void ensureContext();
    }
  }, [ensureContext, open]);

  useEffect(() => {
    if (isControlled) {
      return;
    }

    function handleOpen() {
      setOpen(true);
      void ensureContext();
    }

    window.addEventListener(OPEN_COMPOSE_MODAL_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_COMPOSE_MODAL_EVENT, handleOpen);
  }, [ensureContext, isControlled, setOpen]);

  if (!open) {
    return null;
  }

  return (
    <ComposeModal
      open={open}
      onOpenChange={setOpen}
      projects={context?.projects ?? []}
      contacts={context?.contacts ?? []}
      defaultAssigneeId={context?.defaultAssigneeId ?? null}
      documentFoldersByTarget={context?.documentFoldersByTarget ?? {}}
      contextLoading={loading}
      contextError={error}
    />
  );
}
