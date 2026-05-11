import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TabbedDashboard } from "./tabbed-dashboard";
import { getRequestMessages } from "../../../lib/locale";
import { requirePlatformAdmin } from "../../../lib/session";

async function loadGuideMarkdown(): Promise<string> {
  try {
    const candidates = [
      join(process.cwd(), "docs", "agent-evaluation.md"),
      join(process.cwd(), "..", "..", "docs", "agent-evaluation.md")
    ];
    for (const p of candidates) {
      try {
        return await readFile(p, "utf-8");
      } catch { /* try next */ }
    }
    return "";
  } catch {
    return "";
  }
}

export default async function AdminAiTracesPage() {
  const { messages } = await getRequestMessages();
  await requirePlatformAdmin();
  const guideMarkdown = await loadGuideMarkdown();

  return (
    <TabbedDashboard
      tracesLabels={messages.aiTracesAdmin}
      evalLabels={messages.evalAdmin}
      totalSuffix={messages.common.totalSuffix}
      workingLabel={messages.common.working}
      guideMarkdown={guideMarkdown}
    />
  );
}
