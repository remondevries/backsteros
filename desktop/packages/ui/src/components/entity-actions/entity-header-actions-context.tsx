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
  /**
   * Modal title verb, e.g. "Delete" or "Report spam". Defaults to "Delete".
   * Full title becomes `{actionVerb} {entityLabel}?`.
   */
  actionVerb?: string;
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

export type EntityExtraMenuItem = {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  /**
   * When set, selecting the item opens the shared confirm modal, then runs
   * `onSelect` as the confirmed action.
   */
  confirm?: {
    entityLabel: string;
    confirmLabel?: string;
    actionVerb?: string;
  };
  onSelect: () => Promise<EntityDeleteResult> | void;
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
  extraMenuItems: EntityExtraMenuItem[];
  registerExtraMenuItems: (
    ownerId: string,
    items: EntityExtraMenuItem[],
  ) => void;
  clearExtraMenuItems: (ownerId: string) => void;
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
  const [extraMenuItems, setExtraMenuItems] = useState<EntityExtraMenuItem[]>(
    [],
  );
  const extraMenuRegistrationsRef = useRef(
    new Map<string, EntityExtraMenuItem[]>(),
  );

  const syncActiveDeleteConfig = useCallback(() => {
    const registrations = [...deleteRegistrationsRef.current.values()];
    setDeleteConfigState(registrations.at(-1) ?? null);
  }, []);

  const syncActiveDuplicateConfig = useCallback(() => {
    const registrations = [...duplicateRegistrationsRef.current.values()];
    setDuplicateConfigState(registrations.at(-1) ?? null);
  }, []);

  const syncExtraMenuItems = useCallback(() => {
    setExtraMenuItems(
      [...extraMenuRegistrationsRef.current.values()].flat(),
    );
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

  const registerExtraMenuItems = useCallback(
    (ownerId: string, items: EntityExtraMenuItem[]) => {
      extraMenuRegistrationsRef.current.delete(ownerId);
      extraMenuRegistrationsRef.current.set(ownerId, items);
      syncExtraMenuItems();
    },
    [syncExtraMenuItems],
  );

  const clearExtraMenuItems = useCallback(
    (ownerId: string) => {
      if (!extraMenuRegistrationsRef.current.delete(ownerId)) {
        return;
      }
      syncExtraMenuItems();
    },
    [syncExtraMenuItems],
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
      extraMenuItems,
      registerExtraMenuItems,
      clearExtraMenuItems,
    }),
    [
      activeDeleteConfig,
      activeDuplicateConfig,
      clearDeleteConfig,
      clearDuplicateConfig,
      clearExtraMenuItems,
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
      extraMenuItems,
      isDeletePending,
      isDuplicatePending,
      openDeleteModal,
      registerDeleteConfig,
      registerDuplicateConfig,
      registerExtraMenuItems,
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
