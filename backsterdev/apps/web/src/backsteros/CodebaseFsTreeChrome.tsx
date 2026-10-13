import { PierreEntryIcon } from "~/components/chat/PierreEntryIcon";
import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";

import { BacksterosComposeFolderIcon } from "./ComposeFolderIcon";

/** Desktop `console-fs-tree` chevron — rotates when expanded. */
export function CodebaseFsTreeChevron(props: { readonly expanded: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={cn("bos-fs-tree-chevron", props.expanded && "is-expanded")}
    >
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

export function CodebaseFsTreeChevronSpacer() {
  return <span className="bos-fs-tree-chevron-spacer" aria-hidden="true" />;
}

/** Folder / Pierre file-type icon matching desktop Files tree rows. */
export function CodebaseFsTreeEntryIcon(props: {
  readonly path: string;
  readonly kind: "file" | "directory";
}) {
  const { resolvedTheme } = useTheme();
  if (props.kind === "directory") {
    return <BacksterosComposeFolderIcon size={14} className="bos-fs-tree-icon" />;
  }
  return (
    <PierreEntryIcon
      pathValue={props.path}
      kind="file"
      theme={resolvedTheme === "light" ? "light" : "dark"}
      className="bos-fs-tree-icon bos-fs-tree-file-type-icon !size-[14px]"
    />
  );
}
