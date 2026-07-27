import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const apiOrigin = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8787"
).replace(/\/$/, "");

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyRequest(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const target = new URL(`${apiOrigin}/api/v1/${path.map(encodeURIComponent).join("/")}`);
  req.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });

  const headers = new Headers();
  const authorization = req.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", req.headers.get("accept") ?? "application/json");

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upstream request failed";
    return NextResponse.json(
      { error: message, code: "proxy_upstream_error" },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) {
    responseHeaders.set("content-type", upstreamContentType);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export function GET(req: NextRequest, context: RouteContext) {
  return proxyRequest(req, context);
}

export function POST(req: NextRequest, context: RouteContext) {
  return proxyRequest(req, context);
}

export function PUT(req: NextRequest, context: RouteContext) {
  return proxyRequest(req, context);
}

export function PATCH(req: NextRequest, context: RouteContext) {
  return proxyRequest(req, context);
}

export function DELETE(req: NextRequest, context: RouteContext) {
  return proxyRequest(req, context);
}
