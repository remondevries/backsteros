import { LettersPage } from "./letters-page";

/**
 * TEMP Letters v2 bisect: same content on `/letters-v2`, own keep-alive.
 */
export function LettersV2Page() {
  return (
    <LettersPage
      backHref="/letters-v2"
      breadcrumbItems={[{ label: "Letters", href: "/letters-v2" }]}
    />
  );
}
