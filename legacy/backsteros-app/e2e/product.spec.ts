import { expect, test, type Page } from "@playwright/test";

async function mockApi(page: Page) {
  await page.route("http://127.0.0.1:8787/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
        },
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projects: [],
        tasks: [],
        documents: [],
        letters: [],
        contacts: [],
        organizations: [],
        results: [],
      }),
      headers: { "access-control-allow-origin": "*" },
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("public sign-in route and root routing remain available", async ({
  page,
}, testInfo) => {
  await page.goto("/sign-in");
  await expect(page.getByText("Your work, connected.")).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL(/\/inbox$/);
  if (testInfo.project.name.startsWith("mobile")) {
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  }
});

test("responsive shell exposes desktop and mobile navigation", async ({
  page,
}, testInfo) => {
  await page.goto("/projects");
  if (testInfo.project.name.startsWith("mobile")) {
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Open tabs" })).toBeVisible();
  }
});

test("workspace nav routes cover core product surfaces", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile"), "Journey is covered once on desktop");

  await page.goto("/projects");
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();

  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page).toHaveURL(/\/tasks/);

  await page.getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/inbox/);

  await page.getByRole("link", { name: "Knowledge Base" }).click();
  await expect(page).toHaveURL(/\/knowledge/);

  await page.getByRole("link", { name: "Journal" }).click();
  await expect(page).toHaveURL(/\/journal/);

  await page.getByRole("link", { name: "Letters" }).click();
  await expect(page).toHaveURL(/\/letters/);

  await page.keyboard.press("ControlOrMeta+k");
  await expect(
    page.getByRole("dialog", { name: "Navigate Backsteros" }),
  ).toBeVisible();
});
