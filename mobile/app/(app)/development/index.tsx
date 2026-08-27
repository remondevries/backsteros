import { Redirect } from "expo-router";

/** Codebase projects live on Projects — no separate Development section on iOS. */
export default function DevelopmentRedirect() {
  return <Redirect href="/projects" />;
}
