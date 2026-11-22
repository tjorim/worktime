import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTimeOffExport } from "@/hooks/useTimeOffExport";

const store = vi.hoisted(() => ({
  entries: [{ id: "time-off" }] as { id: string }[],
  rawText: "2026/11/02 Holiday",
}));
const toast = vi.hoisted(() => ({ showError: vi.fn(), showSuccess: vi.fn() }));

vi.mock("@/app/providers/EventStoreContext", () => ({ useEventStore: () => store }));
vi.mock("@/app/providers/ToastContext", () => ({ useToast: () => toast }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("useTimeOffExport", () => {
  it("downloads the event store's .hday text and releases the download URL", async () => {
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:time-off");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe("timeoff.hday");
      expect(this.href).toBe("blob:time-off");
    });

    const { result } = renderHook(useTimeOffExport);
    result.current();

    expect(click).toHaveBeenCalledOnce();
    const blob = createUrl.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(await (blob as Blob).text()).toBe(store.rawText);
    expect(revokeUrl).toHaveBeenCalledWith("blob:time-off");
    expect(toast.showSuccess).toHaveBeenCalledOnce();
  });
});
