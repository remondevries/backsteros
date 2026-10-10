import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  appendPendingImageMarkdown,
  commitPendingTaskImages,
  listPendingBlobUrlsInMarkdown,
  mapMarkdownImageUrls,
  normalizeTaskImageMimeType,
  replacePendingBlobUrlsInMarkdown,
  stagePendingTaskImages,
  stripPendingBlobImageMarkdown,
  TASK_IMAGE_MAX_BYTES,
  taskImageRejectionReason,
} from "./pendingTaskImages";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.restoreAllMocks();
});

describe("normalizeTaskImageMimeType", () => {
  it("accepts jpeg/png/webp/gif and normalizes jpg aliases", () => {
    expect(normalizeTaskImageMimeType("image/png")).toBe("image/png");
    expect(normalizeTaskImageMimeType("image/jpeg")).toBe("image/jpeg");
    expect(normalizeTaskImageMimeType("image/jpg")).toBe("image/jpeg");
    expect(normalizeTaskImageMimeType("image/pjpeg")).toBe("image/jpeg");
    expect(normalizeTaskImageMimeType("image/webp")).toBe("image/webp");
    expect(normalizeTaskImageMimeType("image/gif")).toBe("image/gif");
    expect(normalizeTaskImageMimeType("image/svg+xml")).toBeNull();
    expect(normalizeTaskImageMimeType("text/plain")).toBeNull();
  });
});

describe("taskImageRejectionReason", () => {
  it("rejects unsupported types and oversized files", () => {
    expect(
      taskImageRejectionReason(new File([new Uint8Array([1])], "a.svg", { type: "image/svg+xml" })),
    ).toMatch(/JPEG, PNG, WebP, and GIF/i);
    expect(
      taskImageRejectionReason(
        new File([new Uint8Array(TASK_IMAGE_MAX_BYTES + 1)], "big.png", { type: "image/png" }),
      ),
    ).toMatch(/10 MB/i);
    expect(
      taskImageRejectionReason(new File([new Uint8Array([1])], "ok.png", { type: "image/png" })),
    ).toBeNull();
  });
});

describe("stagePendingTaskImages", () => {
  it("stages accepted files as blob URLs and reports rejects", () => {
    let n = 0;
    URL.createObjectURL = ((file: Blob) => {
      n += 1;
      return `blob:pending-${n}-${file.size}`;
    }) as typeof URL.createObjectURL;

    const ok = new File([new Uint8Array([1, 2])], "shot.png", { type: "image/png" });
    const bad = new File([new Uint8Array([1])], "x.svg", { type: "image/svg+xml" });
    const result = stagePendingTaskImages([ok, bad]);

    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]?.blobUrl).toBe("blob:pending-1-2");
    expect(result.staged[0]?.file).toBe(ok);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/x\.svg/);
  });
});

describe("markdown pending blob helpers", () => {
  it("strips pending blob image embeds and keeps other markdown", () => {
    const markdown = [
      "See bug",
      "",
      "![screenshot](blob:abc)",
      "![keep](/api/v1/tasks/t1/images/i1)",
      "done",
    ].join("\n");
    expect(stripPendingBlobImageMarkdown(markdown, new Set(["blob:abc"]))).toBe(
      ["See bug", "", "![keep](/api/v1/tasks/t1/images/i1)", "done"].join("\n"),
    );
  });

  it("replaces pending blob URLs after upload", () => {
    const markdown = "![screenshot](blob:abc)\n\nnote";
    expect(
      replacePendingBlobUrlsInMarkdown(
        markdown,
        new Map([["blob:abc", "/api/v1/tasks/t1/images/i1"]]),
      ),
    ).toBe("![screenshot](/api/v1/tasks/t1/images/i1)\n\nnote");
  });

  it("lists pending blob urls in first-seen order", () => {
    const markdown = "![a](blob:one)\n![b](blob:two)\n![a2](blob:one)";
    expect(listPendingBlobUrlsInMarkdown(markdown, new Set(["blob:one", "blob:two"]))).toEqual([
      "blob:one",
      "blob:two",
    ]);
  });

  it("maps urls and collapses excess blank lines when removing", () => {
    expect(
      mapMarkdownImageUrls("a\n\n![x](blob:1)\n\n\nb", (url) => (url === "blob:1" ? null : url)),
    ).toBe("a\n\nb");
  });

  it("appends image markdown for staged blob urls", () => {
    expect(appendPendingImageMarkdown("brief", ["blob:1", "blob:2"])).toBe(
      "brief\n![screenshot](blob:1)\n![screenshot](blob:2)\n",
    );
    expect(appendPendingImageMarkdown("", ["blob:1"])).toBe("![screenshot](blob:1)\n");
  });
});

describe("commitPendingTaskImages", () => {
  it("uploads referenced pending files and rewrites markdown", async () => {
    const file = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });
    const upload = vi.fn(async () => ({ url: "/api/v1/tasks/task-1/images/img-1" }));
    const markdown = "bug\n\n![screenshot](blob:pending-1)\n";

    const next = await commitPendingTaskImages({
      taskId: "task-1",
      markdown,
      pendingByBlobUrl: new Map([["blob:pending-1", file]]),
      upload,
    });

    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith("task-1", file);
    expect(next).toBe("bug\n\n![screenshot](/api/v1/tasks/task-1/images/img-1)");
  });

  it("leaves markdown unchanged when no pending urls are present", async () => {
    const upload = vi.fn();
    const markdown = "plain text";
    await expect(
      commitPendingTaskImages({
        taskId: "task-1",
        markdown,
        pendingByBlobUrl: new Map([["blob:x", new File([], "x.png", { type: "image/png" })]]),
        upload,
      }),
    ).resolves.toBe(markdown);
    expect(upload).not.toHaveBeenCalled();
  });
});
