import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJsonDraft } from "@/features/timeTracking/useJsonDraft";
const { block, unblock } = vi.hoisted(() => ({ block: vi.fn(), unblock: vi.fn() }));
const router = { history: { block } };
vi.mock("@tanstack/react-router", () => ({ useRouter: () => router }));
beforeEach(() => {
  block.mockReset().mockReturnValue(unblock);
  unblock.mockClear();
});
describe("JSON draft lifetime", () => {
  it("refreshes clean content and protects dirty navigation including history", () => {
    const { result, rerender, unmount } = renderHook(({ source }) => useJsonDraft(source), {
      initialProps: { source: "first" },
    });
    rerender({ source: "second" });
    expect(result.current.value).toBe("second");
    act(() => result.current.setValue("authored"));
    const options = block.mock.calls.at(-1)![0];
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    expect(options.blockerFn()).toBe(true);
    confirm.mockReturnValue(true);
    expect(options.blockerFn()).toBe(false);
    rerender({ source: "third" });
    expect(result.current.value).toBe("authored");
    expect(result.current.conflict).toBe(true);
    act(() => result.current.reconcile());
    expect(result.current.value).toBe("authored");
    expect(result.current.conflict).toBe(false);
    unmount();
    expect(unblock).toHaveBeenCalled();
  });
});

afterEach(() => vi.unstubAllGlobals());
