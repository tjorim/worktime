import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";
import Spinner from "react-bootstrap/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useApiClient } from "@/hooks/useApiClient";
import * as m from "@/paraglide/messages.js";

export function PebblePairPage() {
  const { isAuthenticated, isValidating, triggerLogin } = useAuth();
  const apiFetch = useApiClient();
  const [closed, setClosed] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [pairAttempt, setPairAttempt] = useState(0);
  const loginRequested = useRef(false);
  const pairRequested = useRef(false);

  useEffect(() => {
    if (isValidating || isAuthenticated || loginRequested.current) return;
    loginRequested.current = true;
    triggerLogin();
  }, [isAuthenticated, isValidating, triggerLogin]);

  useEffect(() => {
    if (!isAuthenticated || closed || pairRequested.current) return;
    pairRequested.current = true;

    const pair = async () => {
      try {
        const response = await apiFetch("/api/access-tokens/pebble", {
          method: "POST",
        });
        if (!response.ok) throw new Error(`Pairing failed (${response.status})`);
        const result = (await response.json()) as { token?: string };
        if (!result.token) throw new Error("Pairing response did not include a token");
        const payload = encodeURIComponent(JSON.stringify({ accessToken: result.token }));
        window.location.href = `pebblejs://close#${payload}`;
        setClosed(true);
      } catch (error) {
        pairRequested.current = false;
        setPairingError(error instanceof Error ? error.message : String(error));
      }
    };
    void pair();
  }, [apiFetch, closed, isAuthenticated, pairAttempt]);

  const retryPairing = () => {
    setPairingError("");
    setPairAttempt((attempt) => attempt + 1);
  };

  const retrySignIn = () => {
    loginRequested.current = true;
    triggerLogin();
  };

  // Before sign-in there is no watch work happening yet, so saying "connecting
  // your watch" here would describe the wrong step. The sign-in redirect is
  // also the one step that can fail silently — triggerLogin only surfaces a
  // toast, which is easy to miss inside the Pebble configuration webview — so
  // this state always keeps a manual way forward.
  const isSigningIn = !isValidating && !isAuthenticated;

  return (
    <Container as="main" className="py-5 text-center">
      <h1 className="h4 mb-3">{m.pebble_pair_title()}</h1>
      <p className="text-body-secondary mb-4">{m.pebble_pair_description()}</p>

      {pairingError ? (
        <Alert variant="danger" role="alert">
          <div>{pairingError}</div>
          <Button className="mt-3" variant="outline-danger" size="sm" onClick={retryPairing}>
            {m.pebble_pair_retry()}
          </Button>
        </Alert>
      ) : closed ? (
        <Alert variant="success" role="status">
          {m.pebble_pair_close_instruction()}
        </Alert>
      ) : (
        <div aria-live="polite">
          <div className="d-flex align-items-center justify-content-center gap-2 text-body-secondary">
            <Spinner animation="border" size="sm" aria-hidden="true" />
            <span>{isSigningIn ? m.pebble_pair_signing_in() : m.pebble_pair_connecting()}</span>
          </div>
          {isSigningIn ? (
            <Button className="mt-3" variant="outline-primary" size="sm" onClick={retrySignIn}>
              {m.account_sign_in_btn()}
            </Button>
          ) : null}
        </div>
      )}
    </Container>
  );
}
