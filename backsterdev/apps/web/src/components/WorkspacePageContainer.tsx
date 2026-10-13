import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/utils";

export type WorkspacePageWidth = "readable" | "wide" | "expanded";

const WIDTH_CLASS: Record<WorkspacePageWidth, string> = {
  readable: "max-w-4xl",
  wide: "max-w-5xl",
  expanded: "max-w-6xl",
};

/**
 * Shared horizontal frame (max-width + gutters) for page chrome and body.
 * Keep header / tabs / content on the same vertical edge.
 */
export function WorkspacePageFrame({
  width = "readable",
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { readonly width?: WorkspacePageWidth }) {
  return (
    <div className={cn("mx-auto w-full px-5 sm:px-6", WIDTH_CLASS[width], className)} {...props} />
  );
}

/** Shared content frame for workspace pages. */
export function WorkspacePageContainer({
  width = "readable",
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { readonly width?: WorkspacePageWidth }) {
  return (
    <WorkspacePageFrame
      width={width}
      className={cn("flex flex-col gap-6 pt-6 pb-12", className)}
      {...props}
    />
  );
}
