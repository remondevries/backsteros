"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";

export type ListItemProjectMetaProps = {
  projectName?: string | null;
  projectKey?: string | null;
  projectIcon?: string | null;
  /** When set, render as a button (interactive inbox field). */
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
};

/**
 * Shared project chip for inbox / meeting / email list rows.
 */
export function ListItemProjectMeta({
  projectName,
  projectKey,
  projectIcon,
  buttonProps,
}: ListItemProjectMetaProps) {
  const label = projectName?.trim() || projectKey?.trim();
  if (!label) return null;
  const content = (
    <>
      <ProjectOcticon icon={projectIcon} size={12} />
      <span className="inbox-list-item-truncate">{label}</span>
    </>
  );
  if (buttonProps) {
    return (
      <button type="button" className="inbox-list-item-meta-label" {...buttonProps}>
        {content}
      </button>
    );
  }
  return <span className="inbox-list-item-meta-label">{content}</span>;
}

export type ListItemOrganizationMetaProps = {
  organizationName?: string | null;
  organizationAvatarSrc?: string | null;
};

/**
 * Shared organization chip for inbox / meeting / email list rows.
 */
export function ListItemOrganizationMeta({
  organizationName,
  organizationAvatarSrc,
}: ListItemOrganizationMetaProps) {
  const label = organizationName?.trim();
  if (!label) return null;
  return (
    <span className="inbox-list-item-meta-label">
      <EntityAvatarIcon
        src={organizationAvatarSrc}
        kind="organization"
        size={12}
      />
      <span className="inbox-list-item-truncate">{label}</span>
    </span>
  );
}

export type ListItemMetaPropertiesProps = {
  children: ReactNode;
};

/** Meta-properties row wrapper used under inbox-style stacked cards. */
export function ListItemMetaProperties({
  children,
}: ListItemMetaPropertiesProps) {
  return (
    <div className="app-side-panel-item-row-meta app-side-panel-item-row-meta-inbox inbox-list-item-card-layer">
      <span className="inbox-list-item-meta-properties">{children}</span>
    </div>
  );
}
