import { SectionHeading } from "../../../components/ui";
import { ApiTokensClient } from "../../../components/api-tokens-client";
import { getRequestMessages } from "../../../lib/locale";
import { requireCurrentUser } from "../../../lib/session";

export default async function ApiTokensPage() {
  const { messages } = await getRequestMessages();
  const currentUser = await requireCurrentUser();

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={messages.settings.apiTokensEyebrow}
        title={messages.settings.apiTokensTitle}
        description={messages.settings.apiTokensDescription}
      />
      <ApiTokensClient
        userId={currentUser._id}
        labels={{
          createToken: messages.settings.createToken,
          tokenName: messages.settings.tokenName,
          tokenNamePlaceholder: messages.settings.tokenNamePlaceholder,
          revokeToken: messages.settings.revokeToken,
          tokenCreated: messages.settings.tokenCreated,
          copyToken: messages.settings.copyToken,
          copied: messages.settings.copied,
          closeDialog: messages.settings.closeDialog,
          noTokens: messages.settings.noTokens,
          noTokensDescription: messages.settings.noTokensDescription,
          tokenPrefix: messages.settings.tokenPrefix,
          tokenCreatedAt: messages.settings.tokenCreatedAt,
          tokenLastUsed: messages.settings.tokenLastUsed,
          tokenNeverUsed: messages.settings.tokenNeverUsed,
          tokenRevoked: messages.settings.tokenRevoked,
          revokeConfirm: messages.settings.revokeConfirm,
          createTokenFailed: messages.settings.createTokenFailed
        }}
      />
    </div>
  );
}
