import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeamCarousel } from "@/components/shared/TeamCarousel";

function renderPager(activeIndex = 0) {
  const onSelect = vi.fn();
  const { container } = render(
    <TeamCarousel activeIndex={activeIndex} onSelect={onSelect}>
      <span>First team</span>
      <span>Second team</span>
      <span>Third team</span>
    </TeamCarousel>,
  );
  return { onSelect, pager: container.firstChild as HTMLElement };
}

function swipe(pager: HTMLElement, x: number, y = 0) {
  fireEvent.touchStart(pager, { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchEnd(pager, { changedTouches: [{ clientX: 100 + x, clientY: 100 + y }] });
}

describe("TeamCarousel", () => {
  it("renders only the selected team and wraps swipes in both directions", () => {
    const { pager, onSelect } = renderPager();
    expect(screen.getByText("First team")).toBeInTheDocument();
    expect(screen.queryByText("Second team")).not.toBeInTheDocument();
    swipe(pager, -60);
    expect(onSelect).toHaveBeenLastCalledWith(1);
    swipe(pager, 60);
    expect(onSelect).toHaveBeenLastCalledWith(2);
  });
  it("ignores taps, vertical scrolling and cancelled gestures", () => {
    const { pager, onSelect } = renderPager();
    swipe(pager, 10);
    swipe(pager, 50, 80);
    fireEvent.touchStart(pager, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchCancel(pager);
    fireEvent.touchEnd(pager, { changedTouches: [{ clientX: 0, clientY: 100 }] });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
