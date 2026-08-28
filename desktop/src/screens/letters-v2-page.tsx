import { LettersPage } from "./letters-page";

/**
 * Letters on `/letters-v2` with its own keep-alive surface.
 */
export function LettersV2Page() {
  return (
    <LettersPage
      backHref="/letters-v2"
      breadcrumbItems={[{ label: "Letters", href: "/letters-v2" }]}
    />
  );
}
