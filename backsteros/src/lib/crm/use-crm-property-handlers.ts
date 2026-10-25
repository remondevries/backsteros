import {
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  ContactLocationParts,
  ContactOverviewDetails,
  OrganizationOverviewDetails,
} from "@backsteros/ui";

import {
  removeDesktopAvatar,
  uploadDesktopAvatar,
  type DesktopAvatarKind,
} from "../avatar-upload";
import type { DesktopWorkspaceData } from "../workspace/workspace-data-types";

type SaveResult = { ok: true } | { ok: false; error: string };

type AvatarOverrideSetter = Dispatch<SetStateAction<string | null | undefined>>;

type ResolveLocation = (
  entityId: string,
  parts: ContactLocationParts,
  options?: { force?: boolean },
) => Promise<void>;

async function saveWithResult(
  save: () => Promise<unknown>,
  fallbackError: string,
): Promise<SaveResult> {
  try {
    await save();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : fallbackError,
    };
  }
}

function replaceAvatarOverride(
  setAvatarOverride: AvatarOverrideSetter,
  next: string | null,
) {
  setAvatarOverride((current) => {
    if (current) URL.revokeObjectURL(current);
    return next;
  });
}

function avatarHandlers(
  kind: DesktopAvatarKind,
  read: () => {
    client: BacksterosApiClient;
    entityId: string | null;
    setAvatarOverride: AvatarOverrideSetter;
  },
) {
  return {
    onUploadAvatar: async (file: File) => {
      const { client, entityId, setAvatarOverride } = read();
      if (!entityId) return { ok: false as const, error: "Nothing selected." };
      const result = await uploadDesktopAvatar(client, kind, entityId, file);
      if (result.ok) {
        replaceAvatarOverride(setAvatarOverride, URL.createObjectURL(file));
      }
      return result;
    },
    onRemoveAvatar: async () => {
      const { client, entityId, setAvatarOverride } = read();
      if (!entityId) return { ok: false as const, error: "Nothing selected." };
      const result = await removeDesktopAvatar(client, kind, entityId);
      if (result.ok) replaceAvatarOverride(setAvatarOverride, null);
      return result;
    },
  };
}

type ContactFieldContext = {
  /** Contact shown on the card. */
  contactId: string | null;
  patchContact: DesktopWorkspaceData["patchContact"];
  createOrganization: DesktopWorkspaceData["createOrganization"];
};

function contactFieldHandlers(read: () => ContactFieldContext) {
  const withContact = (run: (contactId: string) => Promise<unknown>) => {
    const { contactId } = read();
    return contactId ? run(contactId) : Promise.resolve();
  };
  return {
    onSaveFirstName: (firstName: string) =>
      saveWithResult(
        () => withContact((id) => read().patchContact(id, { firstName })),
        "Could not save first name.",
      ),
    onSaveLastName: (lastName: string) =>
      saveWithResult(
        () => withContact((id) => read().patchContact(id, { lastName })),
        "Could not save last name.",
      ),
    onSaveDetails: (patch: ContactOverviewDetails) => {
      void withContact((id) => read().patchContact(id, patch));
    },
    onCreateOrganizationFromQuery: (query: string) => {
      void withContact(async (id) => {
        const created = await read().createOrganization({ name: query });
        await read().patchContact(id, { organizationId: created.id });
      });
    },
  };
}

export type ContactPropertyHandlersContext = ContactFieldContext & {
  client: BacksterosApiClient;
  resolveLocation: ResolveLocation;
  setAvatarOverride: AvatarOverrideSetter;
};

/** Stable profile-card edit handlers for the contact on the card. */
export function useContactPropertyHandlers(
  context: ContactPropertyHandlersContext,
) {
  const contextRef = useRef(context);
  contextRef.current = context;

  return useMemo(() => {
    const read = () => ({
      ...contextRef.current,
      entityId: contextRef.current.contactId,
    });
    return {
      ...contactFieldHandlers(read),
      ...avatarHandlers("contact", read),
      onAfterLocationSave: (parts: ContactLocationParts) => {
        const { contactId, resolveLocation } = read();
        if (contactId) void resolveLocation(contactId, parts, { force: true });
      },
    };
  }, []);
}

/** Stable name / details / organization edits for the chat rail contact. */
export function useChatContactPropertyHandlers(context: ContactFieldContext) {
  const contextRef = useRef(context);
  contextRef.current = context;

  return useMemo(() => contactFieldHandlers(() => contextRef.current), []);
}

export type OrganizationPropertyHandlersContext = {
  client: BacksterosApiClient;
  /** Organization shown on the card. */
  organizationId: string | null;
  patchOrganization: DesktopWorkspaceData["patchOrganization"];
  resolveLocation: ResolveLocation;
  setAvatarOverride: AvatarOverrideSetter;
};

/** Stable profile-card edit handlers for the organization on the card. */
export function useOrganizationPropertyHandlers(
  context: OrganizationPropertyHandlersContext,
) {
  const contextRef = useRef(context);
  contextRef.current = context;

  return useMemo(() => {
    const read = () => ({
      ...contextRef.current,
      entityId: contextRef.current.organizationId,
    });
    const withOrganization = (
      run: (organizationId: string) => Promise<unknown>,
    ) => {
      const { organizationId } = read();
      return organizationId ? run(organizationId) : Promise.resolve();
    };
    return {
      ...avatarHandlers("organization", read),
      onSaveName: (name: string) =>
        saveWithResult(
          () => withOrganization((id) => read().patchOrganization(id, { name })),
          "Could not save organization name.",
        ),
      onSaveDetails: (patch: OrganizationOverviewDetails) => {
        void withOrganization((id) => read().patchOrganization(id, patch));
      },
      onAfterLocationSave: (parts: ContactLocationParts) => {
        void withOrganization((id) =>
          read().resolveLocation(id, parts, { force: true }),
        );
      },
    };
  }, []);
}
