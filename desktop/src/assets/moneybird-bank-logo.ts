import moneybirdBankLogoSvg from "./moneybird-bank-logo.svg?raw";

/** Default avatar file for Moneybird-linked bank accounts. */
export function createMoneybirdBankLogoFile(): File {
  const blob = new Blob([moneybirdBankLogoSvg], { type: "image/svg+xml" });
  return new File([blob], "moneybird-bank-logo.svg", {
    type: "image/svg+xml",
  });
}
