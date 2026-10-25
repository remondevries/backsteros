import {
  forbidden,
  getAuth,
  githubService,
  notFound,
  requireScope,
  resolveGithubAccessToken,
  routeProjectId,
  taskProjectService,
  unauthorized,
} from "../route-deps.js";
import type { Hono } from "../route-deps.js";

/** GitHub status, repositories and per-project branches/commits/pulls. */
export function registerProjectGithubRoutes(app: Hono) {
  app.get("/api/v1/github/status", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    try {
      const token = await resolveGithubAccessToken(auth);
      const status = await githubService.getGithubConnectionStatus(token);
      return c.json(status);
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        if (
          error.code === "github_oauth_missing" ||
          error.code === "github_oauth_unavailable" ||
          error.code === "github_token_missing" ||
          error.code === "github_auth_required"
        ) {
          return c.json(githubService.disconnectedGithubStatus(error.message));
        }
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/github/repositories", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    try {
      const token = await resolveGithubAccessToken(auth);
      const repositories = await githubService.listUserRepositories(token);
      return c.json({ repositories });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:id/github/branches", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
    );
    if (!project) {
      return c.json(notFound("Project"), 404);
    }
    if (project.type !== "codebase") {
      return c.json(
        {
          error: "GitHub is only available for codebase projects",
          code: "github_requires_codebase",
        },
        400,
      );
    }
    if (!project.githubRepository) {
      return c.json(
        {
          error: "No GitHub repository linked to this project",
          code: "github_repository_missing",
        },
        400,
      );
    }

    try {
      const token = await resolveGithubAccessToken(auth);
      const { owner, repo } = githubService.parseGithubRepositoryFullName(
        project.githubRepository,
      );
      const [repository, branches] = await Promise.all([
        githubService.getRepository(token, owner, repo),
        githubService.listRepositoryBranches(token, owner, repo),
      ]);
      return c.json({
        repository: project.githubRepository,
        defaultBranch: repository.defaultBranch,
        branches,
      });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:id/github/commits", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const branch = c.req.query("branch")?.trim();
    if (!branch) {
      return c.json(
        { error: "branch query parameter is required", code: "bad_request" },
        400,
      );
    }
    const pageRaw = c.req.query("page");
    const page = pageRaw ? Number(pageRaw) : 1;
    if (!Number.isInteger(page) || page < 1) {
      return c.json(
        { error: "Invalid page", code: "bad_request" },
        400,
      );
    }

    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
    );
    if (!project) {
      return c.json(notFound("Project"), 404);
    }
    if (project.type !== "codebase") {
      return c.json(
        {
          error: "GitHub is only available for codebase projects",
          code: "github_requires_codebase",
        },
        400,
      );
    }
    if (!project.githubRepository) {
      return c.json(
        {
          error: "No GitHub repository linked to this project",
          code: "github_repository_missing",
        },
        400,
      );
    }

    try {
      const token = await resolveGithubAccessToken(auth);
      const { owner, repo } = githubService.parseGithubRepositoryFullName(
        project.githubRepository,
      );
      const result = await githubService.listRepositoryCommits(
        token,
        owner,
        repo,
        { sha: branch, page },
      );
      return c.json({
        repository: project.githubRepository,
        branch,
        page: result.page,
        hasMore: result.hasMore,
        commits: result.commits,
      });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:id/github/commits/:sha", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const sha = c.req.param("sha")?.trim();
    if (!sha) {
      return c.json(
        { error: "Invalid commit sha", code: "bad_request" },
        400,
      );
    }

    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
    );
    if (!project) {
      return c.json(notFound("Project"), 404);
    }
    if (project.type !== "codebase") {
      return c.json(
        {
          error: "GitHub is only available for codebase projects",
          code: "github_requires_codebase",
        },
        400,
      );
    }
    if (!project.githubRepository) {
      return c.json(
        {
          error: "No GitHub repository linked to this project",
          code: "github_repository_missing",
        },
        400,
      );
    }

    try {
      const token = await resolveGithubAccessToken(auth);
      const { owner, repo } = githubService.parseGithubRepositoryFullName(
        project.githubRepository,
      );
      const result = await githubService.getRepositoryCommit(
        token,
        owner,
        repo,
        sha,
      );
      return c.json({
        repository: project.githubRepository,
        commit: result.commit,
        files: result.files,
      });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:id/github/pulls", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const pageRaw = c.req.query("page");
    const page = pageRaw ? Number(pageRaw) : 1;
    if (!Number.isInteger(page) || page < 1) {
      return c.json(
        { error: "Invalid page", code: "bad_request" },
        400,
      );
    }

    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
    );
    if (!project) {
      return c.json(notFound("Project"), 404);
    }
    if (project.type !== "codebase") {
      return c.json(
        {
          error: "GitHub is only available for codebase projects",
          code: "github_requires_codebase",
        },
        400,
      );
    }
    if (!project.githubRepository) {
      return c.json(
        {
          error: "No GitHub repository linked to this project",
          code: "github_repository_missing",
        },
        400,
      );
    }

    try {
      const token = await resolveGithubAccessToken(auth);
      const { owner, repo } = githubService.parseGithubRepositoryFullName(
        project.githubRepository,
      );
      const result = await githubService.listRepositoryPullRequests(
        token,
        owner,
        repo,
        { page },
      );
      return c.json({
        repository: project.githubRepository,
        page: result.page,
        hasMore: result.hasMore,
        pullRequests: result.pullRequests,
      });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:id/github/pulls/:number", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const number = Number(c.req.param("number"));
    if (!Number.isInteger(number) || number < 1) {
      return c.json(
        { error: "Invalid pull request number", code: "bad_request" },
        400,
      );
    }

    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
    );
    if (!project) {
      return c.json(notFound("Project"), 404);
    }
    if (project.type !== "codebase") {
      return c.json(
        {
          error: "GitHub is only available for codebase projects",
          code: "github_requires_codebase",
        },
        400,
      );
    }
    if (!project.githubRepository) {
      return c.json(
        {
          error: "No GitHub repository linked to this project",
          code: "github_repository_missing",
        },
        400,
      );
    }

    try {
      const token = await resolveGithubAccessToken(auth);
      const { owner, repo } = githubService.parseGithubRepositoryFullName(
        project.githubRepository,
      );
      const pullRequest = await githubService.getRepositoryPullRequest(
        token,
        owner,
        repo,
        number,
      );
      return c.json({
        repository: project.githubRepository,
        pullRequest,
      });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:id/github/pulls/:number/commits", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const number = Number(c.req.param("number"));
    if (!Number.isInteger(number) || number < 1) {
      return c.json(
        { error: "Invalid pull request number", code: "bad_request" },
        400,
      );
    }
    const pageRaw = c.req.query("page");
    const page = pageRaw ? Number(pageRaw) : 1;
    if (!Number.isInteger(page) || page < 1) {
      return c.json(
        { error: "Invalid page", code: "bad_request" },
        400,
      );
    }

    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
    );
    if (!project) {
      return c.json(notFound("Project"), 404);
    }
    if (project.type !== "codebase") {
      return c.json(
        {
          error: "GitHub is only available for codebase projects",
          code: "github_requires_codebase",
        },
        400,
      );
    }
    if (!project.githubRepository) {
      return c.json(
        {
          error: "No GitHub repository linked to this project",
          code: "github_repository_missing",
        },
        400,
      );
    }

    try {
      const token = await resolveGithubAccessToken(auth);
      const { owner, repo } = githubService.parseGithubRepositoryFullName(
        project.githubRepository,
      );
      const result = await githubService.listRepositoryPullRequestCommits(
        token,
        owner,
        repo,
        number,
        { page },
      );
      return c.json({
        repository: project.githubRepository,
        number,
        page: result.page,
        hasMore: result.hasMore,
        commits: result.commits,
      });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });

  app.get("/api/v1/projects/:id/github/pulls/:number/files", async (c) => {
    const auth = getAuth(c);
    if (!auth) {
      return c.json(unauthorized(), 401);
    }
    if (!requireScope("projects:read")(auth)) {
      return c.json(forbidden(), 403);
    }

    const projectIdRaw = c.req.param("id");
    const projectId = await routeProjectId(auth.workspaceId, projectIdRaw);
    if (!projectId) return c.json(notFound("Project"), 404);
    const number = Number(c.req.param("number"));
    if (!Number.isInteger(number) || number < 1) {
      return c.json(
        { error: "Invalid pull request number", code: "bad_request" },
        400,
      );
    }
    const pageRaw = c.req.query("page");
    const page = pageRaw ? Number(pageRaw) : 1;
    if (!Number.isInteger(page) || page < 1) {
      return c.json(
        { error: "Invalid page", code: "bad_request" },
        400,
      );
    }

    const project = await taskProjectService.getProjectById(
      auth.workspaceId,
      projectId,
    );
    if (!project) {
      return c.json(notFound("Project"), 404);
    }
    if (project.type !== "codebase") {
      return c.json(
        {
          error: "GitHub is only available for codebase projects",
          code: "github_requires_codebase",
        },
        400,
      );
    }
    if (!project.githubRepository) {
      return c.json(
        {
          error: "No GitHub repository linked to this project",
          code: "github_repository_missing",
        },
        400,
      );
    }

    try {
      const token = await resolveGithubAccessToken(auth);
      const { owner, repo } = githubService.parseGithubRepositoryFullName(
        project.githubRepository,
      );
      const result = await githubService.listRepositoryPullRequestFiles(
        token,
        owner,
        repo,
        number,
        { page },
      );
      return c.json({
        repository: project.githubRepository,
        number,
        page: result.page,
        hasMore: result.hasMore,
        files: result.files,
      });
    } catch (error) {
      if (error instanceof githubService.GithubServiceError) {
        return c.json(
          { error: error.message, code: error.code },
          error.status,
        );
      }
      throw error;
    }
  });
}
