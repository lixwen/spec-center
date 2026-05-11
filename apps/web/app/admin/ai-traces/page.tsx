import { TabbedDashboard } from "./tabbed-dashboard";
import { getRequestMessages } from "../../../lib/locale";
import { requirePlatformAdmin } from "../../../lib/session";

export default async function AdminAiTracesPage() {
  const { messages } = await getRequestMessages();
  await requirePlatformAdmin();

  return (
    <TabbedDashboard
      tracesLabels={messages.aiTracesAdmin}
      evalLabels={messages.evalAdmin}
      totalSuffix={messages.common.totalSuffix}
      workingLabel={messages.common.working}
    />
  );
}
