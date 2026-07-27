import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const apiOrigin = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8787"
).replace(/\/$/, "");

/** Same-origin probe — avoids CORS to service.backsteros.com from localhost. */
export async function GET(req: NextRequest) {
  const target = new URL(`${apiOrigin}/health`);
  req.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
    });
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
