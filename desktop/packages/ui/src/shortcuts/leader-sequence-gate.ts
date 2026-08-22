import { isFinanceLeaderSequencePending } from "../finance/finance-leader-sequence-gate.js";
import { isGoLeaderSequencePending } from "./go-leader-sequence-gate.js";

/** True while a G… or F… (finance) leader chord is awaiting its second key. */
export function isAnyLeaderSequencePending(): boolean {
  return isGoLeaderSequencePending() || isFinanceLeaderSequencePending();
}
