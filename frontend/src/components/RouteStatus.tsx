import { TriangleAlertIcon } from "lucide-react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Icon } from "@/components/shared/Icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { RouteChunkLoadError } from "@/lib/lazyRoute";
import * as m from "@/paraglide/messages.js";

/** Shown while a lazily loaded route chunk downloads. */
export function RoutePending() {
  return (
    <div className="flex justify-center py-6" aria-live="polite">
      <Spinner role="status">
        <span className="sr-only">{m.loading()}</span>
      </Spinner>
    </div>
  );
}

/**
 * Translated recovery UI for route errors, including failed chunk downloads.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const isChunkError = error instanceof RouteChunkLoadError;

  return (
    <main id="main-content" className="mx-auto mt-6 max-w-2xl px-3">
      <Alert variant="destructive">
        <Icon icon={TriangleAlertIcon} />
        <AlertTitle>
          {isChunkError ? m.route_load_failed_title() : m.error_boundary_heading()}
        </AlertTitle>
        <AlertDescription>
          <p>
            {isChunkError ? m.route_load_failed_message() : m.error_boundary_fallback_message()}
          </p>
          <div className="mt-2 flex gap-2">
            {!isChunkError && (
              <Button variant="outline" onClick={reset}>
                {m.error_boundary_try_again()}
              </Button>
            )}
            <Button variant="destructive" onClick={() => window.location.reload()}>
              {m.error_boundary_reload()}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </main>
  );
}
