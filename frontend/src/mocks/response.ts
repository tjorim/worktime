import { HttpResponse, type HttpResponseInit } from "msw/http";
import type { JsonBodyType } from "msw";

/** No inference: every ordinary successful fixture must name its generated wire type. */
export function jsonResponse<Body extends JsonBodyType = never>(
  body: NoInfer<Body>,
  init?: HttpResponseInit,
): Response {
  return HttpResponse.json(body, init);
}

/** Deliberately outside the backend success contract; keep the reason visible at each call. */
export function uncheckedJson(
  reason: "error" | "malformed" | "control" | "hday-helper",
  body: unknown,
  init?: HttpResponseInit,
): Response {
  void reason;
  return HttpResponse.json(body as JsonBodyType, init);
}

/** Playwright's fulfil options, with the same explicit contract requirement as MSW. */
export function routeJson<Body = never>(body: NoInfer<Body>): { json: Body } {
  return { json: body };
}

/** For injected fetch doubles that expose json() rather than constructing a Response. */
export function jsonBody<Body = never>(body: NoInfer<Body>): Body {
  return body;
}

export function uncheckedBody(
  reason: "error" | "malformed" | "control" | "hday-helper",
  body: unknown,
): unknown {
  void reason;
  return body;
}
