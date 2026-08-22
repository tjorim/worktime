import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsResetFlow } from "@/pages/settings/hooks/useSettingsResetFlow";
import { applyPreferencesPull, fetchPreferences, type FetchFn } from "@/utils/syncClient";

vi.mock("@/utils/syncClient", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/utils/syncClient")>();
  return {
    ...original,
    applyPreferencesPull: vi.fn(),
    fetchPreferences: vi.fn(),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useSettingsResetFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("discards a pending preference restore after the active account changes", async () => {
    const pendingRestore = deferred<Awaited<ReturnType<typeof fetchPreferences>>>();
    vi.mocked(fetchPreferences).mockReturnValue(pendingRestore.promise);
    const fetchFn = vi.fn() as unknown as FetchFn;
    const sharedProps = {
      resetSettings: vi.fn(),
      clearTimeOffEvents: vi.fn(),
      onHide: vi.fn(),
      showSuccessToast: vi.fn(),
      showWarningToast: vi.fn(),
      isAuthenticated: true,
      fetchFn,
    };
    const { result, rerender } = renderHook(
      ({ accountId }: { accountId: string }) =>
        useSettingsResetFlow({ ...sharedProps, accountId }),
      { initialProps: { accountId: "account-a" } },
    );

    act(() => result.current.handleConfirmReset());
    expect(fetchPreferences).toHaveBeenCalledWith(fetchFn);

    rerender({ accountId: "account-b" });
    await act(async () => {
      pendingRestore.resolve({
        user_id: 1,
        data: { scheduleType: "9-5" },
        client_updated_at: "2026-08-21T00:00:00.000Z",
        created_at: "2026-08-21T00:00:00.000Z",
        updated_at: "2026-08-21T00:00:00.000Z",
      });
      await pendingRestore.promise;
    });

    expect(applyPreferencesPull).not.toHaveBeenCalled();
  });
});
