import { useLayoutEffect, useState } from "react";

export function useComposerMenuState(hidden = false) {
  const [open, setOpen] = useState(false);
  // Base UI does not notify us when we close it by changing its open prop.
  // Reset the stored state too, so revealing the trigger cannot reopen it.
  useLayoutEffect(() => {
    if (hidden && open) setOpen(false);
  }, [hidden, open]);
  return [open && !hidden, setOpen] as const;
}
