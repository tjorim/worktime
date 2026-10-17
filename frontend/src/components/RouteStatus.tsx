import { TriangleAlert as TriangleAlertIcon } from "lucide-react";
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
 * Recovery UI for a route chunk that failed to load (offline and uncached, or a
 * deploy replaced it). Anything else is rethrown to the app-level ErrorBoundary.
 */
export function RouteError({ error }: ErrorComponentProps) {
  if (!(error instanceof RouteChunkLoadError)) throw error;

  return (
    <main id="main-content" className="mx-auto mt-6 max-w-2xl px-3">
      <Alert variant="destructive">
        <Icon icon={TriangleAlertIcon} />
        <AlertTitle>{m.route_load_failed_title()}</AlertTitle>
        <AlertDescription>
          <p>{m.route_load_failed_message()}</p>
          <div className="mt-2">
            <Button variant="destructive" onClick={() => window.location.reload()}>
              {m.error_boundary_reload()}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </main>
  );
}
