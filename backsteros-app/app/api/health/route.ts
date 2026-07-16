export function GET() {
  return Response.json({
    status: "ok",
    service: "backsteros-app",
    timestamp: new Date().toISOString(),
  });
}
