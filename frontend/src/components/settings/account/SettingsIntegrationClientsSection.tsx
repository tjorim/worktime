import { Plug as PlugIcon } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type {
  CreatedIntegrationClient,
  IntegrationClient,
  IntegrationClientScope,
} from "@/pages/settings/hooks/useSettingsIntegrationClients";
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
  const [confirmation, setConfirmation] = useState<{
    action: "rotate" | "revoke";
    client: IntegrationClient;
  } | null>(null);
  const mutationInFlight = props.isCreating || props.busyClientId !== null;

  // Clear the draft the moment a client is created, as a same-render response
  // to the prop changing rather than a follow-up effect.
  const [prevCreatedClient, setPrevCreatedClient] = useState(props.createdClient);
  if (props.createdClient !== prevCreatedClient) {
    setPrevCreatedClient(props.createdClient);
    if (props.createdClient) {
      setName("");
      setAdminScope(false);
    }
  }

  const copyKey = async () => {
    if (!props.createdClient) return;
    try {
      await navigator.clipboard.writeText(props.createdClient.key);
      toast?.showSuccess(m.integration_clients_copied());
    } catch {
      toast?.showError(m.integration_clients_copy_failed());
    }
  };

  const formLocked = mutationInFlight || props.createdClient !== null;

  return (
    <SettingsSection icon={PlugIcon} title={m.integration_clients_section_title()}>
      <SettingsHint className="tw:mb-3">{m.integration_clients_description()}</SettingsHint>
      {props.createdClient ? (
        <Alert variant="success" className="tw:mb-3 tw:gap-2">
          <div className="tw:font-medium">{m.integration_clients_created_title()}</div>
          <div>{m.integration_clients_created_warning()}</div>
          <SettingsSecret>{props.createdClient.key}</SettingsSecret>
          <div className="tw:flex tw:gap-2">
            <Button variant="outline" size="sm" onClick={() => void copyKey()}>
              {m.api_tokens_copy_btn()}
            </Button>
            <Button size="sm" onClick={props.onDismissCreatedClient}>
              {m.api_tokens_done_btn()}
            </Button>
          </div>
        </Alert>
      ) : null}
      <div className="tw:mb-3 tw:flex tw:flex-col tw:gap-3">
        <Field>
          <FieldLabel htmlFor="integration-client-name">
            {m.integration_clients_name_label()}
          </FieldLabel>
          <Input
            id="integration-client-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={m.integration_clients_name_placeholder()}
            disabled={formLocked}
          />
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="integration-client-mcp-scope" checked readOnly />
          <FieldLabel htmlFor="integration-client-mcp-scope">worktime:mcp</FieldLabel>
        </Field>
        {props.isAdmin ? (
          <Field orientation="horizontal">
            <Checkbox
              id="integration-client-admin-scope"
              checked={adminScope}
              disabled={formLocked}
              onCheckedChange={setAdminScope}
            />
            <FieldLabel htmlFor="integration-client-admin-scope">
              {m.integration_clients_admin_scope_label()}
            </FieldLabel>
          </Field>
        ) : null}
        <div>
          <Button
            size="sm"
            disabled={formLocked || !name.trim()}
            onClick={() =>
              props.onCreateClient(
                name,
                adminScope ? ["worktime:mcp", "worktime:admin"] : ["worktime:mcp"],
              )
            }
          >
            {props.isCreating
              ? m.integration_clients_creating_btn()
              : m.integration_clients_create_btn()}
          </Button>
        </div>
      </div>
      {props.error ? (
        <Alert variant="destructive" className="tw:mb-3">
          {props.error}
        </Alert>
      ) : null}
      {props.isLoading ? (
        <SettingsLoading>{m.loading()}</SettingsLoading>
      ) : props.clients?.length ? (
        <SettingsList>
          {props.clients.map((client) => (
            <SettingsItem
              key={client.id}
              className="tw:flex tw:items-start tw:justify-between tw:gap-3"
            >
              <div className="tw:min-w-0">
                <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:font-medium">
                  {client.name}
                  {!client.is_active ? (
                    <Badge variant="secondary">{m.integration_clients_revoked()}</Badge>
                  ) : null}
                </div>
                <div className="tw:text-sm tw:text-muted-foreground">
                  •••• {client.key_preview} · {m.api_tokens_created_at_label()}{" "}
                  {formatDate(client.created_at)} · {m.api_tokens_last_used_label()}{" "}
                  {client.last_used_at
                    ? formatDate(client.last_used_at)
                    : m.api_tokens_last_used_never()}
                </div>
                <div className="tw:text-sm tw:text-muted-foreground">
                  {m.api_tokens_scopes_label()}: {client.scopes.join(", ")} ·{" "}
                  {m.integration_clients_rate_limit({ count: client.rate_limit_per_minute })}
                </div>
              </div>
              {client.is_active ? (
                <div className="tw:flex tw:gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={formLocked}
                    onClick={() => setConfirmation({ action: "rotate", client })}
                  >
                    {m.integration_clients_rotate_btn()}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={mutationInFlight}
                    onClick={() => setConfirmation({ action: "revoke", client })}
                  >
                    {m.api_tokens_revoke_btn()}
                  </Button>
                </div>
              ) : null}
            </SettingsItem>
          ))}
        </SettingsList>
      ) : (
        <SettingsHint>{m.integration_clients_empty()}</SettingsHint>
      )}
      <ConfirmationDialog
        isOpen={confirmation !== null}
        title={
          confirmation?.action === "rotate"
            ? m.integration_clients_rotate_confirm_title()
            : m.integration_clients_revoke_confirm_title()
        }
        message={
          confirmation?.action === "rotate"
            ? m.integration_clients_rotate_confirm_message({ name: confirmation.client.name })
            : m.integration_clients_revoke_confirm_message({
                name: confirmation?.client.name ?? "",
              })
        }
        confirmLabel={
          confirmation?.action === "rotate"
            ? m.integration_clients_rotate_btn()
            : m.api_tokens_revoke_btn()
        }
        cancelLabel={m.cancel()}
        onConfirm={() => {
          if (confirmation?.action === "rotate") props.onRotateClient(confirmation.client.id);
          if (confirmation?.action === "revoke") props.onRevokeClient(confirmation.client.id);
          setConfirmation(null);
        }}
        onCancel={() => setConfirmation(null)}
        variant={confirmation?.action === "revoke" ? "danger" : "primary"}
        icon={PlugIcon}
      />
    </SettingsSection>
  );
}
