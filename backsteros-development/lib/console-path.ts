export type GithubListTab = "commits" | "pulls";
export type GithubPullDetailTab = "conversation" | "commits" | "files";

export type ConsoleRoute = {
  inbox: boolean;
  settings: boolean;
  settingsTab: string | null;
  projectId: string | null;
  taskId: string | null;
  tabId: string | null;
  /** Project overview GitHub list segment (`/commits` or `/pulls`). */
  githubListTab: GithubListTab | null;
  /** Commit detail (`/{projectId}/commit/{sha}`). */
  commitSha: string | null;
  /** Pull request detail (`/{projectId}/pull/{number}`). */
  pullNumber: number | null;
  /** PR detail tab; omitted from the URL when `conversation`. */
  pullTab: GithubPullDetailTab | null;
};

const GITHUB_LIST_TABS = new Set<string>(["commits", "pulls"]);
const GITHUB_PULL_TABS = new Set<string>([
  "conversation",
  "commits",
  "files",
]);

export function emptyConsoleRoute(): ConsoleRoute {
  return {
    inbox: false,
    settings: false,
    settingsTab: null,
    projectId: null,
    taskId: null,
    tabId: null,
    githubListTab: null,
    commitSha: null,
    pullNumber: null,
    pullTab: null,
  };
}

function decodePart(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parsePullTab(value: string | null): GithubPullDetailTab | null {
  if (!value) return null;
  if (GITHUB_PULL_TABS.has(value)) {
    return value as GithubPullDetailTab;
  }
  return null;
}

export function parseConsoleSlug(
  slug: string[] | undefined | null,
): ConsoleRoute {
  const parts = slug ?? [];
  const head = decodePart(parts[0]);

  if (head === "settings") {
    return {
      ...emptyConsoleRoute(),
      settings: true,
      settingsTab: decodePart(parts[1]),
    };
  }

  if (head === "inbox") {
    return {
      ...emptyConsoleRoute(),
      inbox: true,
      taskId: decodePart(parts[1]),
    };
  }

  const projectId = head;
  const second = decodePart(parts[1]);
  const third = decodePart(parts[2]);
  const fourth = decodePart(parts[3]);

  if (!projectId) {
    return emptyConsoleRoute();
  }

  if (second === "commit" && third) {
    return {
      ...emptyConsoleRoute(),
      projectId,
      commitSha: third,
      githubListTab: "commits",
    };
  }

  if (second === "pull" && third) {
    const pullNumber = Number(third);
    if (Number.isInteger(pullNumber) && pullNumber > 0) {
      const fifth = decodePart(parts[4]);
      // Nested commit opened from a PR: /{project}/pull/{n}/commit/{sha}
      if (fourth === "commit" && fifth) {
        return {
          ...emptyConsoleRoute(),
          projectId,
          pullNumber,
          commitSha: fifth,
          pullTab: "commits",
          githubListTab: "pulls",
        };
      }
      const pullTab = parsePullTab(fourth);
      return {
        ...emptyConsoleRoute(),
        projectId,
        pullNumber,
        pullTab:
          pullTab && pullTab !== "conversation" ? pullTab : null,
        githubListTab: "pulls",
      };
    }
  }

  if (second && GITHUB_LIST_TABS.has(second)) {
    return {
      ...emptyConsoleRoute(),
      projectId,
      githubListTab: second as GithubListTab,
    };
  }

  return {
    ...emptyConsoleRoute(),
    projectId,
    taskId: second,
    tabId: third,
  };
}

export function buildConsolePath(route: ConsoleRoute): string {
  if (route.settings) {
    const segments = ["settings"];
    if (route.settingsTab) {
      segments.push(encodeURIComponent(route.settingsTab));
    }
    return `/${segments.join("/")}`;
  }

  if (route.inbox) {
    const segments = ["inbox"];
    if (route.taskId) {
      segments.push(encodeURIComponent(route.taskId));
    }
    return `/${segments.join("/")}`;
  }

  const segments: string[] = [];
  if (route.projectId) {
    segments.push(encodeURIComponent(route.projectId));

    if (route.commitSha && route.pullNumber != null) {
      segments.push(
        "pull",
        encodeURIComponent(String(route.pullNumber)),
        "commit",
        encodeURIComponent(route.commitSha),
      );
    } else if (route.commitSha) {
      segments.push("commit", encodeURIComponent(route.commitSha));
    } else if (route.pullNumber != null) {
      segments.push("pull", encodeURIComponent(String(route.pullNumber)));
      if (route.pullTab && route.pullTab !== "conversation") {
        segments.push(encodeURIComponent(route.pullTab));
      }
    } else if (route.githubListTab) {
      segments.push(route.githubListTab);
    } else if (route.taskId) {
      segments.push(encodeURIComponent(route.taskId));
      if (route.tabId) {
        segments.push(encodeURIComponent(route.tabId));
      }
    }
  }
  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

export function buildSettingsPath(tab: string = "general"): string {
  return `/settings/${encodeURIComponent(tab)}`;
}
