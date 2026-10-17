import { describe, expect, it, vi } from "vitest";
import { lazyRoute, retryLazyRoutes, RouteChunkLoadError } from "@/lib/lazyRoute";

describe("lazyRoute", () => {
  it("suspends until the chunk loads, then renders the component", async () => {
    const Page = () => null;
    const importer = vi.fn().mockResolvedValue({ Page });
    const Lazy = lazyRoute(importer, "Page") as unknown as {
      (props: object): unknown;
      preload: () => Promise<void>;
    };

    let thrown: unknown;
    try {
      Lazy({});
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Promise);
    await thrown;

    expect(Lazy({})).toMatchObject({ type: Page });
    expect(importer).toHaveBeenCalledOnce();
  });

  it("shares one import between preload and render", async () => {
    const importer = vi.fn().mockResolvedValue({ Page: () => null });
    const Lazy = lazyRoute(importer, "Page") as unknown as { preload: () => Promise<void> };

    await Promise.all([Lazy.preload(), Lazy.preload()]);

    expect(importer).toHaveBeenCalledOnce();
  });

  it("throws a RouteChunkLoadError after a failed import and re-imports on retry", async () => {
    const Page = () => null;
    const importer = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"))
      .mockResolvedValueOnce({ Page });
    const Lazy = lazyRoute(importer, "Page") as unknown as {
      (props: object): unknown;
      preload: () => Promise<void>;
    };

    await Lazy.preload();
    expect(() => Lazy({})).toThrow(RouteChunkLoadError);
    // Failure is sticky until explicitly retried, so a re-render cannot loop on the network.
    expect(importer).toHaveBeenCalledOnce();

    retryLazyRoutes();
    await Lazy.preload();

    expect(importer).toHaveBeenCalledTimes(2);
    expect(Lazy({})).toMatchObject({ type: Page });
  });
});
