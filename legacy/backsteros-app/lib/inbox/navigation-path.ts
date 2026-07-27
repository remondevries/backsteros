export function isInboxTaskDetailPath(pathname: string): boolean {
  return /^\/inbox\/[^/]+$/.test(pathname);
}
