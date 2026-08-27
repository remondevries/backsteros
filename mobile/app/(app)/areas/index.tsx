import { Redirect } from "expo-router";

/** Areas now live on Projects (same list, All / Personal / Business / Clients). */
export default function AreasRedirect() {
  return <Redirect href="/projects" />;
}
