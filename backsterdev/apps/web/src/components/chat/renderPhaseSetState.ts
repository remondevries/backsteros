/**
 * Guards setState-during-render sites. React aborts with a generic
 * "Too many re-renders" once the nested update limit is hit; this throws earlier
 * with the site label so the draft-route loop is identifiable in Dig's console.
 */
let renderPhaseSetStateCount = 0;
let lastRenderPhaseSetStateSite = "";
let chatViewRenderBurst = 0;
let chatViewCheckpoint = "start";
let chatViewRouteLabel = "";

export function noteRenderPhaseSetState(site: string): void {
  renderPhaseSetStateCount += 1;
  lastRenderPhaseSetStateSite = site;
  if (renderPhaseSetStateCount > 25) {
    const message = `ChatView render loop at: ${site} (n=${renderPhaseSetStateCount}, last=${lastRenderPhaseSetStateSite})`;
    renderPhaseSetStateCount = 0;
    throw new Error(message);
  }
}

export function noteChatViewCheckpoint(checkpoint: string): void {
  chatViewCheckpoint = checkpoint;
}

export function noteChatViewRender(label = ""): void {
  // Previous render's farthest checkpoint — setState-during-render restarts
  // before this render's checkpoints run.
  const previousCheckpoint = chatViewCheckpoint;
  chatViewRouteLabel = label;
  chatViewCheckpoint = "start";
  chatViewRenderBurst += 1;
  if (chatViewRenderBurst > 40) {
    const last = lastRenderPhaseSetStateSite || "(no noted setState site)";
    const where = label ? ` route=${label}` : "";
    chatViewRenderBurst = 0;
    throw new Error(
      `ChatView render storm (n>40); prevCheckpoint=${previousCheckpoint}; last noted setState site: ${last}${where}`,
    );
  }
}

export function resetRenderPhaseSetStateCount(): void {
  renderPhaseSetStateCount = 0;
  chatViewRenderBurst = 0;
  chatViewCheckpoint = "start";
}

export function getLastRenderPhaseSetStateSite(): string {
  return lastRenderPhaseSetStateSite;
}
