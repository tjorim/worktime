import type { AsyncRouteComponent } from "@tanstack/react-router";
import { createElement, type ComponentType } from "react";

/** Thrown while rendering a lazy route whose chunk could not be loaded. */
export class RouteChunkLoadError extends Error {
  constructor(cause: unknown) {
    super(undefined, { cause });
    this.name = "RouteChunkLoadError";
  }
}

const failureResets = new Set<() => void>();

/**
 * Forget every recorded chunk-load failure so the next render of a lazy route
 * downloads its chunk again. Called by the route error UI's "Try again".
 */
export function retryLazyRoutes(): void {
  for (const reset of failureResets) reset();
}

/**
 * Code-split a route component. Behaves like TanStack Router's
 * `lazyRouteComponent` (suspends while loading and exposes `.preload` for
 * intent preloading) but, unlike it, a failed import can be retried in place
 * with `retryLazyRoutes()` instead of only by reloading the page.
 */
export function lazyRoute<T extends Record<string, unknown>, K extends keyof T>(
  importer: () => Promise<T>,
  exportName: K,
): T[K] extends (props: infer P) => unknown ? AsyncRouteComponent<P> : never {
  let component: ComponentType<object> | undefined;
  let pending: Promise<void> | undefined;
  let failure: RouteChunkLoadError | undefined;

  const load = () => {
    pending ??= importer().then(
      (module) => {
        component = module[exportName] as ComponentType<object>;
      },
      (error: unknown) => {
        failure = new RouteChunkLoadError(error);
      },
    );
    return pending;
  };

  failureResets.add(() => {
    failure = undefined;
    pending = undefined;
  });

  function LazyRoute(props: object) {
    if (failure) throw failure;
    if (!component) throw load();
    return createElement(component, props);
  }
  LazyRoute.preload = load;
  return LazyRoute as never;
}
