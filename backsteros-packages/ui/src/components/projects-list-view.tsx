"use client";

import type { ComponentType, ReactNode } from "react";

import {
  getProjectsHref,
  type ProjectListItem,
} from "../entity-routes.js";
import { ProjectOcticon } from "./project-octicon.js";

export type ProjectsListLinkComponent = ComponentType<{
  to: string;
  className?: string;
  children: ReactNode;
}>;

export type ProjectsListViewProps = {
  items: ProjectListItem[];
  Link: ProjectsListLinkComponent;
  emptyLabel?: string;
};

/**
 * Projects list (no left content side panel on web) — icon + name + key.
 */
export function ProjectsListView({
  items,
  Link,
  emptyLabel = "No projects yet.",
}: ProjectsListViewProps) {
  return (
    <div className="projects-list-view">
      <header className="projects-list-header">
        <h1>Projects</h1>
        <p>Active work across your workspace</p>
      </header>
      {!items.length ? (
        <p className="projects-list-empty">{emptyLabel}</p>
      ) : (
        <ul className="projects-list">
          {items.map((project) => (
            <li key={project.id}>
              <Link
                to={getProjectsHref(project.key)}
                className="projects-list-item"
              >
                <span className="projects-list-item-icon" aria-hidden="true">
                  <ProjectOcticon icon={project.icon} size={18} />
                </span>
                <span className="projects-list-item-body">
                  <span className="projects-list-item-name">{project.name}</span>
                  <span className="projects-list-item-key">{project.key}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
