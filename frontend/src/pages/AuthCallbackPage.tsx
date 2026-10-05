import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import * as m from "@/paraglide/messages.js";

export function AuthCallbackPage() {
  const { isValidating } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isValidating && window.location.pathname === "/auth/callback") {
      navigate({ to: "/", replace: true });
    }
  }, [isValidating, navigate]);

  return (
    <main
      className="mx-auto w-full max-w-6xl px-3 py-12 text-center"
      aria-labelledby="auth-callback-title"
    >
      <Spinner role="status" className="mb-4">
        <span className="sr-only">{m.auth_callback_spinner()}</span>
      </Spinner>
      <h1 id="auth-callback-title" className="text-xl mb-2">
        {m.auth_callback_title()}
      </h1>
      <p className="text-muted-foreground mb-0">{m.auth_callback_description()}</p>
    </main>
  );
}
