import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { isE2eAuthBypassEnabled } from "@/lib/e2e-bypass-auth";
import { validateServerEnvironment } from "@/lib/env";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/api/health"]);

const authenticatedProxy = clerkMiddleware(async (auth, request) => {
  validateServerEnvironment();
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export default isE2eAuthBypassEnabled()
  ? () => NextResponse.next()
  : authenticatedProxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
