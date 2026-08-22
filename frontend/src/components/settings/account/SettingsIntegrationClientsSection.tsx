import { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { useToast } from "@/contexts/ToastContext";
import type { CreatedIntegrationClient, IntegrationClient, IntegrationClientScope } from "@/pages/settings/hooks/useSettingsIntegrationClients";
import { getLocale } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";

const formatDate = (iso: string) => new Intl.DateTimeFormat(getLocale()).format(new Date(iso));

interface Props {
  clients: IntegrationClient[] | null;
  isLoading: boolean;
  error: string | null;
  isCreating: boolean;
  createdClient: CreatedIntegrationClient | null;
  busyClientId: number | null;
  isAdmin: boolean;
  onDismissCreatedClient: () => void;
  onCreateClient: (name: string, scopes: IntegrationClientScope[]) => void;
  onRotateClient: (id: number) => void;
  onRevokeClient: (id: number) => void;
}

export function SettingsIntegrationClientsSection(props: Props) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [adminScope, setAdminScope] = useState(false);
  const [confirmation, setConfirmation] = useState<{ action: "rotate" | "revoke"; client: IntegrationClient } | null>(null);
  const mutationInFlight = props.isCreating || props.busyClientId !== null;

  useEffect(() => {
    if (props.createdClient) {
      setName("");
      setAdminScope(false);
    }
  }, [props.createdClient]);

  const copyKey = async () => {
    if (!props.createdClient) return;
    try {
      await navigator.clipboard.writeText(props.createdClient.key);
      toast?.showSuccess(m.integration_clients_copied());
    } catch {
      toast?.showError(m.integration_clients_copy_failed());
    }
  };

  return <div className="p-3">
    <h6 className="text-muted mb-3"><i className="bi bi-plug me-2"></i>{m.integration_clients_section_title()}</h6>
    <p className="text-muted small mb-3">{m.integration_clients_description()}</p>
    {props.createdClient ? <Alert variant="success" className="d-flex flex-column gap-2">
      <div className="fw-medium">{m.integration_clients_created_title()}</div>
      <div className="small">{m.integration_clients_created_warning()}</div>
      <code className="user-select-all d-block p-2 bg-body-secondary rounded text-break">{props.createdClient.key}</code>
      <div className="d-flex gap-2">
        <Button variant="outline-success" size="sm" onClick={() => void copyKey()}>{m.api_tokens_copy_btn()}</Button>
        <Button variant="success" size="sm" onClick={props.onDismissCreatedClient}>{m.api_tokens_done_btn()}</Button>
      </div>
    </Alert> : null}
    <Form.Group className="mb-2" controlId="integration-client-name">
      <Form.Label className="fw-medium mb-1">{m.integration_clients_name_label()}</Form.Label>
      <Form.Control size="sm" value={name} onChange={(event) => setName(event.target.value)} placeholder={m.integration_clients_name_placeholder()} disabled={mutationInFlight || props.createdClient !== null} />
    </Form.Group>
    <Form.Check className="mb-3" id="integration-client-mcp-scope" checked readOnly label="worktime:mcp" />
    {props.isAdmin ? <Form.Check className="mb-3" id="integration-client-admin-scope" checked={adminScope} disabled={mutationInFlight || props.createdClient !== null} onChange={(event) => setAdminScope(event.target.checked)} label={m.integration_clients_admin_scope_label()} /> : null}
    <Button className="mb-3" size="sm" disabled={mutationInFlight || props.createdClient !== null || !name.trim()} onClick={() => props.onCreateClient(name, adminScope ? ["worktime:mcp", "worktime:admin"] : ["worktime:mcp"])}>
      {props.isCreating ? m.integration_clients_creating_btn() : m.integration_clients_create_btn()}
    </Button>
    {props.error ? <Alert variant="danger" className="py-2">{props.error}</Alert> : null}
    {props.isLoading ? <div className="text-muted small">{m.loading()}</div> : props.clients?.length ? <ListGroup variant="flush">
      {props.clients.map((client) => <ListGroup.Item key={client.id} className="px-0">
        <div className="d-flex justify-content-between align-items-start gap-3">
          <div>
            <div className="fw-medium">{client.name} {!client.is_active ? <span className="badge text-bg-secondary">{m.integration_clients_revoked()}</span> : null}</div>
            <div className="text-muted small">•••• {client.key_preview} · {m.api_tokens_created_at_label()} {formatDate(client.created_at)} · {m.api_tokens_last_used_label()} {client.last_used_at ? formatDate(client.last_used_at) : m.api_tokens_last_used_never()}</div>
            <div className="text-muted small">{m.api_tokens_scopes_label()}: {client.scopes.join(", ")} · {m.integration_clients_rate_limit({ count: client.rate_limit_per_minute })}</div>
          </div>
          {client.is_active ? <div className="d-flex gap-2">
            <Button variant="outline-secondary" size="sm" disabled={mutationInFlight || props.createdClient !== null} onClick={() => setConfirmation({ action: "rotate", client })}>{m.integration_clients_rotate_btn()}</Button>
            <Button variant="outline-danger" size="sm" disabled={mutationInFlight} onClick={() => setConfirmation({ action: "revoke", client })}>{m.api_tokens_revoke_btn()}</Button>
          </div> : null}
        </div>
      </ListGroup.Item>)}
    </ListGroup> : <p className="text-muted small mb-0">{m.integration_clients_empty()}</p>}
    <ConfirmationDialog isOpen={confirmation !== null} title={confirmation?.action === "rotate" ? m.integration_clients_rotate_confirm_title() : m.integration_clients_revoke_confirm_title()} message={confirmation?.action === "rotate" ? m.integration_clients_rotate_confirm_message({ name: confirmation.client.name }) : m.integration_clients_revoke_confirm_message({ name: confirmation?.client.name ?? "" })} confirmLabel={confirmation?.action === "rotate" ? m.integration_clients_rotate_btn() : m.api_tokens_revoke_btn()} cancelLabel={m.cancel()} onConfirm={() => {
      if (confirmation?.action === "rotate") props.onRotateClient(confirmation.client.id);
      if (confirmation?.action === "revoke") props.onRevokeClient(confirmation.client.id);
      setConfirmation(null);
    }} onCancel={() => setConfirmation(null)} variant={confirmation?.action === "revoke" ? "danger" : "primary"} icon="bi-plug" />
  </div>;
}
