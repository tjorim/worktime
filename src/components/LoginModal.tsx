import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import { useAuth } from "../contexts/AuthContext";
import * as m from "../paraglide/messages.js";

interface LoginModalProps {
  show: boolean;
  onHide: () => void;
}

/**
 * Login modal for authenticating with the backend API.
 *
 * Shown when the backend is enabled but no valid token exists,
 * or when any authenticated endpoint returns 401.
 *
 * @param show - Whether the modal is visible
 * @param onHide - Callback to dismiss the modal without logging in
 */
export function LoginModal({ show, onHide }: LoginModalProps) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(username, password);
      // AuthContext clears showLoginModal on success; reset local state
      setUsername("");
      setPassword("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "generic";
      switch (message) {
        case "invalid_credentials":
          setError(m.login_error_invalid_credentials());
          break;
        case "rate_limited":
          setError(m.login_error_rate_limited());
          break;
        default:
          setError(m.login_error_generic());
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHide = () => {
    if (!isSubmitting) {
      setUsername("");
      setPassword("");
      setError(null);
      onHide();
    }
  };

  return (
    <Modal show={show} onHide={handleHide} centered backdrop="static">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton={!isSubmitting}>
          <Modal.Title>
            <i className="bi bi-shield-lock me-2"></i>
            {m.login_title()}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <p className="text-muted small mb-3">{m.login_description()}</p>

          {error && (
            <Alert variant="danger" className="mb-3">
              <i className="bi bi-exclamation-circle me-2"></i>
              {error}
            </Alert>
          )}

          <Form.Group controlId="login-username" className="mb-3">
            <Form.Label>{m.login_username_label()}</Form.Label>
            <Form.Control
              type="text"
              placeholder={m.login_username_placeholder()}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              disabled={isSubmitting}
              aria-required="true"
            />
          </Form.Group>

          <Form.Group controlId="login-password">
            <Form.Label>{m.login_password_label()}</Form.Label>
            <Form.Control
              type="password"
              placeholder={m.login_password_placeholder()}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={isSubmitting}
              aria-required="true"
            />
          </Form.Group>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={handleHide} disabled={isSubmitting}>
            {m.cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting || !username || !password}>
            {isSubmitting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
                {m.login_signing_in()}
              </>
            ) : (
              <>
                <i className="bi bi-box-arrow-in-right me-1"></i>
                {m.login_submit()}
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
