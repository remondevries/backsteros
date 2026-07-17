type ContentSidePanelPlaceholderProps = {
  title?: string;
  description?: string;
};

export function ContentSidePanelPlaceholder({
  title = "Overview",
  description = "Context for this view will appear here.",
}: ContentSidePanelPlaceholderProps) {
  return (
    <div className="p-4 text-sm text-foreground/60">
      <p className="font-medium text-foreground/80">{title}</p>
      <p className="mt-2">{description}</p>
    </div>
  );
}
