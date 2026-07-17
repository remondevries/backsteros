export type AssignableProject = {
  id: string;
  name: string;
  key: string;
  icon: string | null;
  color: string | null;
};

export function mapProjectToAssignable(project: {
  id: string;
  name: string;
  key: string;
  icon: string | null;
  color: string | null;
}): AssignableProject {
  return {
    id: project.id,
    name: project.name,
    key: project.key,
    icon: project.icon,
    color: project.color,
  };
}

export function getAssignableProjects(): AssignableProject[] {
  return [];
}
