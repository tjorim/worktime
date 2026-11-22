import { SettingsApiTokensSection } from "@/features/settings/account/SettingsApiTokensSection";
import { SettingsCalendarFeedSection } from "@/features/settings/account/SettingsCalendarFeedSection";
import { SettingsIntegrationClientsSection } from "@/features/settings/account/SettingsIntegrationClientsSection";
import type { useSettingsApiTokens } from "@/features/settings/hooks/useSettingsApiTokens";
import type { useSettingsIntegrationClients } from "@/features/settings/hooks/useSettingsIntegrationClients";

export function SettingsConnectionsSection({
  isAdmin,
  apiTokenSettings,
  integrationClients,
  fetchFn,
}: {
  isAdmin: boolean;
  apiTokenSettings: ReturnType<typeof useSettingsApiTokens>;
  integrationClients: ReturnType<typeof useSettingsIntegrationClients>;
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
  } = apiTokenSettings;
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
