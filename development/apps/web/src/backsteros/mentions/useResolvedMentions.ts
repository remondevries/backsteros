import { useEffect, useMemo, useState } from "react";

import { useBacksterosCodebaseProjects } from "../useBacksterosCodebaseProjects";
import {
  collectMentionTokens,
  getMentionTokenCacheKey,
  type ParsedMentionToken,
} from "./mention-tokens";
import { resolveMentionTokens, type ResolvedMention } from "./resolveMention";

export function useResolvedMentions(body: string): {
  readonly tokens: readonly ParsedMentionToken[];
  readonly byKey: ReadonlyMap<string, ResolvedMention>;
} {
  const tokens = useMemo(() => collectMentionTokens(body), [body]);
  const tokenKey = useMemo(() => tokens.map(getMentionTokenCacheKey).join("|"), [tokens]);
  const { state: projectsState } = useBacksterosCodebaseProjects(tokens.length > 0);
  const codebaseProjects = projectsState.status === "ready" ? projectsState.projects : undefined;

  const [byKey, setByKey] = useState<ReadonlyMap<string, ResolvedMention>>(() => new Map());

  useEffect(() => {
    if (tokens.length === 0) {
      setByKey(new Map());
      return;
    }
    const controller = new AbortController();
    void resolveMentionTokens(tokens, {
      signal: controller.signal,
      ...(codebaseProjects ? { codebaseProjects } : {}),
    }).then(
      (resolved) => {
        if (!controller.signal.aborted) setByKey(resolved);
      },
      () => {
        if (!controller.signal.aborted) setByKey(new Map());
      },
    );
    return () => controller.abort();
  }, [tokenKey, codebaseProjects, tokens]);

  return { tokens, byKey };
}
