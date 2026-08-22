import { useCallback, useEffect, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ListGroup from "react-bootstrap/ListGroup";
import Spinner from "react-bootstrap/Spinner";
import * as m from "@/paraglide/messages.js";

type BackendStatus = "checking" | "available" | "unavailable";
const BACKEND_HEALTH_TIMEOUT_MS = 5000;

export function SettingsBackendStatus() {
  const [status, setStatus] = useState<BackendStatus>("checking");

  const checkHealth = useCallback(async () => {
    setStatus("checking");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), BACKEND_HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch("/api/health", {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      setStatus(response.ok ? "available" : "unavailable");
    } catch {
      setStatus("unavailable");
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => void checkHealth(), [checkHealth]);

  return (
    <ListGroup.Item>
      <div className="d-flex justify-content-between align-items-center gap-3">
        <div>
          <div className="fw-medium">
            <i className="bi bi-cloud-check me-2" aria-hidden="true"></i>
            {m.backend_status_label()}
          </div>
          <small className="text-muted">{m.backend_status_description()}</small>
        </div>
        <div className="d-flex align-items-center gap-2">
          {status === "checking" ? (
            <Badge bg="info">
              <Spinner animation="border" size="sm" className="me-1" />
              {m.backend_status_checking()}
            </Badge>
          ) : (
            <Badge bg={status === "available" ? "success" : "danger"}>
              {status === "available"
                ? m.backend_status_available()
                : m.backend_status_unavailable()}
            </Badge>
          )}
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => void checkHealth()}
            disabled={status === "checking"}
          >
            {m.backend_status_refresh()}
          </Button>
        </div>
      </div>
    </ListGroup.Item>
  );
}
