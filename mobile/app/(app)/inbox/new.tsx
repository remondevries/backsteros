import { InboxCreateTaskScreen } from "../../../components/inbox-create-task-screen";
import { isPadDevice } from "../../../lib/device";
import { PadContentFrame } from "../../../lib/pad-side-panel-collapse";

export default function InboxCreateTaskRoute() {
  if (isPadDevice()) {
    return (
      <PadContentFrame>
        <InboxCreateTaskScreen />
      </PadContentFrame>
    );
  }
  return <InboxCreateTaskScreen />;
}
