type DocumentsSectionEmptyStateProps = {
  variant?: "knowledge" | "project";
};

/** Circle DocumentsSectionEmptyState — empty main pane (no project section tabs). */
export function DocumentsSectionEmptyState({
  variant = "project",
}: DocumentsSectionEmptyStateProps) {
  const heading = variant === "knowledge" ? "Knowledge Base" : "Project documents";
  const description =
    variant === "knowledge"
      ? "Store shared specs, guides, and reference notes as markdown files. Use the sidebar to browse folders, or create your first document with the plus button."
      : "Store specs, notes, and agent context as markdown files. Use the sidebar to browse folders, or create your first document with the plus button.";

  return (
    <div className="flex h-full min-h-0 flex-col items-start justify-center gap-4 px-8 py-10">
      <div className="max-w-md">
        <h2 className="text-lg font-medium text-foreground">{heading}</h2>
        <p className="mt-2 text-sm leading-6 text-foreground/55">{description}</p>
      </div>
    </div>
  );
}
