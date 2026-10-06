export function isLiveBacksterosDatabaseUrl(databaseUrl: string): boolean {
  try {
    const parsed = new URL(databaseUrl.replace(/^postgres(ql)?:\/\//, "http://"));
    const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "");
    return name === "backsteros";
  } catch {
    return /\/backsteros(\?|$)/.test(databaseUrl) && !/backsteros_test/.test(databaseUrl);
  }
}
