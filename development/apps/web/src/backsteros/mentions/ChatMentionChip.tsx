import { useEffect, useState } from "react";

import { useBacksterosCodebaseProjects } from "../useBacksterosCodebaseProjects";
import { BacksterosMentionChip } from "./MentionChip";
import { parseMentionToken } from "./mention-tokens";
import { resolveMentionToken, type ResolvedMention } from "./resolveMention";

/** Resolves + renders a single mention chip for ChatMarkdown anchors. */
export function BacksterosChatMentionChip(props: { readonly raw: string }) {
  const token = parseMentionToken(props.raw);
  const { state: projectsState } = useBacksterosCodebaseProjects(token != null);
  const codebaseProjects = projectsState.status === "ready" ? projectsState.projects : undefined;
  const [resolved, setResolved] = useState<ResolvedMention | null>(null);

  useEffect(() => {
    if (!token) {
      setResolved(null);
      return;
    }
    const controller = new AbortController();
    void resolveMentionToken(token, {
      signal: controller.signal,
      ...(codebaseProjects ? { codebaseProjects } : {}),
    }).then(
      (next) => {
        if (!controller.signal.aborted) setResolved(next);
      },
      () => {
        if (!controller.signal.aborted) setResolved(null);
      },
    );
    return () => controller.abort();
  }, [token, codebaseProjects]);

  if (!token) {
    return <span>{props.raw}</span>;
  }

  return <BacksterosMentionChip token={token} resolved={resolved} layout="inline" />;
}
