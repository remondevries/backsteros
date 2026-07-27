"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { resolveDocumentTreeDeleteConfig } from "../../document-tree-delete-shortcut.js";

export type EntityDeleteResult =
  | { ok: true }
  | { ok: false; error: string };

export type EntityDeleteConfig = {
  entityLabel: string;
  /** Shown on the confirm button when the delete modal is open. */
  confirmLabel?: string;
  onDelete: () => Promise<EntityDeleteResult>;
};

type EntityHeaderActionsContextValue = {
  deleteConfig: EntityDeleteConfig | null;
  activeDeleteConfig: EntityDeleteConfig | null;
  registerDeleteConfig: (ownerId: string, config: EntityDeleteConfig) => void;
  clearDeleteConfig: (ownerId: string) => void;
  deleteModalOpen: boolean;
  openDeleteModal: (configOverride?: EntityDeleteConfig | null) => void;
  closeDeleteModal: () => void;
  confirmDelete: () => void;
  isDeletePending: boolean;
  deleteError: string | null;
};

const EntityHeaderActionsContext =
  createContext<EntityHeaderActionsContextValue | null>(null);

function resolveShortcutDeleteConfig(
  registeredConfig: EntityDeleteConfig | null,
): EntityDeleteConfig | null {
  return resolveDocumentTreeDeleteConfig() ?? registeredConfig;
}

export function EntityHeaderActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [deleteConfig, setDeleteConfigState] = useState<EntityDeleteConfig | null>(
    null,
  );
  const [modalDeleteConfig, setModalDeleteConfig] =
    useState<EntityDeleteConfig | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();
  const deleteRegistrationsRef = useRef(
    new Map<string, EntityDeleteConfig>(),
  );

  const syncActiveDeleteConfig = useCallback(() => {
    const registrations = [...deleteRegistrationsRef.current.values()];
    setDeleteConfigState(registrations.at(-1) ?? null);
  }, []);

  const registerDeleteConfig = useCallback(
    (ownerId: string, config: EntityDeleteConfig) => {
      deleteRegistrationsRef.current.delete(ownerId);
      deleteRegistrationsRef.current.set(ownerId, config);
      syncActiveDeleteConfig();
      setDeleteModalOpen(false);
      setModalDeleteConfig(null);
      setDeleteError(null);
    },
    [syncActiveDeleteConfig],
  );

  const clearDeleteConfig = useCallback(
    (ownerId: string) => {
      if (!deleteRegistrationsRef.current.delete(ownerId)) {
        return;
      }

      syncActiveDeleteConfig();
      setDeleteModalOpen(false);
      setModalDeleteConfig(null);
      setDeleteError(null);
    },
    [syncActiveDeleteConfig],
  );

  const openDeleteModal = useCallback(
    (configOverride?: EntityDeleteConfig | null) => {
      const config =
        configOverride === undefined
          ? resolveShortcutDeleteConfig(deleteConfig)
          : configOverride;

      if (!config) {
        return;
      }

      setDeleteError(null);
      setModalDeleteConfig(config);
      setDeleteModalOpen(true);
    },
    [deleteConfig],
  );

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setModalDeleteConfig(null);
    setDeleteError(null);
  }, []);

  const confirmDelete = useCallback(() => {
    const config = modalDeleteConfig ?? deleteConfig;
    if (!config) {
      return;
    }

    startDeleteTransition(async () => {
      setDeleteError(null);
      const result = await config.onDelete();
      if (result.ok) {
        setDeleteModalOpen(false);
        setModalDeleteConfig(null);
        return;
      }

      setDeleteError(result.error);
    });
  }, [deleteConfig, modalDeleteConfig]);

  const activeDeleteConfig = deleteModalOpen
    ? modalDeleteConfig
    : resolveShortcutDeleteConfig(deleteConfig);

  const value = useMemo(
    () => ({
      deleteConfig,
      activeDeleteConfig,
      registerDeleteConfig,
      clearDeleteConfig,
      deleteModalOpen,
      openDeleteModal,
      closeDeleteModal,
      confirmDelete,
      isDeletePending,
      deleteError,
    }),
    [
      activeDeleteConfig,
      clearDeleteConfig,
      closeDeleteModal,
      confirmDelete,
      deleteConfig,
      deleteError,
      deleteModalOpen,
      isDeletePending,
      openDeleteModal,
      registerDeleteConfig,
    ],
  );

  return (
    <EntityHeaderActionsContext.Provider value={value}>
      {children}
    </EntityHeaderActionsContext.Provider>
  );
}

export function useEntityHeaderActionsContext() {
  const context = useContext(EntityHeaderActionsContext);
  if (!context) {
    throw new Error(
      "useEntityHeaderActionsContext must be used within EntityHeaderActionsProvider",
    );
  }
  return context;
}
