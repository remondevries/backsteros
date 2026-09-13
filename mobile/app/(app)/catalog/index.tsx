import { Redirect } from "expo-router";

/** Catalog lives on desktop; mobile routes Catalog to Projects for now. */
export default function CatalogRedirect() {
  return <Redirect href="/projects" />;
}
