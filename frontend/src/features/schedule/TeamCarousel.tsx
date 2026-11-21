import { Children, useRef, type ReactNode } from "react";

/** Controlled team pager with touch swipes; callers provide localised navigation controls. */
export function TeamCarousel({
  activeIndex,
  onSelect,
  children,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      data-team-carousel
      onTouchStart={(event) => {
        const touch = event.touches[0];
        start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        const origin = start.current;
        start.current = null;
        if (!touch || !origin || items.length < 2) return;
        const dx = touch.clientX - origin.x;
        const dy = touch.clientY - origin.y;
        if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
        onSelect((activeIndex + (dx < 0 ? 1 : -1) + items.length) % items.length);
      }}
      onTouchCancel={() => {
        start.current = null;
      }}
    >
      {items[activeIndex]}
    </div>
  );
}
