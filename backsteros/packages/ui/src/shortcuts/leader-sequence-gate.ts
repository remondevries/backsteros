import { isPersonalAssistantDoubleAPending } from "../chat/personal-assistant-double-a.js";
import { isFinanceLeaderSequencePending } from "../finance/finance-leader-sequence-gate.js";
import { isGoLeaderSequencePending } from "./go-leader-sequence-gate.js";

/** True while a G…, F… (finance), or A… (personal assistant double-tap) chord awaits its next key. */
export function isAnyLeaderSequencePending(): boolean {
  return (
    isGoLeaderSequencePending() ||
    isFinanceLeaderSequencePending() ||
    isPersonalAssistantDoubleAPending()
  );
}
