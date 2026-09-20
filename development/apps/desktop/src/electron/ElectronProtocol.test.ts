import { assert, describe, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { beforeEach, vi } from "vite-plus/test";

const { handleMock, netFetchMock, unhandleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  netFetchMock: vi.fn(),
  unhandleMock: vi.fn(),
}));

vi.mock("electron", () => ({
  net: { fetch: netFetchMock },
  protocol: { handle: handleMock, unhandle: unhandleMock },
}));

import * as ElectronProtocol from "./ElectronProtocol.ts";

describe("ElectronProtocol", () => {
  beforeEach(() => {
    handleMock.mockReset();
    netFetchMock.mockReset();
    unhandleMock.mockReset();
  });

  it.effect("proxies the stable renderer origin to the current app server", () =>
    Effect.gen(function* () {
      let handler: ((request: Request) => Promise<Response>) | undefined;
      handleMock.mockImplementation((_scheme, nextHandler) => {
        handler = nextHandler;
      });
      netFetchMock.mockResolvedValue(new Response("ok"));

      yield* Effect.scoped(
        Effect.gen(function* () {
          const protocol = yield* ElectronProtocol.ElectronProtocol;
          yield* protocol.registerDesktopProtocol({
            scheme: "t3code-dev",
            targetOrigin: new URL("http://127.0.0.1:3773/"),
            backendOrigin: new URL("http://127.0.0.1:3774/"),
            clerkFrontendApiHostname: "clerk.t3.codes",
          });
          assert.isDefined(handler);

          const response = yield* Effect.promise(() =>
            handler!(
              new Request("t3code-dev://app/api/health?verbose=1", {
                headers: {
                  accept: "application/json",
                  origin: "t3code-dev://app",
                  referer: "t3code-dev://app/",
                  "sec-fetch-site": "same-origin",
                },
              }),
            ),
          );
          assert.equal(yield* Effect.promise(() => response.text()), "ok");
          assert.include(
            response.headers.get("content-security-policy") ?? "",
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://clerk.t3.codes https://challenges.cloudflare.com",
          );
          assert.include(
            response.headers.get("content-security-policy") ?? "",
            "connect-src 'self' http: https: ws: wss:",
          );
          assert.include(
            response.headers.get("content-security-policy") ?? "",
            "img-src 'self' t3code-dev: blob: data: http: https:",
          );
          assert.include(
            response.headers.get("content-security-policy") ?? "",
            "font-src 'self' t3code-dev: data:",
          );
        }),
      );

      assert.deepEqual(
        handleMock.mock.calls.map((call) => call[0]),
        ["t3code-dev"],
      );
      assert.equal(netFetchMock.mock.calls[0]?.[0], "http://127.0.0.1:3773/api/health?verbose=1");
      const forwardedHeaders = new Headers(netFetchMock.mock.calls[0]?.[1]?.headers);
      assert.equal(forwardedHeaders.get("accept"), "application/json");
      assert.isNull(forwardedHeaders.get("origin"));
      assert.isNull(forwardedHeaders.get("referer"));
      assert.isNull(forwardedHeaders.get("sec-fetch-site"));
      assert.deepEqual(unhandleMock.mock.calls, [["t3code-dev"]]);
    }).pipe(Effect.provide(ElectronProtocol.layer)),
  );

  it.effect(
    "proxies local-core paths to BACKSTEROS_LOCAL_CORE_URL while product API stays separate",
    () =>
      Effect.gen(function* () {
        let handler: ((request: Request) => Promise<Response>) | undefined;
        handleMock.mockImplementation((_scheme, nextHandler) => {
          handler = nextHandler;
        });
        netFetchMock.mockResolvedValue(
          new Response(JSON.stringify({ entries: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );

        const previousApiUrl = process.env.BACKSTEROS_API_URL;
        const previousLocalCoreUrl = process.env.BACKSTEROS_LOCAL_CORE_URL;
        const previousKey = process.env.BACKSTEROS_API_KEY;
        process.env.BACKSTEROS_API_URL = "https://agent.backsteros.com";
        process.env.BACKSTEROS_LOCAL_CORE_URL = "http://127.0.0.1:8788";
        process.env.BACKSTEROS_API_KEY = "sk_live_test";

        try {
          yield* Effect.scoped(
            Effect.gen(function* () {
              const protocol = yield* ElectronProtocol.ElectronProtocol;
              yield* protocol.registerDesktopProtocol({
                scheme: "t3code",
                targetOrigin: new URL("http://127.0.0.1:3773/"),
                backendOrigin: new URL("http://127.0.0.1:3773/"),
                clerkFrontendApiHostname: undefined,
              });
              assert.isDefined(handler);

              const fsResponse = yield* Effect.promise(() =>
                handler!(
                  new Request("t3code://app/backsteros-local-core/api/v1/projects/p1/fs/entries", {
                    headers: { accept: "application/json" },
                  }),
                ),
              );
              assert.equal(fsResponse.status, 200);

              const productResponse = yield* Effect.promise(() =>
                handler!(
                  new Request("t3code://app/backsteros-api/api/v1/projects?type=codebase", {
                    headers: { accept: "application/json" },
                  }),
                ),
              );
              assert.equal(productResponse.status, 200);
            }),
          );
        } finally {
          if (previousApiUrl === undefined) {
            delete process.env.BACKSTEROS_API_URL;
          } else {
            process.env.BACKSTEROS_API_URL = previousApiUrl;
          }
          if (previousLocalCoreUrl === undefined) {
            delete process.env.BACKSTEROS_LOCAL_CORE_URL;
          } else {
            process.env.BACKSTEROS_LOCAL_CORE_URL = previousLocalCoreUrl;
          }
          if (previousKey === undefined) {
            delete process.env.BACKSTEROS_API_KEY;
          } else {
            process.env.BACKSTEROS_API_KEY = previousKey;
          }
        }

        assert.equal(
          netFetchMock.mock.calls[0]?.[0],
          "http://127.0.0.1:8788/api/v1/projects/p1/fs/entries",
        );
        assert.equal(
          netFetchMock.mock.calls[1]?.[0],
          "https://agent.backsteros.com/api/v1/projects?type=codebase",
        );
      }).pipe(Effect.provide(ElectronProtocol.layer)),
  );

  it.effect("returns 502 with local-core origin when local-core is unreachable", () =>
    Effect.gen(function* () {
      let handler: ((request: Request) => Promise<Response>) | undefined;
      handleMock.mockImplementation((_scheme, nextHandler) => {
        handler = nextHandler;
      });
      netFetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      const previousLocalCoreUrl = process.env.BACKSTEROS_LOCAL_CORE_URL;
      process.env.BACKSTEROS_LOCAL_CORE_URL = "http://127.0.0.1:8788";

      try {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const protocol = yield* ElectronProtocol.ElectronProtocol;
            yield* protocol.registerDesktopProtocol({
              scheme: "t3code",
              targetOrigin: new URL("http://127.0.0.1:3773/"),
              backendOrigin: new URL("http://127.0.0.1:3773/"),
              clerkFrontendApiHostname: undefined,
            });
            assert.isDefined(handler);

            const response = yield* Effect.promise(() =>
              handler!(
                new Request("t3code://app/backsteros-local-core/api/v1/projects/p1/docs", {
                  headers: { accept: "application/json" },
                }),
              ),
            );
            assert.equal(response.status, 502);
            const body = JSON.parse(yield* Effect.promise(() => response.text())) as {
              origin?: string;
            };
            assert.equal(body.origin, "http://127.0.0.1:8788");
          }),
        );
      } finally {
        if (previousLocalCoreUrl === undefined) {
          delete process.env.BACKSTEROS_LOCAL_CORE_URL;
        } else {
          process.env.BACKSTEROS_LOCAL_CORE_URL = previousLocalCoreUrl;
        }
      }
    }).pipe(Effect.provide(ElectronProtocol.layer)),
  );

  it.effect("proxies BacksterOS API paths to the local BacksterOS origin", () =>
    Effect.gen(function* () {
      let handler: ((request: Request) => Promise<Response>) | undefined;
      handleMock.mockImplementation((_scheme, nextHandler) => {
        handler = nextHandler;
      });
      netFetchMock.mockResolvedValue(
        new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const previousUrl = process.env.BACKSTEROS_API_URL;
      const previousKey = process.env.BACKSTEROS_API_KEY;
      process.env.BACKSTEROS_API_URL = "http://127.0.0.1:18788";
      process.env.BACKSTEROS_API_KEY = "sk_live_test";

      try {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const protocol = yield* ElectronProtocol.ElectronProtocol;
            yield* protocol.registerDesktopProtocol({
              scheme: "t3code",
              targetOrigin: new URL("http://127.0.0.1:3773/"),
              backendOrigin: new URL("http://127.0.0.1:3773/"),
              clerkFrontendApiHostname: undefined,
            });
            assert.isDefined(handler);

            const response = yield* Effect.promise(() =>
              handler!(
                new Request("t3code://app/backsteros-api/api/v1/projects?type=codebase", {
                  headers: { accept: "application/json" },
                }),
              ),
            );
            assert.equal(response.status, 200);
            assert.equal(
              yield* Effect.promise(() => response.text()),
              JSON.stringify({ projects: [] }),
            );
          }),
        );
      } finally {
        if (previousUrl === undefined) {
          delete process.env.BACKSTEROS_API_URL;
        } else {
          process.env.BACKSTEROS_API_URL = previousUrl;
        }
        if (previousKey === undefined) {
          delete process.env.BACKSTEROS_API_KEY;
        } else {
          process.env.BACKSTEROS_API_KEY = previousKey;
        }
      }

      assert.equal(
        netFetchMock.mock.calls[0]?.[0],
        "http://127.0.0.1:18788/api/v1/projects?type=codebase",
      );
      const forwardedHeaders = new Headers(netFetchMock.mock.calls[0]?.[1]?.headers);
      assert.equal(forwardedHeaders.get("authorization"), "Bearer sk_live_test");
      assert.isNull(forwardedHeaders.get("origin"));
    }).pipe(Effect.provide(ElectronProtocol.layer)),
  );

  it.effect("prefers env/cli BacksterOS API key over a stale renderer Authorization header", () =>
    Effect.gen(function* () {
      let handler: ((request: Request) => Promise<Response>) | undefined;
      handleMock.mockImplementation((_scheme, nextHandler) => {
        handler = nextHandler;
      });
      netFetchMock.mockResolvedValue(
        new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const previousUrl = process.env.BACKSTEROS_API_URL;
      const previousKey = process.env.BACKSTEROS_API_KEY;
      process.env.BACKSTEROS_API_URL = "https://api.local.backsteros.com";
      process.env.BACKSTEROS_API_KEY = "sk_live_owner";

      try {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const protocol = yield* ElectronProtocol.ElectronProtocol;
            yield* protocol.registerDesktopProtocol({
              scheme: "t3code",
              targetOrigin: new URL("http://127.0.0.1:3773/"),
              backendOrigin: new URL("http://127.0.0.1:3773/"),
              clerkFrontendApiHostname: undefined,
            });
            assert.isDefined(handler);

            const response = yield* Effect.promise(() =>
              handler!(
                new Request("t3code://app/backsteros-api/api/v1/projects?type=codebase", {
                  headers: {
                    accept: "application/json",
                    authorization: "Bearer sk_stale_from_settings",
                  },
                }),
              ),
            );
            assert.equal(response.status, 200);
          }),
        );
      } finally {
        if (previousUrl === undefined) {
          delete process.env.BACKSTEROS_API_URL;
        } else {
          process.env.BACKSTEROS_API_URL = previousUrl;
        }
        if (previousKey === undefined) {
          delete process.env.BACKSTEROS_API_KEY;
        } else {
          process.env.BACKSTEROS_API_KEY = previousKey;
        }
      }

      const forwardedHeaders = new Headers(netFetchMock.mock.calls[0]?.[1]?.headers);
      assert.equal(forwardedHeaders.get("authorization"), "Bearer sk_live_owner");
    }).pipe(Effect.provide(ElectronProtocol.layer)),
  );

  it.effect("falls back to Node fetch when Electron net.fetch cannot reach BacksterOS", () =>
    Effect.gen(function* () {
      let handler: ((request: Request) => Promise<Response>) | undefined;
      handleMock.mockImplementation((_scheme, nextHandler) => {
        handler = nextHandler;
      });
      netFetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      const previousFetch = globalThis.fetch;
      const nodeFetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      globalThis.fetch = nodeFetchMock as typeof fetch;

      const previousUrl = process.env.BACKSTEROS_API_URL;
      process.env.BACKSTEROS_API_URL = "http://127.0.0.1:18788";

      try {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const protocol = yield* ElectronProtocol.ElectronProtocol;
            yield* protocol.registerDesktopProtocol({
              scheme: "t3code",
              targetOrigin: new URL("http://127.0.0.1:3773/"),
              backendOrigin: new URL("http://127.0.0.1:3773/"),
              clerkFrontendApiHostname: undefined,
            });
            assert.isDefined(handler);

            const response = yield* Effect.promise(() =>
              handler!(
                new Request("t3code://app/backsteros-api/api/v1/projects?type=codebase", {
                  headers: { accept: "application/json" },
                }),
              ),
            );
            assert.equal(response.status, 200);
            assert.equal(
              yield* Effect.promise(() => response.text()),
              JSON.stringify({ projects: [] }),
            );
          }),
        );
      } finally {
        globalThis.fetch = previousFetch;
        if (previousUrl === undefined) {
          delete process.env.BACKSTEROS_API_URL;
        } else {
          process.env.BACKSTEROS_API_URL = previousUrl;
        }
      }

      assert.equal(
        nodeFetchMock.mock.calls[0]?.[0],
        "http://127.0.0.1:18788/api/v1/projects?type=codebase",
      );
    }).pipe(Effect.provide(ElectronProtocol.layer)),
  );

  it.effect("rejects custom protocol requests for another host", () =>
    Effect.gen(function* () {
      let handler: ((request: Request) => Promise<Response>) | undefined;
      handleMock.mockImplementation((_scheme, nextHandler) => {
        handler = nextHandler;
      });

      const response = yield* Effect.scoped(
        Effect.gen(function* () {
          const protocol = yield* ElectronProtocol.ElectronProtocol;
          yield* protocol.registerDesktopProtocol({
            scheme: "t3code",
            targetOrigin: new URL("http://127.0.0.1:3773/"),
            backendOrigin: new URL("http://127.0.0.1:3773/"),
            clerkFrontendApiHostname: undefined,
          });
          return yield* Effect.promise(() => handler!(new Request("t3code://other/")));
        }),
      );

      assert.equal(response.status, 404);
      assert.equal(netFetchMock.mock.calls.length, 0);
    }).pipe(Effect.provide(ElectronProtocol.layer)),
  );

  it.effect("retries transient renderer target failures", () =>
    Effect.gen(function* () {
      let handler: ((request: Request) => Promise<Response>) | undefined;
      handleMock.mockImplementation((_scheme, nextHandler) => {
        handler = nextHandler;
      });
      netFetchMock
        .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:5733"))
        .mockResolvedValueOnce(new Response("ready"));

      const response = yield* Effect.scoped(
        Effect.gen(function* () {
          const protocol = yield* ElectronProtocol.ElectronProtocol;
          yield* protocol.registerDesktopProtocol({
            scheme: "t3code-dev",
            targetOrigin: new URL("http://127.0.0.1:5733/"),
            backendOrigin: new URL("http://127.0.0.1:3773/"),
            clerkFrontendApiHostname: undefined,
          });
          return yield* Effect.promise(() => handler!(new Request("t3code-dev://app/")));
        }),
      );

      assert.equal(yield* Effect.promise(() => response.text()), "ready");
      assert.equal(netFetchMock.mock.calls.length, 2);
    }).pipe(Effect.provide(ElectronProtocol.layer)),
  );

  it.effect("preserves protocol registration failures", () =>
    Effect.gen(function* () {
      const cause = new Error("protocol registration failed");
      handleMock.mockImplementationOnce(() => {
        throw cause;
      });

      const protocol = yield* ElectronProtocol.ElectronProtocol;
      const error = yield* Effect.scoped(
        protocol.registerDesktopProtocol({
          scheme: "t3code-dev",
          targetOrigin: new URL("http://127.0.0.1:3773/"),
          backendOrigin: new URL("http://127.0.0.1:3774/"),
          clerkFrontendApiHostname: undefined,
        }),
      ).pipe(Effect.flip);

      assert.instanceOf(error, ElectronProtocol.ElectronProtocolRegistrationError);
      assert.equal(error.scheme, "t3code-dev");
      assert.strictEqual(error.cause, cause);
      assert.equal(error.message, 'Failed to register Electron protocol scheme "t3code-dev".');
    }).pipe(Effect.provide(ElectronProtocol.layer)),
  );

  it.effect("preserves protocol unregistration failures", () =>
    Effect.gen(function* () {
      const cause = new Error("protocol unregistration failed");
      unhandleMock.mockImplementationOnce(() => {
        throw cause;
      });

      const protocol = yield* ElectronProtocol.ElectronProtocol;
      const exit = yield* Effect.exit(
        Effect.scoped(
          protocol.registerDesktopProtocol({
            scheme: "t3code",
            targetOrigin: new URL("http://127.0.0.1:3773/"),
            backendOrigin: new URL("http://127.0.0.1:3773/"),
            clerkFrontendApiHostname: undefined,
          }),
        ),
      );

      assert.equal(exit._tag, "Failure");
      if (exit._tag === "Failure") {
        const error = Cause.squash(exit.cause);
        assert.instanceOf(error, ElectronProtocol.ElectronProtocolUnregistrationError);
        assert.equal(error.scheme, "t3code");
        assert.strictEqual(error.cause, cause);
        assert.equal(error.message, 'Failed to unregister Electron protocol scheme "t3code".');
      }
    }).pipe(Effect.provide(ElectronProtocol.layer)),
  );

  it("keeps executable sources host-restricted while allowing runtime network resources", () => {
    const policy = ElectronProtocol.makeDesktopContentSecurityPolicy({
      scheme: "t3code",
      targetOrigin: new URL("http://127.0.0.1:3773/"),
      backendOrigin: new URL("http://127.0.0.1:3773/"),
      clerkFrontendApiHostname: "clerk.t3.codes",
    });
    const directives = Object.fromEntries(
      policy.split("; ").map((directive) => {
        const [name, ...sources] = directive.split(" ");
        return [name, sources];
      }),
    );

    assert.deepEqual(directives["script-src"], [
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      "https://clerk.t3.codes",
      "https://challenges.cloudflare.com",
    ]);
    assert.deepEqual(directives["connect-src"], ["'self'", "http:", "https:", "ws:", "wss:"]);
    assert.deepEqual(directives["img-src"], [
      "'self'",
      "t3code:",
      "blob:",
      "data:",
      "http:",
      "https:",
    ]);
    assert.deepEqual(directives["media-src"], ["'self'", "t3code:", "blob:", "http:", "https:"]);
    assert.deepEqual(directives["font-src"], ["'self'", "t3code:", "data:"]);
  });
});
