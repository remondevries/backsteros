import { formatRelativeTimeLabel } from "../../timestampFormat";
import type {
  DiscoveredDeployment,
  DiscoveredSite,
  SiteComponentType,
  WordpressComponentJob,
} from "./hetznerApi";

const COMPONENT_TYPE_LABELS: Record<SiteComponentType, string> = {
  theme: "theme",
  platform_plugin: "plugin",
  client_plugin: "client plugin",
  recipe_mu: "Required Plugin",
};

function shortCommit(sha: string | null | undefined): string | null {
  const value = sha?.trim();
  if (!value) return null;
  return value.length > 7 ? value.slice(0, 7) : value;
}

function jobStatusToDeploymentStatus(
  status: WordpressComponentJob["status"],
): DiscoveredDeployment["status"] {
  if (status === "failed") return "failed";
  if (status === "queued" || status === "running") return "running";
  return "success";
}

function jobSummary(job: WordpressComponentJob): string {
  const typeLabel = COMPONENT_TYPE_LABELS[job.componentType] ?? job.componentType;
  const repoName = job.repo.split("/").pop() ?? job.repo;
  if (job.status === "queued" || job.status === "running") {
    return `Deploying ${typeLabel} (${repoName})`;
  }
  if (job.status === "failed") {
    return `Failed ${typeLabel} (${repoName})`;
  }
  if (job.status === "skipped") {
    return `Skipped ${typeLabel} (${repoName})`;
  }
  return `Deployed ${typeLabel} (${repoName})`;
}

/**
 * Map WordPress component deploy jobs into the overview Deployments / Activity shape.
 * Kamal boot audits are not used for `framework: "wordpress"` apps.
 */
export function wordpressJobsToDeployments(
  jobs: readonly WordpressComponentJob[],
  site: DiscoveredSite,
): DiscoveredDeployment[] {
  const mapped = jobs.map((job) => {
    const at = job.finishedAt ?? job.startedAt ?? job.createdAt;
    const commit = shortCommit(job.sha) ?? shortCommit(job.id);
    const relative = formatRelativeTimeLabel(at);
    const startedAt = job.startedAt ?? job.createdAt;
    const finishedAt = job.finishedAt;
    const durationMs =
      startedAt && finishedAt ? Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) : null;
    return {
      id: `wp-job:${job.id}`,
      status: jobStatusToDeploymentStatus(job.status),
      commit,
      version: job.sha ?? job.ref,
      siteDomain: site.domain,
      siteAccent: site.accent,
      siteInitial: site.initial,
      summary: jobSummary(job),
      meta: `${job.path} · ${relative || "just now"}`,
      actor: null,
      appName: site.service,
      serverName: site.serverName,
      serverId: site.serverId,
      at,
      branch: job.ref || null,
      via: "Custom",
      output: job.output || null,
      startedAt,
      finishedAt,
      durationMs,
      buildDurationMs: 1000,
    } satisfies DiscoveredDeployment;
  });

  return [...mapped].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
