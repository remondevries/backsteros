import { NAV_RETURN_TO_PARAM } from "./constants";
import { buildCurrentLocationHref, isValidInternalPath } from "./path-utils";

export function appendReturnTo(href: string, returnTo: string): string {
  if (!returnTo || !isValidInternalPath(returnTo)) {
    return href;
  }

  const [base, existingQuery = ""] = href.split("?");
  const params = new URLSearchParams(existingQuery);
  params.set(NAV_RETURN_TO_PARAM, returnTo);
  const query = params.toString();

  return query ? `${base}?${query}` : base!;
}

export function stripReturnToParam(
  searchParams: Pick<URLSearchParams, "toString" | "delete">,
): URLSearchParams {
  const params = new URLSearchParams(searchParams.toString());
  params.delete(NAV_RETURN_TO_PARAM);
  return params;
}

export function getReturnToHref(
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  const value = searchParams.get(NAV_RETURN_TO_PARAM)?.trim();
  if (!value || !isValidInternalPath(value)) {
    return null;
  }

  return value;
}

export function getCurrentLocationForReturnTo(
  pathname: string,
  searchParams: Pick<URLSearchParams, "toString" | "delete">,
): string {
  return buildCurrentLocationHref(pathname, stripReturnToParam(searchParams));
}
