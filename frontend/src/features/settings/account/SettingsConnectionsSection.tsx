import { SettingsApiTokensSection } from "@/features/settings/account/SettingsApiTokensSection";
import { SettingsCalendarFeedSection } from "@/features/settings/account/SettingsCalendarFeedSection";
import { SettingsIntegrationClientsSection } from "@/features/settings/account/SettingsIntegrationClientsSection";
import { useSettingsApiTokens } from "@/features/settings/hooks/useSettingsApiTokens";
import { useSettingsIntegrationClients } from "@/features/settings/hooks/useSettingsIntegrationClients";

export function SettingsConnectionsSection({
  isAdmin,
  userId,
  fetchFn,
}: {
  isAdmin: boolean;
  userId: string | null;
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
}) {
  const {
    retryApiTokens,
    apiTokens,
    isApiTokensLoading,
    apiTokensError,
    isCreatingApiToken,
    createApiTokenError,
    createdApiToken,
    dismissCreatedApiToken,
    handleCreateApiToken,
    revokingApiTokenId,
    revokeApiTokenError,
    handleRevokeApiToken,
  } = useSettingsApiTokens({
    isAuthenticated: true,
    fetchFn,
  });
  const integrationClients = useSettingsIntegrationClients({
    isAuthenticated: true,
    accountIdentity: userId,
    fetchFn,
  });
  return (
    <>
      <SettingsApiTokensSection
        onRetry={retryApiTokens}
        apiTokens={apiTokens}
        isApiTokensLoading={isApiTokensLoading}
        apiTokensError={apiTokensError}
        isCreatingApiToken={isCreatingApiToken}
        createApiTokenError={createApiTokenError}
        createdApiToken={createdApiToken}
        onDismissCreatedApiToken={dismissCreatedApiToken}
        onCreateApiToken={handleCreateApiToken}
        revokingApiTokenId={revokingApiTokenId}
        revokeApiTokenError={revokeApiTokenError}
        onRevokeApiToken={handleRevokeApiToken}
      />
      <SettingsCalendarFeedSection fetchFn={fetchFn} />
      <SettingsIntegrationClientsSection
        onRetry={integrationClients.loadFailed ? integrationClients.retry : undefined}
        clients={integrationClients.clients}
        isLoading={integrationClients.isLoading}
        error={integrationClients.error}
        isCreating={integrationClients.isCreating}
        createdClient={integrationClients.createdClient}
        busyClientId={integrationClients.busyClientId}
        isAdmin={isAdmin}
        onDismissCreatedClient={integrationClients.dismissCreatedClient}
        onCreateClient={integrationClients.createClient}
        onRotateClient={integrationClients.rotateClient}
        onRevokeClient={integrationClients.revokeClient}
      />
    </>
  );
}
