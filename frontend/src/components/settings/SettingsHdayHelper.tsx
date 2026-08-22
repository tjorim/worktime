import { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import { useDeveloperOptions, type ConnectionStatus } from "@/contexts/DeveloperOptionsContext";
import { isHdayHelperMixedContentBlocked } from "@/utils/hdayHelper";
import * as m from "@/paraglide/messages.js";

function statusBadge(status: ConnectionStatus) {
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
    useDeveloperOptions();
  const [urlDraft, setUrlDraft] = useState(options.hdayHelperUrl ?? "");
  const [isTesting, setIsTesting] = useState(false);
  const [testSucceeded, setTestSucceeded] = useState<boolean | null>(null);

  useEffect(() => setUrlDraft(options.hdayHelperUrl ?? ""), [options.hdayHelperUrl]);

  const normalizedUrl = urlDraft.trim().replace(/\/+$/, "");
  const mixedContentRisk = normalizedUrl !== "" && isHdayHelperMixedContentBlocked(normalizedUrl);

  const handleSave = () => {
    updateHdayHelperUrl(normalizedUrl || null);
    setTestSucceeded(null);
  };

  const handleTest = async () => {
    if (!normalizedUrl) return;
    setIsTesting(true);
    setTestSucceeded(null);
    try {
      setTestSucceeded(await testHdayHelperConnection(normalizedUrl));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <h6 className="text-muted mb-0">
          <i className="bi bi-file-earmark-text me-2" aria-hidden="true"></i>
          {m.dev_hday_helper_heading()}
        </h6>
        {statusBadge(helperConnectionStatus)}
      </div>
      <p className="text-muted small mb-3">{m.dev_hday_helper_desc()}</p>

      <Form.Group controlId="hday-helper-url" className="mb-2">
        <Form.Label className="small fw-medium">{m.dev_hday_helper_url_label()}</Form.Label>
        <div className="d-flex flex-column flex-sm-row gap-2">
          <Form.Control
            type="url"
            placeholder="http://localhost:8080"
            value={urlDraft}
            onChange={(event) => {
              setUrlDraft(event.target.value);
              setTestSucceeded(null);
            }}
            size="sm"
          />
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handleSave}
            disabled={normalizedUrl === (options.hdayHelperUrl ?? "")}
          >
            {m.dev_save_url()}
          </Button>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={handleTest}
            disabled={isTesting || !normalizedUrl}
          >
            {isTesting && <Spinner animation="border" size="sm" className="me-1" />}
            {m.dev_hday_helper_test()}
          </Button>
        </div>
        <Form.Text className="text-muted">{m.dev_hday_helper_url_help()}</Form.Text>
      </Form.Group>

      {mixedContentRisk && (
        <Alert variant="warning" className="mb-2 py-2 small">
          {m.dev_hday_helper_mixed_content_warning()}
        </Alert>
      )}
      {testSucceeded !== null && (
        <Alert variant={testSucceeded ? "success" : "danger"} className="mb-0 py-2 small">
          {testSucceeded ? m.dev_hday_helper_connected() : m.dev_hday_helper_failed()}
        </Alert>
      )}
    </div>
  );
}
