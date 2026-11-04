import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth as useOidcAuth } from "react-oidc-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import * as m from "@/paraglide/messages.js";

export function AuthCallbackPage() {
  const { isValidating, triggerLogin } = useAuth();
  const { error } = useOidcAuth();
  const failed = Boolean(error) || new URLSearchParams(window.location.search).has("error");
  const navigate = useNavigate();

  useEffect(() => {
    if (!failed && !isValidating && window.location.pathname === "/auth/callback") {
      navigate({ to: "/", replace: true });
    }
  }, [failed, isValidating, navigate]);

  if (failed) {
    return (
      <main id="main-content" className="mx-auto max-w-2xl px-3 py-12 text-center">
        <h1 className="text-2xl">{m.auth_failed_title()}</h1>
        <p role="alert">{m.auth_failed_description()}</p>
        <div className="flex flex-wrap justify-center items-center gap-4">
          <Button onClick={triggerLogin}>{m.auth_retry_signin()}</Button>
          <Link to="/">{m.back_to_worktime()}</Link>
        </div>
      </main>
    );
  }

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
