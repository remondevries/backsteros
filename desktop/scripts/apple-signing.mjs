/**
 * Resolve macOS Developer ID / notarization settings from env.
 * Secrets stay in the environment or ~/.config/secrets — never in git.
 */

export const APPLE_SIGNING_ENV_FILES = [
  "~/.config/secrets/apple-developer.env",
  "~/.config/backsteros/apple-signing.env",
];

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseDotEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * File values fill gaps only. Process env always wins.
 * @param {Record<string, string | undefined>} existing
 * @param {Array<{ path: string, text: string | null }>} fileContents
 * @returns {Record<string, string>}
 */
export function mergeEnvFromFiles(existing, fileContents) {
  /** @type {Record<string, string>} */
  const merged = {};
  for (const [key, value] of Object.entries(existing)) {
    if (typeof value === "string" && value.length > 0) merged[key] = value;
  }
  for (const file of fileContents) {
    if (file.text == null) continue;
    const parsed = parseDotEnv(file.text);
    for (const [key, value] of Object.entries(parsed)) {
      if (merged[key] == null || merged[key] === "") merged[key] = value;
    }
  }
  return merged;
}

/**
 * @param {string} identity
 */
function isDeveloperIdApplication(identity) {
  return /Developer ID Application\s*:/i.test(identity);
}

/**
 * @param {string} identity
 */
function isAppleDevelopment(identity) {
  return /Apple Development\s*:/i.test(identity);
}

/**
 * @param {Record<string, string>} env
 */
function hasNotarizationApiKey(env) {
  return Boolean(env.APPLE_API_ISSUER?.trim() && env.APPLE_API_KEY?.trim());
}

/**
 * @param {Record<string, string>} env
 */
function hasNotarizationAppleId(env) {
  return Boolean(
    env.APPLE_ID?.trim() && env.APPLE_PASSWORD?.trim() && env.APPLE_TEAM_ID?.trim(),
  );
}

/**
 * @param {Record<string, string>} env
 */
export function resolveAppleSigning(env) {
  /** @type {string[]} */
  const notes = [];
  /** @type {string[]} */
  const errors = [];
  const rawIdentity = env.APPLE_SIGNING_IDENTITY?.trim() || "";
  const signingIdentity = rawIdentity.length > 0 ? rawIdentity : null;

  /** @type {"none" | "api-key" | "apple-id"} */
  let notarization = "none";
  if (hasNotarizationApiKey(env)) {
    notarization = "api-key";
    if (!env.APPLE_API_KEY_PATH?.trim() && !env.APPLE_API_KEY_BASE64?.trim()) {
      notes.push(
        "APPLE_API_KEY is set; Tauri will look for AuthKey_<id>.p8 under ./private_keys, ~/private_keys, ~/.private_keys, or ~/.appstoreconnect/private_keys unless APPLE_API_KEY_PATH is set.",
      );
    }
  } else if (hasNotarizationAppleId(env)) {
    notarization = "apple-id";
  } else if (env.APPLE_ID?.trim() || env.APPLE_API_KEY?.trim() || env.APPLE_API_ISSUER?.trim()) {
    errors.push(
      "Notarization env is incomplete. Use APPLE_API_ISSUER + APPLE_API_KEY (+ APPLE_API_KEY_PATH) or APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID.",
    );
  }

  if (!signingIdentity || signingIdentity === "-") {
    notes.push(
      "No Developer ID identity (APPLE_SIGNING_IDENTITY unset or '-'); macOS builds stay ad-hoc and will not notarize.",
    );
    if (notarization !== "none") {
      errors.push(
        "Notarization credentials are set but APPLE_SIGNING_IDENTITY is missing. Issue a Developer ID Application certificate first.",
      );
    }
    return {
      signingIdentity: signingIdentity === "-" ? "-" : null,
      notarization: signingIdentity === "-" ? "none" : notarization,
      distributionReady: false,
      notes,
      errors,
    };
  }

  if (isAppleDevelopment(signingIdentity)) {
    errors.push(
      "APPLE_SIGNING_IDENTITY is an Apple Development certificate. That cannot notarize. Use a Developer ID Application identity.",
    );
    return { signingIdentity, notarization, distributionReady: false, notes, errors };
  }

  if (!isDeveloperIdApplication(signingIdentity)) {
    errors.push(
      "APPLE_SIGNING_IDENTITY must be a 'Developer ID Application: …' identity for Gatekeeper distribution.",
    );
    return { signingIdentity, notarization, distributionReady: false, notes, errors };
  }

  const distributionReady = notarization !== "none";
  if (!distributionReady) {
    notes.push(
      "Developer ID identity is set; add App Store Connect API key or Apple ID notarization env to notarize.",
    );
  }

  return { signingIdentity, notarization, distributionReady, notes, errors };
}

/**
 * @param {Record<string, string>} env
 * @returns {string[]}
 */
export function redactedEnvSummary(env) {
  const keys = [
    "APPLE_SIGNING_IDENTITY",
    "APPLE_TEAM_ID",
    "APPLE_API_ISSUER",
    "APPLE_API_KEY",
    "APPLE_API_KEY_PATH",
    "APPLE_ID",
  ];
  return keys
    .filter((key) => env[key]?.trim())
    .map((key) => `${key}=${env[key].trim()}`);
}
