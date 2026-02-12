import { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { useDeveloperOptions } from "../contexts/DeveloperOptionsContext";

interface DevOptionsPanelProps {
  show: boolean;
  onHide: () => void;
}

/**
 * Developer options panel for managing backend API connectivity.
 * Hidden by default, revealed only by triple-clicking the version button in Settings.
 *
 * @param show - Whether the panel is visible
 * @param onHide - Callback to hide the panel
 * @returns The rendered developer options modal
 */
export function DevOptionsPanel({ show, onHide }: DevOptionsPanelProps) {
  const { options, updateApiUrl, updateAutoConnect, testConnection, disconnect } =
    useDeveloperOptions();

  const [localApiUrl, setLocalApiUrl] = useState(options.apiUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Sync localApiUrl with options.apiUrl when panel opens or options change
  useEffect(() => {
    if (show) {
      setLocalApiUrl(options.apiUrl);
    }
  }, [options.apiUrl, show]);

  const handleApiUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalApiUrl(e.target.value);
    setTestResult(null);
  };

  const handleSaveUrl = () => {
    updateApiUrl(localApiUrl);
    setTestResult({ success: true, message: "API URL updated" });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // Test with the current local URL (unsaved or saved)
      const success = await testConnection(localApiUrl);
      setTestResult({
        success,
        message: success
          ? "✓ Successfully connected to backend API"
          : "✗ Connection failed - check URL and ensure backend is running",
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: `✗ Connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setTestResult({ success: true, message: "Disconnected from backend API" });
  };

  const getStatusBadge = () => {
    switch (options.connectionStatus) {
      case "connected":
        return <Badge bg="success">Connected</Badge>;
      case "connecting":
        return <Badge bg="info">Connecting...</Badge>;
      case "error":
        return <Badge bg="danger">Error</Badge>;
      case "disconnected":
      default:
        return <Badge bg="secondary">Disconnected</Badge>;
    }
  };

  const formatLastTest = () => {
    if (!options.lastConnectionTest) return "Never";
    const date = new Date(options.lastConnectionTest);
    return date.toLocaleString();
  };

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="bi bi-code-slash me-2"></i>
          Developer Options
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Alert variant="info" className="mb-4">
          <Alert.Heading className="h6">
            <i className="bi bi-info-circle me-2"></i>
            Backend API Integration
          </Alert.Heading>
          <p className="mb-0 small">
            Configure connection to a locally-running backend API server. The backend provides team
            configuration and .hday file management from a shared network drive. See{" "}
            <code>backend/README.md</code> for setup instructions.
          </p>
        </Alert>

        {/* Connection Status */}
        <div className="mb-4">
          <h6 className="mb-3">Connection Status</h6>
          <div className="d-flex align-items-center gap-3">
            <div>Status: {getStatusBadge()}</div>
            {options.enabled && (
              <div className="text-muted small">
                <i className="bi bi-check-circle me-1"></i>
                Backend enabled
              </div>
            )}
          </div>
          {options.lastConnectionTest && (
            <div className="text-muted small mt-2">Last tested: {formatLastTest()}</div>
          )}
        </div>

        {/* API Configuration */}
        <div className="mb-4">
          <h6 className="mb-3">API Configuration</h6>

          <Form.Group className="mb-3">
            <Form.Label>Backend API URL</Form.Label>
            <Form.Control
              type="text"
              placeholder="http://localhost:8000"
              value={localApiUrl}
              onChange={handleApiUrlChange}
              disabled={options.connectionStatus === "connecting"}
            />
            <Form.Text className="text-muted">
              The base URL of your local backend API server (default: http://localhost:8000)
            </Form.Text>
          </Form.Group>

          {localApiUrl !== options.apiUrl && (
            <Button variant="primary" size="sm" onClick={handleSaveUrl} className="mb-3">
              <i className="bi bi-save me-1"></i>
              Save URL
            </Button>
          )}

          <Form.Check
            type="checkbox"
            id="auto-connect-check"
            label="Auto-connect on app start"
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
              disabled={isTesting || !localApiUrl}
            >
              {isTesting && <Spinner animation="border" size="sm" className="me-2" />}
              <i className="bi bi-plug me-1"></i>
              Test Connection
            </Button>
          ) : (
            <Button variant="outline-danger" onClick={handleDisconnect}>
              <i className="bi bi-plug-fill me-1"></i>
              Disconnect
            </Button>
          )}
        </div>

        {/* Backend Information */}
        <div className="mt-4 p-3 bg-light rounded">
          <h6 className="mb-2">Available Backend Endpoints</h6>
          <ul className="small mb-0">
            <li>
              <code>GET /v1/health</code> - Health check and share status
            </li>
            <li>
              <code>GET /v1/hday/:username</code> - Read user's .hday file
            </li>
            <li>
              <code>PUT /v1/hday/:username</code> - Write user's .hday file
            </li>
            <li>
              <code>GET /v1/team/:id</code> - Read team config and members
            </li>
            <li>
              <code>GET /v1/team/:id/hday</code> - Read all team members' .hday files
            </li>
          </ul>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
