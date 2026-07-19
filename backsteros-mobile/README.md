# backsteros-mobile

Expo + Expo Router product client (Phase 4).

**Status:** Clerk sign-in, Inbox + Tasks with PowerSync and offline status edits.
Falls back to REST when sync is unavailable. Document open-on-demand is next.

## SQLite adapters

| Environment | Adapter |
| --- | --- |
| Expo Go (`executionEnvironment === "storeClient"`) | `@powersync/adapter-sql-js` (JS only) |
| Dev client / production (`expo run:*`, EAS) | `@journeyapps/react-native-quick-sqlite` (native) |

```bash
# Expo Go (SQL.js)
pnpm --filter @backsteros/mobile start

# Native SQLite (requires Xcode / Android SDK once)
pnpm --filter @backsteros/mobile prebuild
pnpm --filter @backsteros/mobile ios      # or android
```

## Develop

```bash
cp backsteros-mobile/.env.example backsteros-mobile/.env
# Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY (+ LAN API URL for devices)
pnpm install
pnpm --filter @backsteros/mobile start
```

Requires a running API with PowerSync credentials (`GET /api/v1/powersync/token`).

No demo fixtures when signed out or when the Clerk key is missing.

Specs: [`../docs/05-clients.md`](../docs/05-clients.md), Phase 4 in
[`../docs/09-phased-build-plan.md`](../docs/09-phased-build-plan.md).
