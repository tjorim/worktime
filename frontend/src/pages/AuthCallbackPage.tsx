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
      className="tw:mx-auto tw:w-full tw:max-w-6xl tw:px-3 tw:py-12 tw:text-center"
      aria-labelledby="auth-callback-title"
    >
      <Spinner role="status" className="tw:mb-4">
        <span className="tw:sr-only">{m.auth_callback_spinner()}</span>
      </Spinner>
      <h1 id="auth-callback-title" className="tw:text-xl tw:mb-2">
        {m.auth_callback_title()}
      </h1>
      <p className="tw:text-muted-foreground tw:mb-0">{m.auth_callback_description()}</p>
    </main>
  );
}
