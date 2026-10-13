import { getScopedContactSectionHref, type ContactRouteScope } from "../contacts/contact-route-scope.js";
import { getOrganizationSectionHref } from "../organizations/organization-sections.js";
import {
  getScopedProjectSectionHref,
  type ProjectRouteScope,
} from "../projects/project-route-scope.js";
import { resolveLetterDetailHref } from "./letters.js";

export type LetterRouteScope =
  | { kind: "global" }
  | { kind: "organization"; organizationRouteParam: string }
  | {
      kind: "project";
      projectRouteParam: string;
      projectScope?: ProjectRouteScope;
    }
  | {
      kind: "contact";
      contactRouteParam: string;
      contactScope?: ContactRouteScope;
    };

export function getLetterListBaseHref(scope: LetterRouteScope): string {
  switch (scope.kind) {
    case "global":
      return "/letters";
    case "organization":
      return getOrganizationSectionHref(
        scope.organizationRouteParam,
        "letters",
      );
    case "project":
      return getScopedProjectSectionHref(
        scope.projectRouteParam,
        "letters",
        scope.projectScope ?? { kind: "standalone" },
      );
    case "contact":
      return getScopedContactSectionHref(
        scope.contactRouteParam,
        "letters",
        scope.contactScope ?? { kind: "standalone" },
      );
  }
}

/** Prefer L-{n} when known; fall back to entity id under the scoped letters list. */
export function resolveScopedLetterDetailHref(
  letter: { id: string; number?: number | null },
  scope: LetterRouteScope,
): string {
  return resolveLetterDetailHref({
    id: letter.id,
    number: letter.number,
    listBaseHref: getLetterListBaseHref(scope),
  });
}
