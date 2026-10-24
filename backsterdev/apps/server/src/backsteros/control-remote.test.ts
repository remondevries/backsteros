import http from "node:http";
import type { AddressInfo } from "node:net";
import { NodeWS } from "@effect/platform-node/NodeSocket";
import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2Command,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildRemoteWebSocketUrl,
  dispatchRemoteOrchestrationCommand,
  fetchRemoteShellSnapshot,
  fetchRemoteThreadShell,
  resolveOrCreateRemoteT3Project,
} from "./control-remote.ts";

const TOKEN = "remote-access-token";
const WORKSPACE = "/srv/workspace/app";

type RecordedHttp = {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
  readonly protocol: string | undefined;
  readonly body: unknown;
};

describe("control-remote (orchestration V2 remotes)", () => {
  let server: http.Server;
  let wss: InstanceType<typeof NodeWS.WebSocketServer>;
  let baseUrl: string;
  let httpRequests: RecordedHttp[];
  let wsUrls: string[];
  let rpcRequests: Array<{ tag: string; payload: unknown }>;
  let shell: {
    projects: unknown[];
    threads: unknown[];
    archivedThreads: unknown[];
  };
  let rpcResult: "success" | "dispatch-error";

  beforeEach(async () => {
    httpRequests = [];
    wsUrls = [];
    rpcRequests = [];
    rpcResult = "success";
    shell = { projects: [], threads: [], archivedThreads: [] };

    server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body = raw.length > 0 ? (JSON.parse(raw) as unknown) : null;
        const url = request.url ?? "";
        const protocolHeader = request.headers["x-t3-orchestration-protocol"];
        httpRequests.push({
          method: request.method ?? "GET",
          url,
          authorization: request.headers.authorization,
          protocol: Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader,
          body,
        });
        const json = (status: number, payload: unknown) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(payload));
        };
        if (request.headers.authorization !== `Bearer ${TOKEN}`) return json(401, {});
        if (request.method === "GET" && url === "/api/orchestration/shell") {
          if (request.headers["x-t3-orchestration-protocol"] !== "2") {
            return json(400, { message: "orchestration protocol 2 required" });
          }
          return json(200, { schemaVersion: 1, snapshotSequence: 1, ...shell });
        }
        if (request.method === "POST" && url === "/api/projects/mutate") {
          const mutation = body as { projectId: string; title: string; workspaceRoot: string };
          shell.projects.push({
            id: mutation.projectId,
            title: mutation.title,
            workspaceRoot: mutation.workspaceRoot,
            defaultModelSelection: null,
          });
          return json(200, { id: mutation.projectId });
        }
        if (request.method === "POST" && url === "/api/auth/websocket-ticket") {
          return json(200, { ticket: "ws-ticket-1", expiresAt: new Date().toISOString() });
        }
        return json(404, {});
      });
    });
    wss = new NodeWS.WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (socket, request) => {
      wsUrls.push(request.url ?? "");
      socket.on("message", (data) => {
        const frames = JSON.parse(String(data)) as unknown;
        for (const frame of Array.isArray(frames) ? frames : [frames]) {
          const message = frame as {
            _tag: string;
            id?: string;
            tag?: string;
            payload?: unknown;
          };
          if (message._tag === "Ping") {
            socket.send(JSON.stringify({ _tag: "Pong" }));
            continue;
          }
          if (message._tag !== "Request") continue;
          rpcRequests.push({ tag: message.tag ?? "", payload: message.payload });
          const exit =
            rpcResult === "success"
              ? { _tag: "Success", value: { sequence: 7 } }
              : {
                  _tag: "Failure",
                  cause: [
                    {
                      _tag: "Fail",
                      error: {
                        _tag: "OrchestrationV2DispatchCommandError",
                        commandId: "cmd-1",
                        commandType: "message.dispatch",
                        message: "provider instance is disabled",
                      },
                    },
                  ],
                };
          socket.send(JSON.stringify({ _tag: "Exit", requestId: message.id, exit }));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("builds the environment WebSocket URL with ticket and protocol params", () => {
    expect(buildRemoteWebSocketUrl("https://remote.example.com", "tkt")).toBe(
      "wss://remote.example.com/ws?wsTicket=tkt&orchestrationProtocol=2",
    );
    expect(buildRemoteWebSocketUrl("http://127.0.0.1:3773/", "a b")).toBe(
      "ws://127.0.0.1:3773/ws?wsTicket=a+b&orchestrationProtocol=2",
    );
    expect(buildRemoteWebSocketUrl("https://host.example/prefix/", "t")).toBe(
      "wss://host.example/prefix/ws?wsTicket=t&orchestrationProtocol=2",
    );
  });

  it("reads the V2 shell snapshot with Bearer + protocol header", async () => {
    shell.projects.push({ id: "p1", title: "App", workspaceRoot: WORKSPACE });
    const snapshot = await fetchRemoteShellSnapshot({ httpBaseUrl: baseUrl, accessToken: TOKEN });
    expect(snapshot.projects).toHaveLength(1);
    expect(httpRequests).toEqual([
      expect.objectContaining({
        method: "GET",
        url: "/api/orchestration/shell",
        authorization: `Bearer ${TOKEN}`,
        protocol: "2",
      }),
    ]);
    expect(httpRequests.some((request) => request.url.includes("/snapshot"))).toBe(false);
  });

  it("maps a rejected token to remote_unauthorized", async () => {
    await expect(
      fetchRemoteShellSnapshot({ httpBaseUrl: baseUrl, accessToken: "wrong" }),
    ).rejects.toMatchObject({ status: 401, code: "remote_unauthorized" });
  });

  it("finds a thread shell in the active or archived shell lists", async () => {
    shell.threads.push({ id: "t-active", status: "running" });
    shell.archivedThreads.push({ id: "t-archived", status: "completed" });
    const input = { httpBaseUrl: baseUrl, accessToken: TOKEN };
    await expect(fetchRemoteThreadShell({ ...input, threadId: "t-active" })).resolves.toMatchObject(
      { status: "running" },
    );
    await expect(
      fetchRemoteThreadShell({ ...input, threadId: "t-archived" }),
    ).resolves.toMatchObject({ status: "completed" });
    await expect(fetchRemoteThreadShell({ ...input, threadId: "missing" })).resolves.toBeNull();
  });

  it("creates a missing project through /api/projects/mutate (not orchestration dispatch)", async () => {
    const project = await resolveOrCreateRemoteT3Project({
      httpBaseUrl: baseUrl,
      accessToken: TOKEN,
      workspaceRoot: WORKSPACE,
      projectIdOverride: null,
      preferredTitle: "Backster App",
      newIds: () => ({ projectId: "proj-new", commandId: "cmd-new" }),
    });
    expect(project).toMatchObject({ id: "proj-new", title: "Backster App" });
    const mutate = httpRequests.find((request) => request.url === "/api/projects/mutate");
    expect(mutate).toMatchObject({
      method: "POST",
      authorization: `Bearer ${TOKEN}`,
      body: {
        type: "project.create",
        commandId: "cmd-new",
        projectId: "proj-new",
        title: "Backster App",
        workspaceRoot: WORKSPACE,
      },
    });
    expect(mutate?.body).not.toHaveProperty("createWorkspaceRootIfMissing");
    expect(httpRequests.some((request) => request.url.includes("/dispatch"))).toBe(false);
    expect(rpcRequests).toEqual([]);
  });

  it("reuses an existing project that matches the workspace root", async () => {
    shell.projects.push({ id: "p-existing", title: "App", workspaceRoot: `${WORKSPACE}/` });
    const project = await resolveOrCreateRemoteT3Project({
      httpBaseUrl: baseUrl,
      accessToken: TOKEN,
      workspaceRoot: WORKSPACE,
      projectIdOverride: null,
      preferredTitle: null,
      newIds: () => ({ projectId: "unused", commandId: "unused" }),
    });
    expect(project.id).toBe("p-existing");
    expect(httpRequests.some((request) => request.url === "/api/projects/mutate")).toBe(false);
  });

  const threadCreate: OrchestrationV2Command = {
    type: "thread.create",
    createdBy: "user",
    creationSource: "server",
    commandId: CommandId.make("cmd-create"),
    threadId: ThreadId.make("thread-1"),
    projectId: ProjectId.make("proj-1"),
    title: "OS-1 · Demo",
    modelSelection: createModelSelection(ProviderInstanceId.make("cursor"), "default"),
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
  };

  const messageDispatch: OrchestrationV2Command = {
    type: "message.dispatch",
    createdBy: "user",
    creationSource: "server",
    commandId: CommandId.make("cmd-message"),
    threadId: ThreadId.make("thread-1"),
    messageId: MessageId.make("msg-1"),
    text: "Do the task",
    attachments: [],
    titleSeed: "OS-1 · Demo",
    modelSelection: createModelSelection(ProviderInstanceId.make("cursor"), "default"),
    dispatchMode: { type: "start_immediately" },
  };

  it("dispatches thread.create and message.dispatch over the WebSocket RPC", async () => {
    await dispatchRemoteOrchestrationCommand({
      httpBaseUrl: baseUrl,
      accessToken: TOKEN,
      command: threadCreate,
    });
    await dispatchRemoteOrchestrationCommand({
      httpBaseUrl: baseUrl,
      accessToken: TOKEN,
      command: messageDispatch,
    });

    const ticketRequests = httpRequests.filter(
      (request) => request.url === "/api/auth/websocket-ticket",
    );
    expect(ticketRequests).toHaveLength(2);
    expect(ticketRequests[0]?.authorization).toBe(`Bearer ${TOKEN}`);
    expect(
      httpRequests.some((request) => request.url.includes("/api/orchestration/dispatch")),
    ).toBe(false);

    expect(wsUrls).toEqual([
      "/ws?wsTicket=ws-ticket-1&orchestrationProtocol=2",
      "/ws?wsTicket=ws-ticket-1&orchestrationProtocol=2",
    ]);
    expect(rpcRequests.map((request) => request.tag)).toEqual([
      "orchestration.dispatchCommand",
      "orchestration.dispatchCommand",
    ]);
    expect(rpcRequests[0]?.payload).toMatchObject({
      type: "thread.create",
      createdBy: "user",
      creationSource: "server",
      threadId: "thread-1",
    });
    expect(rpcRequests[1]?.payload).toMatchObject({
      type: "message.dispatch",
      createdBy: "user",
      creationSource: "server",
      text: "Do the task",
      attachments: [],
      titleSeed: "OS-1 · Demo",
      dispatchMode: { type: "start_immediately" },
    });
  });

  it("surfaces a dispatch rejection as remote_dispatch_failed", async () => {
    rpcResult = "dispatch-error";
    await expect(
      dispatchRemoteOrchestrationCommand({
        httpBaseUrl: baseUrl,
        accessToken: TOKEN,
        command: messageDispatch,
      }),
    ).rejects.toMatchObject({
      status: 500,
      code: "remote_dispatch_failed",
      error: expect.stringContaining("provider instance is disabled"),
    });
  });

  it("fails before connecting when the ticket request is rejected", async () => {
    await expect(
      dispatchRemoteOrchestrationCommand({
        httpBaseUrl: baseUrl,
        accessToken: "wrong",
        command: messageDispatch,
      }),
    ).rejects.toMatchObject({ status: 401, code: "remote_unauthorized" });
    expect(wsUrls).toEqual([]);
  });
});
