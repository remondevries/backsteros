import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("../client", () => ({
  fetchBacksterosTask: vi.fn(),
  updateBacksterosTask: vi.fn(),
  uploadBacksterosTaskImage: vi.fn(),
}));

import { fetchBacksterosTask, updateBacksterosTask, uploadBacksterosTaskImage } from "../client";
import {
  resetFileTaskPendingImagesForTests,
  stashFileTaskPendingImages,
} from "../fileTaskPendingImages";
import { attachFileTaskPendingImages } from "./attachFileTaskPendingImages";

const fetchMock = vi.mocked(fetchBacksterosTask);
const updateMock = vi.mocked(updateBacksterosTask);
const uploadMock = vi.mocked(uploadBacksterosTaskImage);

afterEach(() => {
  resetFileTaskPendingImagesForTests();
  vi.clearAllMocks();
});

describe("attachFileTaskPendingImages", () => {
  it("no-ops when nothing was stashed for the request", async () => {
    await attachFileTaskPendingImages({ requestId: "req-1", taskId: "task-1" });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads staged images and appends markdown to the description", async () => {
    const file = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });
    stashFileTaskPendingImages("req-1", [{ blobUrl: "blob:1", file }]);
    uploadMock.mockResolvedValue({
      id: "img-1",
      taskId: "task-1",
      contentType: "image/png",
      byteSize: 1,
      originalFilename: "shot.png",
      url: "/api/v1/tasks/task-1/images/img-1",
    });
    fetchMock.mockResolvedValue({
      id: "task-1",
      description: "Filed by Grok",
    } as Awaited<ReturnType<typeof fetchBacksterosTask>>);
    updateMock.mockResolvedValue({
      id: "task-1",
      description: "Filed by Grok\n\n![screenshot](/api/v1/tasks/task-1/images/img-1)\n",
    } as Awaited<ReturnType<typeof updateBacksterosTask>>);

    await attachFileTaskPendingImages({ requestId: "req-1", taskId: "task-1" });

    expect(uploadMock).toHaveBeenCalledWith("task-1", file, "shot.png", "image/png");
    expect(updateMock).toHaveBeenCalledWith("task-1", {
      description: "Filed by Grok\n\n![screenshot](/api/v1/tasks/task-1/images/img-1)\n",
    });
  });
});
