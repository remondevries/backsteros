import { ScopedLettersPanel } from "./scoped-letters-panel";

type Props = {
  projectId: string;
};

/** Project letters list — status-grouped like the main Letters tab. */
export function ProjectLettersPanel({ projectId }: Props) {
  return (
    <ScopedLettersPanel
      scope={{ kind: "project", id: projectId }}
      emptyText="No letters linked to this project."
    />
  );
}
