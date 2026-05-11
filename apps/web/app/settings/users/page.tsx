import { listProjectCatalog, listUsers } from "@spec-center/core";
import { UserManagementClient } from "../../../components/user-management-client";
import { SectionHeading } from "../../../components/ui";
import { getRequestMessages } from "../../../lib/locale";
import { requirePlatformAdmin } from "../../../lib/session";

export default async function UserSettingsPage() {
  const { messages } = await getRequestMessages();
  const currentUser = await requirePlatformAdmin();
  const [users, projects] = await Promise.all([
    listUsers(),
    listProjectCatalog(currentUser)
  ]);

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={messages.settings.usersEyebrow}
        title={messages.settings.usersTitle}
        description={messages.settings.usersDescription}
      />
      <UserManagementClient
        users={users}
        projects={projects.map((project) => ({ _id: project._id, name: project.name }))}
        labels={{
          createUser: messages.settings.createUser,
          saveUser: messages.settings.saveUser,
          userUsername: messages.settings.userUsername,
          userEmail: messages.settings.userEmail,
          userDisplayName: messages.settings.userDisplayName,
          userPassword: messages.settings.userPassword,
          userStatus: messages.settings.userStatus,
          platformAdmin: messages.settings.platformAdmin,
          memberships: messages.settings.memberships,
          addMembership: messages.settings.addMembership,
          removeMembership: messages.settings.removeMembership,
          userSaveFailed: messages.settings.userSaveFailed,
          userCreated: messages.settings.userCreated,
          userSaved: messages.settings.userSaved,
          usersCount: messages.settings.usersCount,
          cancel: messages.settings.cancel,
          passwordOptionalHint: messages.settings.passwordOptionalHint,
          validationUsernameRequired: messages.settings.validationUsernameRequired,
          validationEmailRequired: messages.settings.validationEmailRequired,
          validationNameRequired: messages.settings.validationNameRequired,
          validationPasswordMin: messages.settings.validationPasswordMin
        }}
      />
    </div>
  );
}
