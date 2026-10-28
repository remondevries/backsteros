/**
 * CRM domain barrel — implementation lives in `./crm-domain/`.
 */
export {
  listOrganizations,
  listOrganizationsPaginated,
  createOrganization,
  getOrganizationById,
  updateOrganization,
  deleteOrganization,
  listContacts,
  listContactsPaginated,
  lookupContactByChannel,
  createContact,
  getContactByPortalUsername,
  getContactForPortalLogin,
  getContactById,
  updateContact,
  deleteContact,
  listAreas,
  createArea,
  getAreaById,
  updateArea,
  deleteArea,
} from "./crm-domain/organizations-contacts.js";
export {
  listLetters,
  listLettersPaginated,
  createLetter,
  getLetterById,
  updateLetter,
  triageLetter,
  deleteLetter,
  listLetterAttachments,
  createLetterAttachment,
  putLetterPdf,
  getLetterAttachment,
  getLetterPdf,
  deleteLetterAttachment,
  updateLetterAttachment,
  reorderLetterAttachments,
} from "./crm-domain/letters.js";
export {
  getOrganizationRelations,
  getContactRelations,
  getProjectRelations,
  getTaskRelations,
  getLetterRelations,
} from "./crm-domain/relations.js";
export {
  putAvatar,
  getAvatar,
  deleteAvatar,
} from "./crm-domain/avatars.js";
export {
  getSettings,
  updateSettings,
  replaceSettings,
} from "./crm-domain/workspace-settings.js";
export {
  listMentions,
  getMentionById,
  createMention,
  markMentionRead,
} from "./crm-domain/mentions.js";
export {
  globalSearch,
} from "./crm-domain/search.js";
export type {
  GlobalSearchMode,
  GlobalSearchScope,
} from "./crm-domain/search.js";
