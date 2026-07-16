import { expect, test, type Page } from "@playwright/test";

const now = "2026-07-16T12:00:00.000Z";
const project = {
  id: "project-1", key: "BACK", name: "Backsteros launch", summary: "Ship the workspace",
  description: null, organizationId: null, areaId: null, area: null, startDate: null,
  dueDate: null, icon: null, color: null, status: "active", priority: 1, sortOrder: 0,
  createdAt: now, updatedAt: now, deletedAt: null,
};
const task = {
  id: "task-1", projectId: "project-1", contactId: null, assigneeId: null, number: 1,
  title: "Verify deployment", description: "Run browser smoke tests", status: "ready_to_start",
  priority: 1, sortOrder: 0, dueDate: null, triagedAt: null, inbox: true,
  completedAt: null, createdAt: now, updatedAt: now, deletedAt: null,
};
const document = {
  id: "doc-1", type: "knowledge", projectId: null, parentId: null, kind: "document",
  icon: null, sortOrder: 0, journalDate: null, path: "guides/deploy.md", title: "Deployment guide",
  storageKey: "documents/doc-1.md", contentType: "text/markdown", byteSize: 18,
  checksum: null, snippet: "Production steps", contentVersion: 1, contentEtag: null,
  createdAt: now, updatedAt: now, deletedAt: null,
};
const letter = {
  id: "letter-1", number: 1, projectId: "project-1", organizationId: null, contactId: null,
  title: "Launch confirmation", icon: null, context: "Deployment approved", status: "in_review",
  dueDate: null, receivedDate: now, direction: "incoming", storageKey: "",
  originalFilename: "", contentType: "application/pdf", byteSize: 0, checksum: null,
  contentEtag: null, extractedText: null, sortOrder: 0, createdAt: now, updatedAt: now,
  deletedAt: null,
};

async function mockApi(page: Page) {
  await page.route("http://127.0.0.1:8787/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = `${url.pathname}${url.search}`;
    let body: unknown = {};

    if (path === "/api/v1/projects") body = { projects: [project] };
    else if (path === "/api/v1/tasks") body = { tasks: [task] };
    else if (path === "/api/v1/tasks/inbox") body = { tasks: [task] };
    else if (path === "/api/v1/documents?type=knowledge") body = { documents: [document] };
    else if (path === "/api/v1/letters") body = { letters: [letter] };
    else if (path === "/api/v1/journal/2026-07-16") body = { ...document, id: "journal-1", type: "journal", journalDate: "2026-07-16", title: "July 16", path: "journal/2026-07-16.md" };
    else if (path === "/api/v1/documents/journal-1") body = { ...document, id: "journal-1", type: "journal", journalDate: "2026-07-16", title: "July 16", path: "journal/2026-07-16.md" };
    else if (path === "/api/v1/documents/journal-1/content") body = { content: "# Journal\nReady to ship.", contentType: "text/markdown", contentVersion: 1, byteSize: 24, checksum: null, updatedAt: now };
    else if (path === "/api/v1/documents/doc-1") body = document;
    else if (path === "/api/v1/documents/doc-1/content") body = { content: "# Deployment guide\nProduction steps.", contentType: "text/markdown", contentVersion: 1, byteSize: 36, checksum: null, updatedAt: now };
    else if (path.startsWith("/api/v1/global-search")) body = { results: [{ type: "project", id: "project-1", title: project.name, snippet: project.summary, updatedAt: now }] };
    else if (request.method() === "POST" && path === "/api/v1/tasks") body = { ...task, title: JSON.parse(request.postData() ?? "{}").title };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
      headers: { "access-control-allow-origin": "*" },
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("public sign-in route and root routing remain available", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("Your work, connected.")).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
});

test("responsive shell exposes desktop and mobile navigation", async ({ page }, testInfo) => {
  await page.goto("/projects");
  if (testInfo.project.name.startsWith("mobile")) {
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Open views" })).toBeVisible();
  }
});

test("mocked product journeys cover projects, tasks, inbox, docs, journal, letters, and search", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "Journey is covered once on desktop");

  await page.goto("/projects");
  await expect(page.getByText(project.name)).toBeVisible();

  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByText(task.title)).toBeVisible();

  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByRole("button", { name: "Triage" })).toBeVisible();

  await page.getByRole("link", { name: "Knowledge" }).click();
  await expect(page.getByText(document.title)).toBeVisible();
  await page.getByText(document.title).click();
  await expect(page.getByRole("heading", { name: document.title }).first()).toBeVisible();

  await page.getByRole("link", { name: "Journal" }).click();
  await expect(page.getByRole("heading", { name: "July 16" })).toBeVisible();

  await page.getByRole("link", { name: "Letters" }).click();
  await expect(page.getByText(letter.title)).toBeVisible();

  await page.keyboard.press("Meta+k");
  await page.getByPlaceholder("Search or jump to…").fill("launch");
  await expect(page.getByText(project.name).last()).toBeVisible();
});
