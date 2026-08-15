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

export type EntityDuplicateOptions = {
  /** When duplicating a project, whether to copy its tasks. */
  includeTasks?: boolean;
};

export type EntityDuplicateConfig = {
  onDuplicate: (
    options?: EntityDuplicateOptions,
  ) => Promise<EntityDeleteResult>;
  disabled?: boolean;
  /**
   * `project` opens a choice modal (blank vs include tasks) before running.
   * Omit for immediate duplication (tasks).
   */
  confirm?: "project";
  /** Used in the project duplicate modal title, e.g. `project "Acme"`. */
  entityLabel?: string;
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
  duplicateConfig: EntityDuplicateConfig | null;
  activeDuplicateConfig: EntityDuplicateConfig | null;
  registerDuplicateConfig: (
    ownerId: string,
    config: EntityDuplicateConfig,
  ) => void;
  clearDuplicateConfig: (ownerId: string) => void;
  runDuplicate: () => void;
  duplicateModalOpen: boolean;
  closeDuplicateModal: () => void;
  confirmDuplicate: (options?: EntityDuplicateOptions) => void;
  isDuplicatePending: boolean;
  duplicateError: string | null;
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
  const [duplicateConfig, setDuplicateConfigState] =
    useState<EntityDuplicateConfig | null>(null);
  const [modalDuplicateConfig, setModalDuplicateConfig] =
    useState<EntityDuplicateConfig | null>(null);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [isDuplicatePending, startDuplicateTransition] = useTransition();
  const duplicateRegistrationsRef = useRef(
    new Map<string, EntityDuplicateConfig>(),
  );

  const syncActiveDeleteConfig = useCallback(() => {
    const registrations = [...deleteRegistrationsRef.current.values()];
    setDeleteConfigState(registrations.at(-1) ?? null);
  }, []);

  const syncActiveDuplicateConfig = useCallback(() => {
    const registrations = [...duplicateRegistrationsRef.current.values()];
    setDuplicateConfigState(registrations.at(-1) ?? null);
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

  const registerDuplicateConfig = useCallback(
    (ownerId: string, config: EntityDuplicateConfig) => {
      duplicateRegistrationsRef.current.delete(ownerId);
      duplicateRegistrationsRef.current.set(ownerId, config);
      syncActiveDuplicateConfig();
      setDuplicateModalOpen(false);
      setModalDuplicateConfig(null);
      setDuplicateError(null);
    },
    [syncActiveDuplicateConfig],
  );

  const clearDuplicateConfig = useCallback(
    (ownerId: string) => {
      if (!duplicateRegistrationsRef.current.delete(ownerId)) {
        return;
      }

      syncActiveDuplicateConfig();
      setDuplicateModalOpen(false);
      setModalDuplicateConfig(null);
      setDuplicateError(null);
    },
    [syncActiveDuplicateConfig],
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

  const closeDuplicateModal = useCallback(() => {
    setDuplicateModalOpen(false);
    setModalDuplicateConfig(null);
    setDuplicateError(null);
  }, []);

  const confirmDuplicate = useCallback(
    (options?: EntityDuplicateOptions) => {
      const config = modalDuplicateConfig ?? duplicateConfig;
      if (!config || isDuplicatePending || isDeletePending) {
        return;
      }

      startDuplicateTransition(async () => {
        setDuplicateError(null);
        const result = await config.onDuplicate(options);
        if (result.ok) {
          setDuplicateModalOpen(false);
          setModalDuplicateConfig(null);
          return;
        }
        setDuplicateError(result.error);
      });
    },
    [
      duplicateConfig,
      isDeletePending,
      isDuplicatePending,
      modalDuplicateConfig,
    ],
  );

  const runDuplicate = useCallback(() => {
    const config = duplicateConfig;
    if (
      !config ||
      config.disabled ||
      isDuplicatePending ||
      isDeletePending
    ) {
      return;
    }

    if (config.confirm === "project") {
      setDuplicateError(null);
      setModalDuplicateConfig(config);
      setDuplicateModalOpen(true);
      return;
    }

    startDuplicateTransition(async () => {
      const result = await config.onDuplicate();
      if (result.ok) {
        return;
      }
      window.alert(result.error);
    });
  }, [duplicateConfig, isDeletePending, isDuplicatePending]);

  const activeDeleteConfig = deleteModalOpen
    ? modalDeleteConfig
    : resolveShortcutDeleteConfig(deleteConfig);

  const activeDuplicateConfig = duplicateModalOpen
    ? modalDuplicateConfig
    : duplicateConfig;

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
      duplicateConfig,
      activeDuplicateConfig,
      registerDuplicateConfig,
      clearDuplicateConfig,
      runDuplicate,
      duplicateModalOpen,
      closeDuplicateModal,
      confirmDuplicate,
      isDuplicatePending,
      duplicateError,
    }),
    [
      activeDeleteConfig,
      activeDuplicateConfig,
      clearDeleteConfig,
      clearDuplicateConfig,
      closeDeleteModal,
      closeDuplicateModal,
      confirmDelete,
      confirmDuplicate,
      deleteConfig,
      deleteError,
      deleteModalOpen,
      duplicateConfig,
      duplicateError,
      duplicateModalOpen,
      isDeletePending,
      isDuplicatePending,
      openDeleteModal,
      registerDeleteConfig,
      registerDuplicateConfig,
      runDuplicate,
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
