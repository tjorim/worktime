import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import Spinner from "react-bootstrap/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import * as m from "@/paraglide/messages.js";

export function AuthCallbackPage() {
  const { isValidating } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isValidating) {
      navigate({ to: "/", replace: true });
    }
  }, [isValidating, navigate]);

  return (
    <main className="container py-5 text-center" aria-labelledby="auth-callback-title">
      <Spinner animation="border" role="status" className="mb-3">
        <span className="visually-hidden">{m.auth_callback_spinner()}</span>
      </Spinner>
      <h1 id="auth-callback-title" className="h4 mb-2">
        {m.auth_callback_title()}
      </h1>
      <p className="text-muted mb-0">{m.auth_callback_description()}</p>
    </main>
  );
}
