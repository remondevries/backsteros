import {
  MOBILE_FINANCE_SECTION_IDS,
  type MobileFinanceSectionId,
} from "./finance-sections";

/** Survives list remounts after opening account/category detail on phone. */
let rememberedSection: MobileFinanceSectionId = "dashboard";

export function rememberFinanceSection(section: MobileFinanceSectionId): void {
  rememberedSection = section;
}

export function getRememberedFinanceSection(): MobileFinanceSectionId {
  return rememberedSection;
}

export function isMobileFinanceSectionId(
  value: string,
): value is MobileFinanceSectionId {
  return (MOBILE_FINANCE_SECTION_IDS as readonly string[]).includes(value);
}
