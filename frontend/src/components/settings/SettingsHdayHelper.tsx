import { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { useHdayHelper, type HdayHelperStatus } from "@/contexts/HdayHelperContext";
import { useSettings } from "@/contexts/SettingsContext";
import { isHdayHelperMixedContentBlocked } from "@/utils/hdayHelper";
import * as m from "@/paraglide/messages.js";

function statusBadge(status: HdayHelperStatus) {
  switch (status) {
    case "connected":
      return <Badge bg="success">{m.dev_connected()}</Badge>;
    case "connecting":
      return <Badge bg="info">{m.dev_connecting()}</Badge>;
    case "error":
      return <Badge bg="danger">{m.error()}</Badge>;
    default:
      return <Badge bg="secondary">{m.dev_disconnected()}</Badge>;
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

  useEffect(() => setUrlDraft(options.hdayHelperUrl ?? ""), [options.hdayHelperUrl]);
  useEffect(() => setUsernameDraft(settings.hdayUsername ?? ""), [settings.hdayUsername]);

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
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <h6 className="text-muted mb-0">
          <i className="bi bi-file-earmark-text me-2" aria-hidden="true"></i>
          {m.hday_helper_heading()}
        </h6>
        {statusBadge(helperConnectionStatus)}
      </div>
      <p className="text-muted small mb-3">{m.hday_helper_desc()}</p>

      <Form.Group controlId="hday-helper-url" className="mb-2">
        <Form.Label className="small fw-medium">{m.hday_helper_url_label()}</Form.Label>
        <div className="d-flex flex-column flex-sm-row gap-2">
          <Form.Control
            type="url"
            placeholder="http://localhost:8080"
            value={urlDraft}
            onChange={(event) => {
              setUrlDraft(event.target.value);
              setTestSucceeded(null);
              setUrlIsInvalid(false);
            }}
            isInvalid={urlIsInvalid}
            size="sm"
          />
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handleSave}
            disabled={normalizedUrl === (options.hdayHelperUrl ?? "")}
          >
            {m.hday_helper_save_url()}
          </Button>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={handleTest}
            disabled={isTesting || !normalizedUrl}
          >
            {isTesting && <Spinner animation="border" size="sm" className="me-1" />}
            {m.hday_helper_test()}
          </Button>
        </div>
        {urlIsInvalid && (
          <Form.Control.Feedback type="invalid" className="d-block">
            {m.hday_helper_url_invalid()}
          </Form.Control.Feedback>
        )}
        <Form.Text className="text-muted">{m.hday_helper_url_help()}</Form.Text>
      </Form.Group>

      <Form.Group controlId="hday-username" className="mb-2">
        <Form.Label className="small fw-medium">{m.hday_username_label()}</Form.Label>
        <div className="d-flex flex-column flex-sm-row gap-2">
          <Form.Control
            type="text"
            placeholder={m.hday_username_placeholder()}
            value={usernameDraft}
            onChange={(event) => setUsernameDraft(event.target.value)}
            size="sm"
          />
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handleSaveUsername}
            disabled={normalizedUsername === (settings.hdayUsername ?? "")}
          >
            {m.hday_username_save()}
          </Button>
        </div>
        <Form.Text className="text-muted">{m.hday_username_help()}</Form.Text>
      </Form.Group>

      {mixedContentRisk && (
        <Alert variant="warning" className="mb-2 py-2 small">
          {m.hday_helper_mixed_content_warning()}
        </Alert>
      )}
      {testSucceeded !== null && (
        <Alert variant={testSucceeded ? "success" : "danger"} className="mb-0 py-2 small">
          {testSucceeded ? m.hday_helper_connected() : m.hday_helper_failed()}
        </Alert>
      )}
    </div>
  );
}
