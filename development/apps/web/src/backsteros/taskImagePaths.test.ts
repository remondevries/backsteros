import { describe, expect, it } from "vitest";

import { listTaskImageRefsFromMarkdown, parseTaskImageContentPath } from "./taskImagePaths";

describe("parseTaskImageContentPath", () => {
  it("parses relative and absolute content paths", () => {
    const path = "/api/v1/tasks/task_1/images/img_2";
    expect(parseTaskImageContentPath(path)).toEqual({
      taskId: "task_1",
      imageId: "img_2",
    });
    expect(parseTaskImageContentPath(`https://api.example${path}`)).toEqual({
      taskId: "task_1",
      imageId: "img_2",
    });
    expect(parseTaskImageContentPath("/other")).toBeNull();
  });

  it("decodes percent-encoded ids", () => {
    expect(parseTaskImageContentPath("/api/v1/tasks/t%2F1/images/i%2F2")).toEqual({
      taskId: "t/1",
      imageId: "i/2",
    });
  });
});

describe("listTaskImageRefsFromMarkdown", () => {
  it("collects unique markdown image embeds in order", () => {
    const markdown = [
      "See ![one](/api/v1/tasks/t1/images/i1)",
      "and ![two](https://host.example/api/v1/tasks/t1/images/i2)",
      "and again ![one](/api/v1/tasks/t1/images/i1)",
      "and ![external](https://cdn.example/pic.png)",
    ].join("\n");

    expect(listTaskImageRefsFromMarkdown(markdown)).toEqual([
      { taskId: "t1", imageId: "i1" },
      { taskId: "t1", imageId: "i2" },
    ]);
  });

  it("returns empty for descriptions without task images", () => {
    expect(listTaskImageRefsFromMarkdown("plain text\n![x](https://x.test/a.png)")).toEqual([]);
  });
});
