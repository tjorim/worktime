import type { AsyncRouteComponent } from "@tanstack/react-router";
import { createElement, type ComponentType } from "react";

/** Thrown while rendering a lazy route whose chunk could not be loaded. */
export class RouteChunkLoadError extends Error {
  constructor(cause: unknown) {
    super(undefined, { cause });
    this.name = "RouteChunkLoadError";
  }
}

/**
 * Code-split a route component. Behaves like TanStack Router's
 * `lazyRouteComponent` (suspends while loading and exposes `.preload` for
 * intent preloading) but throws a typed `RouteChunkLoadError` on failure and,
 * unlike it, never reloads the page on its own. A failed import is final for the
 * document: browsers remember a failed module fetch, so importing the same chunk
 * again would not reach the network. The error UI therefore offers a reload.
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

  function LazyRoute(props: object) {
    if (failure) throw failure;
    if (!component) throw load();
    return createElement(component, props);
  }
  LazyRoute.preload = load;
  return LazyRoute as never;
}
