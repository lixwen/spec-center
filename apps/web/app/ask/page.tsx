import { NoProjectAccess } from "../../components/no-project-access";
import { AskClient } from "../../components/ask-client";
import { SectionHeading } from "../../components/ui";
import { getRequestMessages } from "../../lib/locale";
import { getProjectContext } from "../../lib/project";
import { requireCurrentUser } from "../../lib/session";

export default async function AskPage() {
  const { messages } = await getRequestMessages();
  const currentUser = await requireCurrentUser();
  const { activeProject } = await getProjectContext(currentUser);

  if (!activeProject) {
    return <NoProjectAccess messages={messages.noProject} />;
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow={messages.ask.eyebrow}
        title={messages.ask.title}
        description={messages.ask.description}
      />
      <AskClient projectId={activeProject._id} messages={messages.ask} />
    </div>
  );
}
