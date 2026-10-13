/** Pure helpers for seeding section entry hrefs — no React / worker imports. */
export {
  getFirstCommunicationItemHref,
} from "../communication/communication.js";
export {
  getFirstInboxItemHref,
  type InboxListItem,
} from "../inbox/inbox-items.js";
export {
  getKnowledgeHref,
  getOrganizationsHref,
  getUniqueListItemRouteParam,
  type KnowledgeListItem,
} from "../navigation/entity-routes.js";
export { getScopedContactSectionHref } from "../contacts/contact-route-scope.js";
export { groupItemsByAlphaLetter } from "../shared/alpha-group.js";
export { resolveLetterDetailHref } from "../letters/letters.js";
