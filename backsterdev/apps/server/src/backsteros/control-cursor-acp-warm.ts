/**
 * BacksterDEV control entry for the Cursor ACP warm pool (BDV-64 / BDV-65).
 *
 * Implementation lives in `@t3tools/provider-acp/server/AcpWarmProcessPool` so
 * real Cursor ACP sessions can {@link takeCursorAcpWarmProcess} and skip
 * spawn+initialize+sign-in. This module keeps the control-facing names.
 */
export {
  ensureAcpWarmProcessPool as ensureCursorAcpWarmPool,
  kickAcpWarmProcessPool as kickCursorAcpWarmPool,
  resetAcpWarmProcessPoolForTests as resetCursorAcpWarmPoolForTests,
  resolveAcpWarmProcessPoolConfig as resolveCursorAcpWarmConfig,
  setAcpWarmProcessPoolTestOverrides as setCursorAcpWarmPoolTestOverrides,
  shutdownAcpWarmProcessPool as shutdownCursorAcpWarmPool,
  takeAcpWarmProcess as takeCursorAcpWarmProcess,
  type AcpWarmSlot as CursorAcpWarmSlot,
} from "@t3tools/provider-acp/server/AcpWarmProcessPool";
