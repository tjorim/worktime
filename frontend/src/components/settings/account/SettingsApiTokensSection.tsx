import { Clipboard as ClipboardIcon, Key as KeyIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import {
  SettingsHint,
  SettingsItem,
  SettingsList,
  SettingsLoading,
  SettingsSection,
  SettingsSecret,
} from "@/components/settings/SettingsParts";
import { useToast } from "@/contexts/ToastContext";
import type { ApiToken, CreatedApiToken } from "@/pages/settings/hooks/useSettingsApiTokens";
import { getLocale } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";

function formatTokenDate(iso: string): string {
  return new Intl.DateTimeFormat(getLocale()).format(new Date(iso));
}

interface SettingsApiTokensSectionProps {
  apiTokens: ApiToken[] | null;
  isApiTokensLoading: boolean;
  apiTokensError: string | null;
  isCreatingApiToken: boolean;
  createApiTokenError: string | null;
  createdApiToken: CreatedApiToken | null;
  onDismissCreatedApiToken: () => void;
  onCreateApiToken: (name: string) => void;
  revokingApiTokenId: string | null;
  revokeApiTokenError: string | null;
  onRevokeApiToken: (tokenId: string) => void;
}

export function SettingsApiTokensSection({
  apiTokens,
  isApiTokensLoading,
  apiTokensError,
  isCreatingApiToken,
  createApiTokenError,
  createdApiToken,
  onDismissCreatedApiToken,
  onCreateApiToken,
  revokingApiTokenId,
  revokeApiTokenError,
  onRevokeApiToken,
}: SettingsApiTokensSectionProps) {
  const toast = useToast();
  const [nameDraft, setNameDraft] = useState("");
  const [tokenPendingRevoke, setTokenPendingRevoke] = useState<ApiToken | null>(null);

  const handleGenerate = () => {
    onCreateApiToken(nameDraft);
  };

  // Clear the draft the moment a token is created, as a same-render response
  // to the prop changing rather than a follow-up effect.
  const [prevCreatedApiToken, setPrevCreatedApiToken] = useState(createdApiToken);
  if (createdApiToken !== prevCreatedApiToken) {
    setPrevCreatedApiToken(createdApiToken);
    if (createdApiToken) {
      setNameDraft("");
    }
  }

  const handleCopy = async () => {
    if (!createdApiToken) return;
    try {
      await navigator.clipboard.writeText(createdApiToken.token);
      toast?.showSuccess(m.api_tokens_copied());
    } catch {
      toast?.showError(m.api_tokens_copy_failed());
    }
  };

  return (
    <SettingsSection icon={KeyIcon} title={m.api_tokens_section_title()}>
      <SettingsHint className="tw:mb-3">{m.api_tokens_description()}</SettingsHint>

      {createdApiToken ? (
        <Alert variant="success" className="tw:mb-3 tw:gap-2">
          <div className="tw:font-medium">{m.api_tokens_created_title()}</div>
          <div>{m.api_tokens_created_warning()}</div>
          <div>{m.api_tokens_pebble_guidance()}</div>
          <SettingsSecret>{createdApiToken.token}</SettingsSecret>
          <div className="tw:flex tw:gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
              <Icon icon={ClipboardIcon} />
              {m.api_tokens_copy_btn()}
            </Button>
            <Button size="sm" onClick={onDismissCreatedApiToken}>
              {m.api_tokens_done_btn()}
            </Button>
          </div>
        </Alert>
      ) : null}

      <Field className="tw:mb-3">
        <FieldLabel htmlFor="api-token-name">{m.api_tokens_name_label()}</FieldLabel>
        <div className="tw:flex tw:gap-2">
          <Input
            id="api-token-name"
            type="text"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder={m.api_tokens_name_placeholder()}
            disabled={isCreatingApiToken}
          />
          <Button onClick={handleGenerate} disabled={isCreatingApiToken || nameDraft.trim() === ""}>
            {isCreatingApiToken ? m.api_tokens_generating_btn() : m.api_tokens_generate_btn()}
          </Button>
        </div>
      </Field>

      <div className="tw:flex tw:flex-col tw:gap-2">
        {createApiTokenError ? <Alert variant="destructive">{createApiTokenError}</Alert> : null}
        {revokeApiTokenError ? <Alert variant="destructive">{revokeApiTokenError}</Alert> : null}
        {apiTokensError ? <Alert variant="warning">{apiTokensError}</Alert> : null}
      </div>

      {isApiTokensLoading ? (
        <SettingsLoading>{m.loading()}</SettingsLoading>
      ) : apiTokens && apiTokens.length > 0 ? (
        <SettingsList>
          {apiTokens.map((token) => (
            <SettingsItem
              key={token.id}
              className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-3"
            >
              <div className="tw:min-w-0">
                <div className="tw:font-medium">{token.name}</div>
                <div className="tw:text-sm tw:text-muted-foreground">
                  •••• {token.token_preview} · {m.api_tokens_created_at_label()}{" "}
                  {formatTokenDate(token.created_at)} · {m.api_tokens_last_used_label()}{" "}
                  {token.last_used_at
                    ? formatTokenDate(token.last_used_at)
                    : m.api_tokens_last_used_never()}
                </div>
                <div className="tw:text-sm tw:text-muted-foreground">
                  {m.api_tokens_scopes_label()}: {token.scopes.join(", ")}
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={revokingApiTokenId === token.id}
                onClick={() => setTokenPendingRevoke(token)}
              >
                {revokingApiTokenId === token.id
                  ? m.api_tokens_revoke_busy()
                  : m.api_tokens_revoke_btn()}
              </Button>
            </SettingsItem>
          ))}
        </SettingsList>
      ) : (
        <SettingsHint>{m.api_tokens_empty()}</SettingsHint>
      )}
      <ConfirmationDialog
        isOpen={tokenPendingRevoke !== null}
        title={m.api_tokens_revoke_confirm_title()}
        message={m.api_tokens_revoke_confirm_message({ name: tokenPendingRevoke?.name ?? "" })}
        confirmLabel={m.api_tokens_revoke_btn()}
        cancelLabel={m.cancel()}
        onConfirm={() => {
          if (tokenPendingRevoke) {
            onRevokeApiToken(tokenPendingRevoke.id);
          }
          setTokenPendingRevoke(null);
        }}
        onCancel={() => setTokenPendingRevoke(null)}
        variant="danger"
        icon={KeyIcon}
      />
    </SettingsSection>
  );
}
