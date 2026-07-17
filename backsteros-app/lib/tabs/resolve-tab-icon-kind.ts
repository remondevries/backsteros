import { parseLetterSlug } from "@/lib/entity-slugs";
import { isLetterComposePath } from "@/lib/letters/navigation-path";

import { normalizeTabHref } from "./get-tab-title";

export type TabIconKind =
  | "inbox"
  | "journal"
  | "knowledge"
  | "tasks"
  | "projects"
  | "project"
  | "documents"
  | "letters"
  | "letter"
  | "contacts"
  | "contact"
  | "organizations"
  | "organization"
  | "settings";

export function resolveTabIconKind(href: string): TabIconKind | null {
  const path = normalizeTabHref(href);

  if (path.startsWith("/settings")) {
    return "settings";
  }

  if (/^\/projects\/[^/]+\/documents(?:\/|$)/.test(path)) {
    return "documents";
  }

  if (
    /^\/projects\/[^/]+\/tasks\/.+/.test(path) ||
    /^\/contacts\/[^/]+\/tasks\/.+/.test(path) ||
    /^\/tasks\/[^/]+\/.+/.test(path)
  ) {
    return "tasks";
  }

  const inboxDetailMatch = path.match(/^\/inbox\/([^/]+)$/);
  if (inboxDetailMatch) {
    const slug = inboxDetailMatch[1]!;
    if (parseLetterSlug(slug) != null) {
      return "letter";
    }

    return "tasks";
  }

  if (
    /^\/projects\/[^/]+\/letters\/.+/.test(path) ||
    (/^\/letters\/[^/]+/.test(path) && !isLetterComposePath(path))
  ) {
    return "letter";
  }

  if (/^\/knowledge\/.+/.test(path)) {
    return "documents";
  }

  if (/^\/projects\/[^/]+$/.test(path) && path !== "/projects/new") {
    return "project";
  }

  if (/^\/contacts\/[^/]+$/.test(path)) {
    return "contact";
  }

  if (/^\/organizations\/[^/]+$/.test(path)) {
    return "organization";
  }

  if (/^\/projects\/[^/]+\/tasks$/.test(path)) {
    return "tasks";
  }

  if (/^\/projects\/[^/]+\/letters$/.test(path)) {
    return "letters";
  }

  if (/^\/projects\/[^/]+\/updates$/.test(path)) {
    return "project";
  }

  if (/^\/contacts\/[^/]+\/letters$/.test(path)) {
    return "letters";
  }

  if (/^\/contacts\/[^/]+\/tasks$/.test(path)) {
    return "tasks";
  }

  if (/^\/organizations\/[^/]+\/projects$/.test(path)) {
    return "projects";
  }

  if (/^\/organizations\/[^/]+\/contacts$/.test(path)) {
    return "contacts";
  }

  if (/^\/organizations\/[^/]+\/letters$/.test(path)) {
    return "letters";
  }

  if (path === "/" || path === "/inbox") {
    return "inbox";
  }

  if (path.startsWith("/journal")) {
    return "journal";
  }

  if (path.startsWith("/knowledge")) {
    return "knowledge";
  }

  if (path.startsWith("/tasks")) {
    return "tasks";
  }

  if (path === "/projects" || path === "/projects/new") {
    return "projects";
  }

  if (path.startsWith("/letters")) {
    return "letters";
  }

  if (path === "/contacts") {
    return "contacts";
  }

  if (path === "/organizations") {
    return "organizations";
  }

  return null;
}
