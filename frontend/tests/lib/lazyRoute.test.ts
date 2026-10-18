import { describe, expect, it, vi } from "vitest";
import { lazyRoute, RouteChunkLoadError } from "@/lib/lazyRoute";

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

  it("throws a RouteChunkLoadError after a failed import and does not import again", async () => {
    const importer = vi
      .fn()
      .mockRejectedValue(new Error("Failed to fetch dynamically imported module"));
    const Lazy = lazyRoute(importer, "Page") as unknown as {
      (props: object): unknown;
      preload: () => Promise<void>;
    };

    await Lazy.preload();

    expect(() => Lazy({})).toThrow(RouteChunkLoadError);
    expect(() => Lazy({})).toThrow(RouteChunkLoadError);
    // Browsers remember a failed module fetch, so another import() would not reach the network.
    expect(importer).toHaveBeenCalledOnce();
  });
});
