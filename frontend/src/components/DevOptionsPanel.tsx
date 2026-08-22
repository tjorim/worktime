import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useDeveloperOptions } from "@/contexts/DeveloperOptionsContext";
import { dayjs } from "@/utils/dateTimeUtils";
import { isHdayHelperMixedContentBlocked } from "@/utils/hdayHelper";
import * as m from "@/paraglide/messages.js";

interface DevOptionsPanelProps {
  show: boolean;
  onHide: () => void;
}

/**
 * Developer options panel for managing backend API connectivity and the local .hday helper.
 * Hidden by default, revealed only by triple-clicking the version button in Settings.
 *
 * @param show - Whether the panel is visible
 * @param onHide - Callback to hide the panel
 * @returns The rendered developer options modal
 */
export function DevOptionsPanel({ show, onHide }: DevOptionsPanelProps) {
  const {
    options,
    helperConnectionStatus,
    updateAutoConnect,
    updateHdayHelperUrl,
    testHdayHelperConnection,
    testConnection,
    disconnect,
  } = useDeveloperOptions();
  const { isAuthenticated, displayName, triggerLogin, logout } = useAuth();

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Local state for the hday helper URL input (reflects saved value on open)
  const [hdayHelperUrlDraft, setHdayHelperUrlDraft] = useState(options.hdayHelperUrl ?? "");
  const [isTestingHelper, setIsTestingHelper] = useState(false);
  const [helperTestResult, setHelperTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const hdayHelperMixedContentRisk =
    hdayHelperUrlDraft.trim() !== "" && isHdayHelperMixedContentBlocked(hdayHelperUrlDraft.trim());

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const success = await testConnection();
      setTestResult({
        success,
        message: success ? m.dev_connection_success() : m.dev_connection_failed(),
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: m.dev_connection_error({
          error: error instanceof Error ? error.message : String(error),
        }),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setTestResult({ success: true, message: m.dev_disconnected_msg() });
  };

  const handleSaveHdayHelperUrl = () => {
    const normalized = hdayHelperUrlDraft.trim().replace(/\/+$/, "");
    updateHdayHelperUrl(normalized || null);
    setHelperTestResult(null);
  };

  const handleTestHelperConnection = async () => {
    const normalizedUrl = hdayHelperUrlDraft.trim().replace(/\/+$/, "");
    if (!normalizedUrl) return;

    setIsTestingHelper(true);
    setHelperTestResult(null);

    try {
      const success = await testHdayHelperConnection(normalizedUrl);
      setHelperTestResult({
        success,
        message: success ? m.dev_hday_helper_connected() : m.dev_hday_helper_failed(),
      });
    } finally {
      setIsTestingHelper(false);
    }
  };

  const getStatusBadge = () => {
    switch (options.connectionStatus) {
      case "connected":
        return <Badge bg="success">{m.dev_connected()}</Badge>;
      case "connecting":
        return <Badge bg="info">{m.dev_connecting()}</Badge>;
      case "error":
        return <Badge bg="danger">{m.error()}</Badge>;
      case "disconnected":
      default:
        return <Badge bg="secondary">{m.dev_disconnected()}</Badge>;
    }
  };

  const getHelperStatusBadge = () => {
    switch (helperConnectionStatus) {
      case "connected":
        return <Badge bg="success">{m.dev_connected()}</Badge>;
      case "connecting":
        return <Badge bg="info">{m.dev_connecting()}</Badge>;
      case "error":
        return <Badge bg="danger">{m.error()}</Badge>;
      case "disconnected":
      default:
        return <Badge bg="secondary">{m.dev_disconnected()}</Badge>;
    }
  };

  const formatLastTest = () => {
    if (!options.lastConnectionTest) return m.dev_never();
    return dayjs(options.lastConnectionTest).format("YYYY-MM-DD HH:mm:ss");
  };

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="bi bi-code-slash me-2"></i>
          {m.developer_options_label()}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Alert variant="info" className="mb-4">
          <Alert.Heading className="h6">
            <i className="bi bi-info-circle me-2"></i>
            {m.dev_api_integration_title()}
          </Alert.Heading>
          <p className="mb-0 small">
            {m.dev_api_integration_desc()} {/* */}
            {/* See backend/README.md for setup instructions */}
          </p>
        </Alert>

        {/* Connection Status */}
        <div className="mb-4">
          <h6 className="mb-3">{m.dev_connection_status_heading()}</h6>
          <div className="d-flex align-items-center gap-3">
            <div>
              {m.dev_status_label()} {getStatusBadge()}
            </div>
            {options.enabled && (
              <div className="text-muted small">
                <i className="bi bi-check-circle me-1"></i>
                {m.dev_backend_enabled()}
              </div>
            )}
          </div>
          {options.lastConnectionTest && (
            <div className="text-muted small mt-2">
              {m.dev_last_tested()} {formatLastTest()}
            </div>
          )}
        </div>

        {/* Connection Configuration */}
        <div className="mb-4">
          <h6 className="mb-3">{m.dev_api_config_heading()}</h6>
          <p className="text-muted small mb-3">{m.dev_api_url_readonly()}</p>

          <Form.Check
            type="checkbox"
            id="auto-connect-check"
            label={m.dev_auto_connect()}
            checked={options.autoConnect}
            onChange={(e) => updateAutoConnect(e.target.checked)}
            disabled={options.connectionStatus === "connecting"}
          />
        </div>

        {/* Test Result */}
        {testResult && (
          <Alert variant={testResult.success ? "success" : "danger"} className="mb-3">
            {testResult.message}
          </Alert>
        )}

        {/* Connection Actions */}
        <div className="d-flex gap-2">
          {options.connectionStatus !== "connected" ? (
            <Button
              variant="primary"
              onClick={handleTestConnection}
              disabled={isTesting || options.connectionStatus === "connecting"}
            >
              {isTesting && <Spinner animation="border" size="sm" className="me-2" />}
              <i className="bi bi-plug me-1"></i>
              {m.dev_test_connection()}
            </Button>
          ) : (
            <Button variant="outline-danger" onClick={handleDisconnect}>
              <i className="bi bi-plug-fill me-1"></i>
              {m.dev_disconnect_btn()}
            </Button>
          )}
        </div>

        {/* Authentication — only visible when connected */}
        {options.connectionStatus === "connected" && (
          <div className="mb-4 mt-4">
            <h6 className="mb-3">{m.dev_auth_heading()}</h6>
            <div className="d-flex align-items-center gap-3">
              {isAuthenticated ? (
                <>
                  <span className="small text-success">
                    <i className="bi bi-person-check me-1"></i>
                    {displayName ? m.auth_logged_in_as({ displayName }) : m.account_signed_in()}
                  </span>
                  <Button variant="outline-secondary" size="sm" onClick={logout}>
                    <i className="bi bi-box-arrow-right me-1"></i>
                    {m.dev_auth_logout_btn()}
                  </Button>
                </>
              ) : (
                <>
                  <span className="small text-muted">
                    <i className="bi bi-person-x me-1"></i>
                    {m.dev_auth_not_authenticated()}
                  </span>
                  <Button variant="primary" size="sm" onClick={triggerLogin}>
                    <i className="bi bi-box-arrow-in-right me-1"></i>
                    {m.dev_auth_login_btn()}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <hr />

        {/* .hday Helper Configuration */}
        <div className="mb-4">
          <div className="d-flex align-items-center gap-2 mb-1">
            <h6 className="mb-0">
              <i className="bi bi-file-earmark-text me-2"></i>
              {m.dev_hday_helper_heading()}
            </h6>
            {getHelperStatusBadge()}
          </div>
          <p className="text-muted small mb-3">{m.dev_hday_helper_desc()}</p>

          <Form.Group controlId="hday-helper-url" className="mb-2">
            <Form.Label className="small fw-medium">{m.dev_hday_helper_url_label()}</Form.Label>
            <div className="d-flex gap-2">
              <Form.Control
                type="url"
                placeholder="http://localhost:8080"
                value={hdayHelperUrlDraft}
                onChange={(e) => {
                  setHdayHelperUrlDraft(e.target.value);
                  setHelperTestResult(null);
                }}
                size="sm"
              />
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={handleSaveHdayHelperUrl}
                disabled={hdayHelperUrlDraft.trim() === (options.hdayHelperUrl ?? "")}
              >
                {m.dev_save_url()}
              </Button>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={handleTestHelperConnection}
                disabled={isTestingHelper || !hdayHelperUrlDraft.trim()}
              >
                {isTestingHelper && <Spinner animation="border" size="sm" className="me-1" />}
                {m.dev_hday_helper_test()}
              </Button>
            </div>
            <Form.Text className="text-muted">{m.dev_hday_helper_url_help()}</Form.Text>
          </Form.Group>

          {hdayHelperMixedContentRisk && (
            <Alert variant="warning" className="mb-2 py-2 small">
              {m.dev_hday_helper_mixed_content_warning()}
            </Alert>
          )}

          {helperTestResult && (
            <Alert
              variant={helperTestResult.success ? "success" : "danger"}
              className="mb-0 py-2 small"
            >
              {helperTestResult.message}
            </Alert>
          )}
        </div>

        {/* Backend Information */}
        <div className="mt-4 p-3 bg-light rounded">
          <h6 className="mb-2">{m.dev_endpoints_heading()}</h6>
          <ul className="small mb-0">
            <li>
              <code>GET /health</code> - {m.dev_endpoint_health()}
            </li>
            <li>
              <code>GET /hday/:username</code> - {m.dev_endpoint_read_hday()}
            </li>
            <li>
              <code>PUT /hday/:username</code> - {m.dev_endpoint_write_hday()}
            </li>
            <li>
              <code>GET /team/:id</code> - {m.dev_endpoint_read_team()}
            </li>
            <li>
              <code>GET /team/:id/hday</code> - {m.dev_endpoint_read_team_hdays()}
            </li>
          </ul>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          {m.close()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
