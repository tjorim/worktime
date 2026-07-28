import { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
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

  useEffect(() => {
    if (createdApiToken) {
      setNameDraft("");
    }
  }, [createdApiToken]);

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
    <div>
      <div className="p-3">
        <h6 className="text-muted mb-3">
          <i className="bi bi-key me-2"></i>
          {m.api_tokens_section_title()}
        </h6>
        <p className="text-muted small mb-3">{m.api_tokens_description()}</p>

        {createdApiToken ? (
          <Alert variant="success" className="d-flex flex-column gap-2">
            <div className="fw-medium">{m.api_tokens_created_title()}</div>
            <div className="small">{m.api_tokens_created_warning()}</div>
            <div className="small">{m.api_tokens_pebble_guidance()}</div>
            <code className="user-select-all d-block p-2 bg-body-secondary rounded text-break">
              {createdApiToken.token}
            </code>
            <div className="d-flex gap-2">
              <Button variant="outline-success" size="sm" onClick={() => void handleCopy()}>
                <i className="bi bi-clipboard me-1"></i>
                {m.api_tokens_copy_btn()}
              </Button>
              <Button variant="success" size="sm" onClick={onDismissCreatedApiToken}>
                {m.api_tokens_done_btn()}
              </Button>
            </div>
          </Alert>
        ) : null}

        <Form.Group className="mb-3" controlId="api-token-name">
          <Form.Label className="fw-medium mb-1">{m.api_tokens_name_label()}</Form.Label>
          <div className="d-flex gap-2">
            <Form.Control
              size="sm"
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder={m.api_tokens_name_placeholder()}
              disabled={isCreatingApiToken}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerate}
              disabled={isCreatingApiToken || nameDraft.trim() === ""}
            >
              {isCreatingApiToken ? m.api_tokens_generating_btn() : m.api_tokens_generate_btn()}
            </Button>
          </div>
        </Form.Group>

        {createApiTokenError ? (
          <Alert variant="danger" className="py-2">
            {createApiTokenError}
          </Alert>
        ) : null}
        {revokeApiTokenError ? (
          <Alert variant="danger" className="py-2">
            {revokeApiTokenError}
          </Alert>
        ) : null}
        {apiTokensError ? (
          <Alert variant="warning" className="py-2">
            {apiTokensError}
          </Alert>
        ) : null}

        {isApiTokensLoading ? (
          <div className="d-flex align-items-center gap-2 text-muted small">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <span>{m.loading()}</span>
          </div>
        ) : apiTokens && apiTokens.length > 0 ? (
          <ListGroup variant="flush">
            {apiTokens.map((token) => (
              <ListGroup.Item key={token.id} className="px-0">
                <div className="d-flex justify-content-between align-items-start gap-3">
                  <div>
                    <div className="fw-medium">{token.name}</div>
                    <div className="text-muted small">
                      •••• {token.token_preview} · {m.api_tokens_created_at_label()}{" "}
                      {formatTokenDate(token.created_at)} · {m.api_tokens_last_used_label()}{" "}
                      {token.last_used_at ? formatTokenDate(token.last_used_at) : m.api_tokens_last_used_never()}
                    </div>
                    <div className="text-muted small">
                      {m.api_tokens_scopes_label()}: {token.scopes.join(", ")}
                    </div>
                  </div>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    disabled={revokingApiTokenId === token.id}
                    onClick={() => setTokenPendingRevoke(token)}
                  >
                    {revokingApiTokenId === token.id ? m.api_tokens_revoke_busy() : m.api_tokens_revoke_btn()}
                  </Button>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        ) : (
          <p className="text-muted small mb-0">{m.api_tokens_empty()}</p>
        )}
      </div>
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
        icon="bi-key"
      />
    </div>
  );
}
