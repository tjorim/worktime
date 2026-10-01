import { FileText as FileTextIcon } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SettingsHeading, SettingsHint } from "@/components/settings/SettingsParts";
import { useHdayHelper, type HdayHelperStatus } from "@/contexts/HdayHelperContext";
import { useSettings } from "@/contexts/SettingsContext";
import { isHdayHelperMixedContentBlocked } from "@/utils/hdayHelper";
import * as m from "@/paraglide/messages.js";

function statusBadge(status: HdayHelperStatus) {
  switch (status) {
    case "connected":
      return <Badge variant="success">{m.dev_connected()}</Badge>;
    case "connecting":
      return <Badge variant="info">{m.dev_connecting()}</Badge>;
    case "error":
      return <Badge variant="destructive">{m.error()}</Badge>;
    default:
      return <Badge variant="secondary">{m.dev_disconnected()}</Badge>;
  }
}

export function SettingsHdayHelper() {
  const { options, helperConnectionStatus, updateHdayHelperUrl, testHdayHelperConnection } =
    useHdayHelper();
  const { settings, updateHdayUsername } = useSettings();
  const [urlDraft, setUrlDraft] = useState(options.hdayHelperUrl ?? "");
  const [isTesting, setIsTesting] = useState(false);
  const [testSucceeded, setTestSucceeded] = useState<boolean | null>(null);
  const [urlIsInvalid, setUrlIsInvalid] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(settings.hdayUsername ?? "");

  // Re-sync the drafts whenever the saved values change externally, as a
  // same-render response rather than a follow-up effect. The drafts still own
  // their values the rest of the time (see the form controls below).
  const [prevHdayHelperUrl, setPrevHdayHelperUrl] = useState(options.hdayHelperUrl);
  if (prevHdayHelperUrl !== options.hdayHelperUrl) {
    setPrevHdayHelperUrl(options.hdayHelperUrl);
    setUrlDraft(options.hdayHelperUrl ?? "");
  }
  const [prevHdayUsername, setPrevHdayUsername] = useState(settings.hdayUsername);
  if (prevHdayUsername !== settings.hdayUsername) {
    setPrevHdayUsername(settings.hdayUsername);
    setUsernameDraft(settings.hdayUsername ?? "");
  }

  const normalizedUrl = urlDraft.trim().replace(/\/+$/, "");
  const mixedContentRisk = normalizedUrl !== "" && isHdayHelperMixedContentBlocked(normalizedUrl);

  const validateUrl = () => {
    if (!normalizedUrl) return null;
    try {
      const parsed = new URL(normalizedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
      setUrlIsInvalid(false);
      return parsed.href.replace(/\/+$/, "");
    } catch {
      setUrlIsInvalid(true);
      return undefined;
    }
  };

  const handleSave = () => {
    const validUrl = validateUrl();
    if (validUrl === undefined) return;
    updateHdayHelperUrl(validUrl);
    setTestSucceeded(null);
  };

  const normalizedUsername = usernameDraft.trim();
  const handleSaveUsername = () => {
    updateHdayUsername(normalizedUsername || null);
  };

  const handleTest = async () => {
    const validUrl = validateUrl();
    if (!validUrl) return;
    setIsTesting(true);
    setTestSucceeded(null);
    try {
      setTestSucceeded(await testHdayHelperConnection(validUrl));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="tw:flex tw:flex-col tw:gap-3">
      <div>
        <SettingsHeading icon={FileTextIcon} aside={statusBadge(helperConnectionStatus)}>
          {m.hday_helper_heading()}
        </SettingsHeading>
        <SettingsHint className="tw:-mt-1">{m.hday_helper_desc()}</SettingsHint>
      </div>

      <Field>
        <FieldLabel htmlFor="hday-helper-url">{m.hday_helper_url_label()}</FieldLabel>
        <div className="tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row">
          <Input
            id="hday-helper-url"
            type="url"
            placeholder="http://127.0.0.1:8080"
            value={urlDraft}
            onChange={(event) => {
              setUrlDraft(event.target.value);
              setTestSucceeded(null);
              setUrlIsInvalid(false);
            }}
            aria-invalid={urlIsInvalid}
            aria-describedby={urlIsInvalid ? "hday-helper-url-error" : "hday-helper-url-help"}
          />
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={normalizedUrl === (options.hdayHelperUrl ?? "")}
          >
            {m.hday_helper_save_url()}
          </Button>
          <Button variant="secondary" onClick={handleTest} disabled={isTesting || !normalizedUrl}>
            {isTesting && <Spinner size="sm" aria-hidden="true" />}
            {m.hday_helper_test()}
          </Button>
        </div>
        {urlIsInvalid && (
          <FieldError id="hday-helper-url-error">{m.hday_helper_url_invalid()}</FieldError>
        )}
        <FieldDescription id="hday-helper-url-help" className="tw:mb-0">
          {m.hday_helper_url_help()}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="hday-username">{m.hday_username_label()}</FieldLabel>
        <div className="tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row">
          <Input
            id="hday-username"
            type="text"
            placeholder={m.hday_username_placeholder()}
            value={usernameDraft}
            onChange={(event) => setUsernameDraft(event.target.value)}
            aria-describedby="hday-username-help"
          />
          <Button
            variant="outline"
            onClick={handleSaveUsername}
            disabled={normalizedUsername === (settings.hdayUsername ?? "")}
          >
            {m.hday_username_save()}
          </Button>
        </div>
        <FieldDescription id="hday-username-help" className="tw:mb-0">
          {m.hday_username_help()}
        </FieldDescription>
      </Field>

      {mixedContentRisk && <Alert variant="warning">{m.hday_helper_mixed_content_warning()}</Alert>}
      {testSucceeded !== null && (
        <Alert variant={testSucceeded ? "success" : "destructive"}>
          {testSucceeded ? m.hday_helper_connected() : m.hday_helper_failed()}
        </Alert>
      )}
    </div>
  );
}
