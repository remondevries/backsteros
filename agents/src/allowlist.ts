export type RouteRule = {
  methods: readonly string[];
  pattern: RegExp;
};

/**
 * Explicit allowlist for agent-facing REST routes.
 * Everything under /api/v1 that is not matched is rejected before proxying.
 */
export const ALLOWED_ROUTES: RouteRule[] = [
  { methods: ["GET"], pattern: /^\/api\/v1\/openapi\.json$/ },
  { methods: ["GET"], pattern: /^\/api\/v1\/search$/ },
  { methods: ["GET"], pattern: /^\/api\/v1\/global-search$/ },

  { methods: ["GET"], pattern: /^\/api\/v1\/projects$/ },
  { methods: ["GET"], pattern: /^\/api\/v1\/projects\/[^/]+$/ },
  { methods: ["GET"], pattern: /^\/api\/v1\/projects\/[^/]+\/relations$/ },

  { methods: ["GET"], pattern: /^\/api\/v1\/tasks$/ },
  { methods: ["GET"], pattern: /^\/api\/v1\/tasks\/due$/ },
  { methods: ["GET"], pattern: /^\/api\/v1\/tasks\/inbox$/ },
  { methods: ["POST"], pattern: /^\/api\/v1\/tasks\/batch$/ },
  { methods: ["POST"], pattern: /^\/api\/v1\/tasks\/reorder$/ },
  { methods: ["GET", "POST", "PATCH", "DELETE"], pattern: /^\/api\/v1\/tasks\/[^/]+$/ },
  { methods: ["GET"], pattern: /^\/api\/v1\/tasks\/[^/]+\/relations$/ },
  { methods: ["GET", "POST"], pattern: /^\/api\/v1\/tasks\/[^/]+\/comments$/ },
  {
    methods: ["PATCH", "DELETE"],
    pattern: /^\/api\/v1\/tasks\/[^/]+\/comments\/[^/]+$/,
  },
  { methods: ["GET", "POST"], pattern: /^\/api\/v1\/tasks\/[^/]+\/activities$/ },
  { methods: ["POST"], pattern: /^\/api\/v1\/tasks\/[^/]+\/move$/ },
  { methods: ["POST"], pattern: /^\/api\/v1\/tasks\/[^/]+\/triage$/ },

  { methods: ["GET"], pattern: /^\/api\/v1\/documents$/ },
  { methods: ["POST"], pattern: /^\/api\/v1\/documents$/ },
  { methods: ["POST"], pattern: /^\/api\/v1\/documents\/reorder$/ },
  { methods: ["GET", "PATCH", "DELETE"], pattern: /^\/api\/v1\/documents\/[^/]+$/ },
  {
    methods: ["GET", "PATCH"],
    pattern: /^\/api\/v1\/documents\/[^/]+\/content$/,
  },
  { methods: ["POST"], pattern: /^\/api\/v1\/documents\/[^/]+\/move$/ },

  { methods: ["GET"], pattern: /^\/api\/v1\/letters$/ },
  { methods: ["GET"], pattern: /^\/api\/v1\/letters\/inbox$/ },
  { methods: ["POST"], pattern: /^\/api\/v1\/letters$/ },
  { methods: ["GET", "PATCH", "DELETE"], pattern: /^\/api\/v1\/letters\/[^/]+$/ },
  { methods: ["GET"], pattern: /^\/api\/v1\/letters\/[^/]+\/relations$/ },
  { methods: ["POST"], pattern: /^\/api\/v1\/letters\/[^/]+\/triage$/ },
];

/** Hard blocks even if a broad pattern would otherwise match. */
export const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /^\/api\/v1\/sync(?:\/|$)/,
  /^\/api\/v1\/powersync(?:\/|$)/,
  /^\/api\/v1\/ops(?:\/|$)/,
  /^\/api\/v1\/agent-pty(?:\/|$)/,
  /^\/api\/v1\/letters\/[^/]+\/pdf$/,
  /^\/api\/v1\/letters\/[^/]+\/attachments(?:\/|$)/,
  /^\/api\/v1\/tasks\/[^/]+\/images(?:\/|$)/,
  /^\/api\/v1\/projects\/[^/]+\/(?:fs|github|ensure-vault)(?:\/|$)/,
  /^\/api\/v1\/(?:finance|bank-accounts|transactions|financial-|settings|github|avatars|whoop|ai|api-keys|organizations|contacts|areas|journal|mentions)(?:\/|$)/,
];

export function isRouteAllowed(method: string, pathname: string): boolean {
  const normalizedMethod = method.toUpperCase();

  if (BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return false;
  }

  return ALLOWED_ROUTES.some(
    (rule) =>
      rule.methods.includes(normalizedMethod) && rule.pattern.test(pathname),
  );
}
